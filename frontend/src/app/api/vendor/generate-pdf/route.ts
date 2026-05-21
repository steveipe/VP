import { NextRequest, NextResponse } from "next/server";
import jsPDF from "jspdf";
import { createLocalJob, updateLocalJob, type ProposalSectionsLike, PROPOSAL_SECTION_KEYS, sanitizeText } from "@/lib/appApi";

export const runtime = "nodejs";

type PdfJobResult = {
  pdf_base64: string;
};

function wrapText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 7): number {
  const lines = doc.splitTextToSize(sanitizeText(text), maxWidth) as string[];
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function buildPdfBase64(input: {
  title: string;
  vendorName: string;
  contractTitle: string;
  totalPrice?: string;
  timeline?: string;
  sections: ProposalSectionsLike;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  y = wrapText(doc, input.title || "Vendor Proposal", margin, y, pageWidth - margin * 2, 24) + 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  y = wrapText(doc, `Vendor: ${input.vendorName || "Vendor"}`, margin, y, pageWidth - margin * 2, 14) + 2;
  y = wrapText(doc, `Contract: ${input.contractTitle || "Proposal"}`, margin, y, pageWidth - margin * 2, 14) + 2;
  if (input.totalPrice) y = wrapText(doc, `Price: ${input.totalPrice}`, margin, y, pageWidth - margin * 2, 14) + 2;
  if (input.timeline) y = wrapText(doc, `Timeline: ${input.timeline}`, margin, y, pageWidth - margin * 2, 14) + 12;

  for (const key of PROPOSAL_SECTION_KEYS) {
    const label = key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
    const content = sanitizeText(input.sections[key] || "");

    if (y > 720) {
      doc.addPage();
      y = margin;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    y = wrapText(doc, label, margin, y, pageWidth - margin * 2, 16) + 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    y = wrapText(doc, content || "No content provided.", margin, y, pageWidth - margin * 2, 12) + 10;
  }

  return Buffer.from(doc.output("arraybuffer")).toString("base64");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const vendorResponse = body?.vendorResponse;

    if (!vendorResponse || typeof vendorResponse !== "object") {
      return NextResponse.json({ error: "vendorResponse is required and must be an object" }, { status: 400 });
    }

    const job = createLocalJob<PdfJobResult>({ status: "running", progress: { message: "Generating PDF", percent: 50 } });
    const pdf_base64 = buildPdfBase64(vendorResponse);

    updateLocalJob<PdfJobResult>(job.id, {
      status: "completed",
      progress: { message: "PDF ready", percent: 100 },
      result: { pdf_base64 },
    });

    return NextResponse.json({ job_id: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
