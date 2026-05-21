import { NextRequest, NextResponse } from "next/server";
import { AGENT_MODEL, openRouterChatJSON } from "@/lib/openrouter";
import { buildRfpAnalysis, createLocalJob, sanitizeText, updateLocalJob } from "@/lib/appApi";
import { extractPdfTextWithOcrFallback } from "@/lib/pdfExtraction";

export const runtime = "nodejs";

type ParseRfpResult = ReturnType<typeof buildRfpAnalysis>;

async function readRfpText(body: Record<string, unknown>): Promise<string> {
  if (typeof body.rfp_text === "string" && body.rfp_text.trim()) {
    return sanitizeText(body.rfp_text);
  }

  if (typeof body.file_base64 === "string" && body.file_base64.trim()) {
    const base64 = body.file_base64.replace(/^data:.*;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    const extracted = await extractPdfTextWithOcrFallback(buffer, { minTextChars: 80, maxOcrPages: 8 });
    return sanitizeText(extracted.text);
  }

  return "";
}

function normalizeParsedAnalysis(raw: unknown, fallbackText: string): ParseRfpResult {
  const fallback = buildRfpAnalysis(fallbackText || "");
  if (!raw || typeof raw !== "object") return fallback;

  const source = raw as Record<string, unknown>;
  const toStringArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.map((item) => sanitizeText(String(item || ""))).filter(Boolean)
      : [];

  return {
    summary: sanitizeText(String(source.summary || fallback.summary || "")) || fallback.summary,
    key_requirements: toStringArray(source.key_requirements).length ? toStringArray(source.key_requirements) : fallback.key_requirements,
    technical_requirements: toStringArray(source.technical_requirements).length ? toStringArray(source.technical_requirements) : fallback.technical_requirements,
    deliverables: toStringArray(source.deliverables).length ? toStringArray(source.deliverables) : fallback.deliverables,
    evaluation_criteria: toStringArray(source.evaluation_criteria).length ? toStringArray(source.evaluation_criteria) : fallback.evaluation_criteria,
    required_certifications: toStringArray(source.required_certifications).length ? toStringArray(source.required_certifications) : fallback.required_certifications,
    budget_range: sanitizeText(String(source.budget_range || fallback.budget_range || "")) || fallback.budget_range,
    timeline_expectations: sanitizeText(String(source.timeline_expectations || fallback.timeline_expectations || "")) || fallback.timeline_expectations,
    submission_requirements: toStringArray(source.submission_requirements).length ? toStringArray(source.submission_requirements) : fallback.submission_requirements,
    questions_for_vendor: toStringArray(source.questions_for_vendor).length ? toStringArray(source.questions_for_vendor) : fallback.questions_for_vendor,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const rfpText = await readRfpText(body);
    const job = createLocalJob<ParseRfpResult>({ status: "running", progress: { message: "Parsing RFP", percent: 50 } });

    let result = buildRfpAnalysis(rfpText || "");

    if (rfpText) {
      try {
        const parsed = await openRouterChatJSON<Partial<ParseRfpResult>>({
          model: AGENT_MODEL.DOCUMENT_ANALYSIS,
          temperature: 0.2,
          max_tokens: 2500,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are a JSON-only RFP analyst. Extract the key requirements, technical requirements, deliverables, evaluation criteria, certifications, budget, timeline expectations, submission requirements, and questions for the vendor. Return concise but accurate arrays of short strings. Do not add markdown or explanations.",
            },
            {
              role: "user",
              content: `Analyze this uploaded RFP and return JSON with this exact shape:\n{\n  \"summary\": \"\",\n  \"key_requirements\": [\"\"],\n  \"technical_requirements\": [\"\"],\n  \"deliverables\": [\"\"],\n  \"evaluation_criteria\": [\"\"],\n  \"required_certifications\": [\"\"],\n  \"budget_range\": \"\",\n  \"timeline_expectations\": \"\",\n  \"submission_requirements\": [\"\"],\n  \"questions_for_vendor\": [\"\"]\n}\n\nUploaded RFP text:\n${rfpText.slice(0, 18000)}`,
            },
          ],
        });

        result = normalizeParsedAnalysis(parsed, rfpText);
      } catch {
        result = buildRfpAnalysis(rfpText);
      }
    }

    updateLocalJob<ParseRfpResult>(job.id, {
      status: "completed",
      progress: { message: "Analysis complete", percent: 100 },
      result,
    });

    return NextResponse.json({ job_id: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
