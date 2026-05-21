import { NextRequest, NextResponse } from "next/server";
import { buildChartDataFromSections, critiqueSections, refineSections } from "@/lib/appApiRefine";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = String(body?.mode || "");
    const sections = (body?.sections && typeof body.sections === "object") ? body.sections : {};
    const rfpContext = String(body?.rfp_context || "");
    const critique = body?.critique;

    if (mode === "extract_data") {
      return NextResponse.json({ chart_data: buildChartDataFromSections(sections as Record<string, string>) });
    }

    if (mode === "critique") {
      return NextResponse.json({ critique: critiqueSections(sections as Record<string, string>, rfpContext) });
    }

    if (mode === "refine_all") {
      return NextResponse.json({ refined: { improved_sections: refineSections(sections as Record<string, string>, critique, rfpContext), changes_summary: "Sections were refined with clearer, more specific language." } });
    }

    return NextResponse.json({ error: "Unsupported mode" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
