import { NextRequest, NextResponse } from "next/server";
import {
  PROPOSAL_SECTION_KEYS,
  buildPriceFromText,
  buildProposalSections,
  buildSectionAdditionalSentences,
  buildTimelineFromText,
  sanitizeText,
  sectionTemplate,
  splitParagraphs,
  type ProposalSectionKey,
  type ProposalSectionsLike,
} from "@/lib/appApi";
import { parseUploadedProposalWithAi } from "@/lib/proposalUploadParser";

export const runtime = "nodejs";

function emptySections(): ProposalSectionsLike {
  return Object.fromEntries(PROPOSAL_SECTION_KEYS.map((key) => [key, ""])) as ProposalSectionsLike;
}

function detailedExpansion(sectionKey: ProposalSectionKey, current: string, rfpContext: string, vendorName: string, contractTitle: string) {
  const cleanCurrent = sanitizeText(current);
  if (!cleanCurrent) return cleanCurrent;
  const label = sectionKey.replace(/_/g, " ");
  const expanded = buildSectionAdditionalSentences(cleanCurrent, label, contractTitle, vendorName);
  // Avoid repeating the same opening sentence twice. If the expansion
  // begins with the same first sentence as the original content,
  // strip the duplicated leading sentence from the expansion before
  // concatenating.
  const firstSentenceMatch = cleanCurrent.match(/^(.*?[\.\!\?])(\s|$)/);
  const firstSentence = firstSentenceMatch ? firstSentenceMatch[1].trim() : "";
  let expansionBody = expanded;
  if (firstSentence && expansionBody.startsWith(firstSentence)) {
    expansionBody = expansionBody.slice(firstSentence.length).trim();
    // If expansionBody still begins with punctuation or extra separators, remove them
    expansionBody = expansionBody.replace(/^[:\-–—\s\n]+/, "");
  }

  // If the expansion accidentally repeated the original content or its
  // first sentence elsewhere, remove that duplicate text to avoid showing
  // the same information twice in the editor.
  if (cleanCurrent && expansionBody.includes(cleanCurrent)) {
    expansionBody = expansionBody.replace(cleanCurrent, "").trim();
  } else if (firstSentence && expansionBody.includes(firstSentence)) {
    expansionBody = expansionBody.replace(firstSentence, "").trim();
  }

  // If expansionBody is insubstantial after removals (e.g. "It includes ."),
  // don't append it.
  // Remove leftover empty connectors like "It includes ." if they remain
  expansionBody = expansionBody.replace(/\bIt includes\b\s*[\.:;\-–—]*\s*/i, "").trim();

  if ((expansionBody.replace(/[^A-Za-z0-9]/g, "")).length < 5) {
    expansionBody = "";
  }

  return `${cleanCurrent}${expansionBody ? `\n\n${expansionBody}` : ""}`;
}

