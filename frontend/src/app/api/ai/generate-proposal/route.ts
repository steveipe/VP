import { NextRequest, NextResponse } from "next/server";
import {
  PROPOSAL_SECTION_KEYS,
  buildPriceFromText,
  buildProposalSections,
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
  const label = sectionKey.replace(/_/g, " ");
  const lead = splitParagraphs(current)[0] || sectionTemplate(sectionKey, rfpContext, vendorName, contractTitle);
  const contextLead = splitParagraphs(rfpContext)[0] || rfpContext.slice(0, 220) || "the uploaded requirements";

  return `${lead}

Expanded narrative:
The uploaded proposal already positions this section around ${contextLead}. Keep the wording faithful to the source document while fleshing out the operational detail that a reviewer expects in a submission-ready proposal for ${contractTitle || "the project"}.

Implementation detail:
- Restate the concrete commitments already present in the uploaded proposal.
- Add a fuller explanation of how ${label} supports the overall delivery plan.
- Call out assumptions, dependencies, and review points that are implied by the source.
- Close with a clear handoff to the next section so the document reads as a complete proposal.

Review note:
Use precise language, avoid inventing facts, and preserve the evidence, timeline, commercial terms, and deliverable structure from the uploaded document.`;
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
      const edited = current
        ? `${current}\n\nUpdated to reflect: ${editInstructions || "the requested edit."}`
        : `${sectionToEdit} for ${contractTitle}: ${editInstructions || "Refine this section with clear, concise details."}`;
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
