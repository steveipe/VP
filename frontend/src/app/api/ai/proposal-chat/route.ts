import { NextRequest, NextResponse } from "next/server";
import { openRouterChat, AGENT_MODEL } from "@/lib/openrouter";
import { langfuse } from "@/config/langfuse";

/* ─── Ordered section interview plan (0-14) ─── */
const SECTION_PLAN = [
  { key: "company_profile", label: "Company Profile", questions: "Core services offered, industries served, number of employees, certifications/accreditations, brief company description" },
  { key: "project_understanding", label: "Project Understanding", questions: "Their understanding of requirements, core problem being addressed, key functional requirements, desired outcomes/goals" },
  { key: "proposed_solution", label: "Proposed Solution", questions: "Solution overview, technologies/tools, architecture/infrastructure, methodology (Agile, Waterfall, etc.)" },
  { key: "deliverables", label: "Deliverables", questions: "Key deliverables list, modules/components, documentation to be provided" },
  { key: "project_timeline", label: "Project Timeline", questions: "Estimated project duration, key milestones with dates, project phases (Discovery, Development, Testing, Deployment)" },
  { key: "cost_proposal", label: "Cost Proposal", questions: "Total estimated cost, breakdown by phase/deliverable, payment terms, preferred currency" },
  { key: "team_details", label: "Team Details", questions: "Team members and roles, relevant experience per member, designated project manager" },
  { key: "past_experience", label: "Past Experience", questions: "Similar projects completed, client names (if shareable), outcomes and impact of past work" },
  { key: "risk_management", label: "Risk Management", questions: "Potential project risks they foresee, risk mitigation strategies, contingency plan if things goes wrong" },
  { key: "support_maintenance", label: "Support & Maintenance", questions: "Post-project support plan, support duration and SLA, type of support (on-site, remote, hybrid)" },
  { key: "graphs_visualizations", label: "Graphs & Visualizations", questions: "Would they like timeline charts, cost distribution visuals, team structure diagrams, risk matrix included in the proposal?" },
  { key: "terms_conditions", label: "Terms & Conditions", questions: "Warranty period, IP ownership terms, confidentiality/NDA requirements, termination clause" },
  { key: "document_uploads", label: "Document Uploads", questions: "Certificates, licenses, portfolio samples, case studies they want to reference or attach" },
  { key: "final_declaration", label: "Final Declaration", questions: "Confirmation of accuracy, authorized signatory name and title, date" },
];

const INCOMPLETE_REPLY_PATTERN = /\b(?:not clear|unclear|missing|incomplete|please clarify|please provide|please confirm|need more|can you|could you|not enough|wrong|incorrect|insufficient|details? (?:are )?(?:missing|unclear)|still needed)\b/i;

function isIncompleteReply(reply: string): boolean {
  return INCOMPLETE_REPLY_PATTERN.test(reply);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, rfp_context, section_index } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "messages array is required" }, { status: 400 });
    }

    // section_index tells us WHICH section to ask about NOW (0-14, or 15 = all done)
    const maxIndex = SECTION_PLAN.length;
    const idx = typeof section_index === "number" ? Math.min(Math.max(section_index, 0), maxIndex) : 0;
    const allDone = idx >= maxIndex;
    const currentSection = allDone ? null : SECTION_PLAN[idx];

    // Build a simple checklist for context
    const checklist = SECTION_PLAN.map((s, i) => {
      if (i < idx) return `  ✅ ${i + 1}. ${s.label} (DONE)`;
      if (i === idx) return `  ► ${i + 1}. ${s.label} — ASK NOW: ${s.questions}`;
      return `  ⬜ ${i + 1}. ${s.label}`;
    }).join("\n");

    let systemPrompt: string;

    if (allDone) {
      systemPrompt = `You are an expert proposal consultant. The vendor interview is COMPLETE — all 15 sections have been covered.

Give a brief summary of what was collected and confirm that the proposal is ready for generation. Include [PROPOSAL_READY] in your response.`;
    } else {
      systemPrompt = `You are an expert proposal consultant interviewing a vendor to build a proposal. You are asking about ONE specific section.

RFP CONTEXT:
${rfp_context || "No specific RFP context provided."}

═══ PROGRESS (${idx}/${SECTION_PLAN.length} Complete) ═══
${checklist}

YOUR TASK:
Ask the vendor about Section ${idx + 1}: "${currentSection!.label}"

Specific topics to cover: ${currentSection!.questions}

RULES:
1. Start with "📋 ${currentSection!.label}:" then ask your questions.
2. If the user already answered some sub-questions in their message, acknowledge briefly and ask about the REMAINING sub-questions.
3. Group all sub-questions for this section into ONE clear, organized question.
4. Keep it conversational and professional. Be concise — no lengthy preambles.
5. Always verify the answer against prior vendor replies and earlier sections. If the answer is wrong, inconsistent, or conflicts with existing data, say the section is not yet complete and ask the vendor to correct or confirm it.
6. If the information is missing, unclear, or appears incorrect, ask the vendor to provide the correct detail instead of guessing.
7. Only move on when the current section's response is accurate and complete.
8. Do NOT ask about any other section. ONLY "${currentSection!.label}".
9. When the vendor has provided correct and complete information, do not ask for extra confirmation. Instead, state that the information is correct and continue with the next question/section in the same chat.
10. If any detail is missing, unclear, or appears incorrect, explicitly list what is still required and do NOT append [SECTION_COMPLETE].
11. At the end of your response, append [SECTION_COMPLETE] only if this section is fully answered with all required details.
12. Do NOT include [PROPOSAL_READY] — there are still ${SECTION_PLAN.length - idx} sections remaining.`;
    }

    const reply = await openRouterChat({
      model: AGENT_MODEL.RFP_WRITING,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      max_tokens: 1000,
      temperature: 0.6,
    }) || "I apologize, could you repeat that?";

    const isSectionComplete = reply.includes("[SECTION_COMPLETE]");
    const isIncomplete = isIncompleteReply(reply);
    const shouldAdvance = isSectionComplete && !isIncomplete;
    let cleanedReply = reply.replace(/\[SECTION_COMPLETE\]|\[PROPOSAL_READY\]/g, "").trim();
    const isReady = reply.includes("[PROPOSAL_READY]") || allDone;

    // The next section_index for the client to send on the NEXT call
    const nextIndex = allDone ? maxIndex : idx + (shouldAdvance ? 1 : 0);

    // If advancing to next section and not all done, append the next section's question to the same chat
    if (shouldAdvance && nextIndex < maxIndex) {
      const nextSection = SECTION_PLAN[nextIndex];
      cleanedReply += `\n\n📋 ${nextSection.label}\n${nextSection.questions}`;
    }

    return NextResponse.json({
      reply: cleanedReply,
      proposal_ready: isReady,
      section_index: Math.min(nextIndex, maxIndex),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process chat";
    console.error("Proposal chat error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await langfuse.flushAsync();
  }
}