function fullProposal(chatHistory: unknown, rfpContext: string, vendorName: string, contractTitle: string) {
  const context = sanitizeText(rfpContext);
  const lead = splitParagraphs(context)[0] || context.slice(0, 240) || "This proposal responds to the stated requirements and delivery expectations.";
  const sections = buildProposalSections(context || lead, vendorName || "Vendor", contractTitle || "Proposal");

  sections.vendor_information = sectionTemplate("vendor_information", lead, vendorName, contractTitle);
  sections.company_profile = sectionTemplate("company_profile", lead, vendorName, contractTitle);
  sections.project_understanding = `Our understanding of ${contractTitle || "the project"} is based on the RFP requirements, timeline, and priorities raised in the conversation. ${lead}`;
  sections.proposed_solution = `We recommend a practical, phased solution for ${contractTitle || "the project"} that stays focused on delivery, clarity, and measurable outcomes.`;
  sections.deliverables = sectionTemplate("deliverables", lead, vendorName, contractTitle);
  sections.project_timeline = `Proposed timeline: ${buildTimelineFromText(context) || "to be finalized during implementation planning"}.`;
  sections.cost_proposal = `Cost proposal: ${buildPriceFromText(context) || "to be finalized based on scope confirmation"}.`;
  sections.team_details = sectionTemplate("team_details", lead, vendorName, contractTitle);
  sections.past_experience = sectionTemplate("past_experience", lead, vendorName, contractTitle);
  sections.risk_management = sectionTemplate("risk_management", lead, vendorName, contractTitle);
  sections.support_maintenance = sectionTemplate("support_maintenance", lead, vendorName, contractTitle);
  sections.graphs_visualizations = sectionTemplate("graphs_visualizations", lead, vendorName, contractTitle);
  sections.terms_conditions = sectionTemplate("terms_conditions", lead, vendorName, contractTitle);
  sections.document_uploads = sectionTemplate("document_uploads", lead, vendorName, contractTitle);
  sections.final_declaration = sectionTemplate("final_declaration", lead, vendorName, contractTitle);

  // If chatHistory contains user-provided content from the Build-from-Scratch flow,
  // map the final response from each question block to the canonical proposal
  // section keys. This avoids stale or corrected answers being written into
  // later Sections when the user retries or a prompt is repeated.
  try {
    if (Array.isArray(chatHistory) && chatHistory.length > 0) {
      const normalizedMessages = (chatHistory as any[])
        .filter((m) => m && typeof m.role === "string" && String(m.content || "").trim())
        .map((m) => ({ role: String(m.role).toLowerCase(), content: String(m.content).trim() }));

      const finalUserResponses: string[] = [];
      for (let i = 0; i < normalizedMessages.length - 1; i++) {
        const current = normalizedMessages[i];
        const next = normalizedMessages[i + 1];
        if (current.role === "user" && next.role === "assistant") {
          const assistantText = next.content.trim();
          if (assistantText.startsWith("Received.") || assistantText.startsWith("Got it.")) {
            finalUserResponses.push(current.content);
          }
        }
      }

      // If no acknowledged responses were found, fall back to the final user replies.
      if (finalUserResponses.length === 0) {
        let lastUserResponse = "";
        for (const msg of normalizedMessages) {
          if (msg.role === "user") {
            lastUserResponse = msg.content;
          }
        }
        if (lastUserResponse) {
          finalUserResponses.push(lastUserResponse);
        }
      }

      // Assign in-order but skip `vendor_information` so user inputs map to
      // the more content-focused sections (company_profile onward).
      const vendorIndex = PROPOSAL_SECTION_KEYS.indexOf("vendor_information");
      const startIndex = vendorIndex >= 0 ? vendorIndex + 1 : 0;
      for (let i = 0; i < finalUserResponses.length; i++) {
        const targetIdx = startIndex + i;
        if (targetIdx >= PROPOSAL_SECTION_KEYS.length) break;
        const key = PROPOSAL_SECTION_KEYS[targetIdx];
        if (finalUserResponses[i]) sections[key] = finalUserResponses[i];
      }

      // Expand each user-provided section so the Edit & Refine view shows
      // an enriched, proposal-ready version rather than the raw user input.
      try {
        for (let i = 0; i < finalUserResponses.length; i++) {
          const targetIdx = startIndex + i;
          if (targetIdx >= PROPOSAL_SECTION_KEYS.length) break;
          const key = PROPOSAL_SECTION_KEYS[targetIdx] as ProposalSectionKey;
          const current = String(sections[key] || "").trim();
          if (!current) continue;
          sections[key] = detailedExpansion(key, current, rfpContext, vendorName, contractTitle);
        }
      } catch (err) {
        console.warn("[generate-proposal] failed to expand mapped user sections:", err);
      }
    }
  } catch (err) {
    // Non-fatal: fallback to template-generated sections
    console.warn("[generate-proposal] failed to map chat history to sections:", err);
  }

  return {
    sections,
    proposal_title: contractTitle ? `${contractTitle} Proposal` : "Vendor Proposal",
    total_price: buildPriceFromText(context) || "",
    timeline_summary: buildTimelineFromText(context) || "",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = String(body?.mode || "full");
    const contractTitle = String(body?.contract_title || "Proposal");
    const vendorName = String(body?.vendor_name || "Vendor");
    const rfpContext = sanitizeText(String(body?.rfp_context || ""));
    const existingProposal = sanitizeText(String(body?.existing_proposal || ""));
    const sectionToEdit = String(body?.section_to_edit || "");
    const editInstructions = sanitizeText(String(body?.edit_instructions || ""));

    if (mode === "parse_upload") {
      const parsed = await parseUploadedProposalWithAi(existingProposal || rfpContext || "", vendorName, contractTitle);
      return NextResponse.json({
        parsed_proposal: {
          proposal_title: parsed.proposal_title,
          sections: parsed.sections,
          extracted_price: parsed.extracted_price,
          extracted_timeline: parsed.extracted_timeline,
        },
      });
    }

    if (mode === "edit_section") {
      const current = existingProposal.trim();
      const instructionText = String(editInstructions || "").trim().replace(/\s+$/, "");
      const instructionSentence = instructionText ? `${instructionText.replace(/[\.\!\?]$/, "")}.` : "Please refine this section with clearer, more detailed language.";
      const edited = current
        ? `${current}\n\n${instructionSentence}`
        : `${sectionToEdit} for ${contractTitle}: ${instructionSentence}`;
      return NextResponse.json({ edited_section: edited.trim() });
    }

    if (mode === "expand_section") {
      const sectionKey = String(body?.section_key || sectionToEdit) as ProposalSectionKey;
      const sectionContent = sanitizeText(String(body?.section_content || existingProposal || ""));
      const expanded = detailedExpansion(sectionKey, sectionContent, rfpContext, vendorName, contractTitle);
      return NextResponse.json({ expanded_section: expanded.trim() });
    }

    if (mode === "batch_expand") {
      const sectionKeys = Array.isArray(body?.section_keys) ? body.section_keys : [];
      const allSections = (body?.all_sections && typeof body.all_sections === "object") ? body.all_sections as Record<string, string> : {};
      const expandedSections: Record<string, string> = {};

      for (const key of sectionKeys) {
        const sectionKey = String(key) as ProposalSectionKey;
        const current = sanitizeText(String(allSections[String(key)] || ""));
        expandedSections[String(key)] = detailedExpansion(sectionKey, current, rfpContext, vendorName, contractTitle);
      }

      return NextResponse.json({ expanded_sections: expandedSections });
    }

    if (mode === "executive_summary") {
      return NextResponse.json({
        executive_summary: `This proposal for ${contractTitle} presents a focused response aligned to the RFP requirements, delivery expectations, and commercial priorities. It highlights the vendor's capability, approach, timeline, and support model in a concise executive summary.`,
      });
    }

    return NextResponse.json({ proposal: fullProposal(body?.chat_history, rfpContext, vendorName, contractTitle) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
