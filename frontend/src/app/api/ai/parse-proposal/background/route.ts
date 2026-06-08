import { NextRequest, NextResponse } from "next/server";
import { createLocalJob, updateLocalJob, sanitizeText, buildProposalSections } from "@/lib/appApi";
import { parseUploadedProposalWithAi } from "@/lib/proposalUploadParser";
import { extractPdfTextWithOcrFallback } from "@/lib/pdfExtraction";

export const runtime = "nodejs";

type ParseProposalResult = {
  proposal_title: string;
  sections: Record<string, string>;
  extracted_price: string;
  extracted_timeline: string;
};

async function readUploadText(body: Record<string, unknown>): Promise<string> {
  if (typeof body.text === "string" && body.text.trim()) return sanitizeText(body.text);

  if (typeof body.file_base64 === "string" && body.file_base64.trim()) {
    const base64 = body.file_base64.replace(/^data:.*;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    const contentType = typeof body.content_type === "string" ? body.content_type.toLowerCase() : "";
    const fileName = typeof body.file_name === "string" ? body.file_name.toLowerCase() : "";
    const isPdf = contentType.includes("pdf") || fileName.endsWith(".pdf");

    if (isPdf) {
      try {
        const extraction = await extractPdfTextWithOcrFallback(buffer, { minTextChars: 80, maxOcrPages: 8 });
        const extractedText = sanitizeText(extraction.text || "");
        if (extractedText) return extractedText;
      } catch (err) {
        console.error("[parse-proposal] PDF extraction failed, falling back to text decode:", err);
      }
    }

    const decoded = sanitizeText(buffer.toString("utf8"));
    if (decoded) return decoded;
    return sanitizeText(String(body.file_name || ""));
  }

  return "";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const text = await readUploadText(body);
    const job = createLocalJob<ParseProposalResult>({ status: "running", progress: { message: "Parsing proposal", percent: 50 } });

    let result: ParseProposalResult;
    try {
      const parsed = await parseUploadedProposalWithAi(text || "", String(body.file_name || "Vendor"), "Proposal");
      result = {
        proposal_title: parsed.proposal_title,
        sections: parsed.sections,
        extracted_price: parsed.extracted_price,
        extracted_timeline: parsed.extracted_timeline,
      };
    } catch (err) {
      console.error("[parse-proposal] AI parse failed, falling back to heuristics:", err);
      const fallbackText = sanitizeText(text || String(body.file_name || "Uploaded proposal"));
      result = {
        proposal_title: `${String(body.file_name || "Uploaded Proposal")} Proposal`,
        sections: buildProposalSections(fallbackText || "Uploaded proposal content was not readable.", String(body.file_name || "Vendor"), "Proposal"),
        extracted_price: "",
        extracted_timeline: "",
      };
    }

    updateLocalJob<ParseProposalResult>(job.id, {
      status: "completed",
      progress: { message: "Parse complete", percent: 100 },
      result,
    });

    return NextResponse.json({ job_id: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
