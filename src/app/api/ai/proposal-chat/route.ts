import { NextRequest, NextResponse } from "next/server";
import { openRouterChat } from "@/lib/openrouter";

const PROPOSAL_SECTIONS: (keyof import("@/services/aiService").ProposalSections)[] = [
  "company_profile",
  "project_understanding",
  "proposed_solution",
  "deliverables",
  "project_timeline",
  "cost_proposal",
  "team_details",
  "past_experience",
  "risk_management",
  "support_maintenance",
  "graphs_visualizations",
  "terms_conditions",
  "document_uploads",
  "final_declaration",
];

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const rfpContext = typeof body.rfp_context === "string" ? body.rfp_context : "";
    const sectionIndex = typeof body.section_index === "number" ? body.section_index : 0;

    const sectionName = PROPOSAL_SECTIONS[sectionIndex] || PROPOSAL_SECTIONS[PROPOSAL_SECTIONS.length - 1];
    let systemPrompt = `You are a short proposal assistant.\n\nCurrent section: Section ${sectionIndex + 1} - ${sectionName}\n\nAsk only the current section question. Do not add summaries, explanations, or extra detail.\nIf all ${PROPOSAL_SECTIONS.length} sections are complete, respond with PROPOSAL_READY.`;

    if (rfpContext) {
      systemPrompt += `\n\nRFP context:\n${rfpContext}`;
    }

    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((msg: any) => ({ role: msg.role, content: String(msg.content) })),
    ];

    const reply = await openRouterChat({
      messages: fullMessages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const proposalReady = reply.includes("PROPOSAL_READY");
    const cleanedReply = reply.replace(/PROPOSAL_READY/g, "").trim();

    let nextSectionIndex = sectionIndex;
    if (proposalReady || sectionIndex >= PROPOSAL_SECTIONS.length - 1) {
      nextSectionIndex = PROPOSAL_SECTIONS.length;
    } else if (/section|next|continue/i.test(reply)) {
      nextSectionIndex = sectionIndex + 1;
    }

    return NextResponse.json({
      reply: cleanedReply,
      proposal_ready: proposalReady,
      section_index: nextSectionIndex,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
