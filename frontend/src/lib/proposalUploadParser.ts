import { AGENT_MODEL, openRouterChatJSON } from "@/lib/openrouter";
import {
  PROPOSAL_SECTION_KEYS,
  buildPriceFromText,
  buildProposalSections,
  buildTimelineFromText,
  sanitizeText,
  type ProposalSectionKey,
  type ProposalSectionsLike,
} from "@/lib/appApi";

export interface ParsedUploadedProposalResult {
  proposal_title: string;
  sections: ProposalSectionsLike;
  extracted_price: string;
  extracted_timeline: string;
}

function normalizeSections(rawSections: unknown, fallbackText: string, vendorName: string, contractTitle: string): ProposalSectionsLike {
  const fallbackSections = buildProposalSections(fallbackText || "Uploaded proposal", vendorName, contractTitle);

  if (!rawSections || typeof rawSections !== "object") {
    return fallbackSections;
  }

  const source = rawSections as Record<string, unknown>;
  const normalized = { ...fallbackSections } as ProposalSectionsLike;

  for (const key of PROPOSAL_SECTION_KEYS) {
    const value = source[key as ProposalSectionKey];
    if (typeof value === "string" && value.trim()) {
      normalized[key] = sanitizeText(value);
    }
  }

  return normalized;
}

export async function parseUploadedProposalWithAi(proposalText: string, vendorName = "Vendor", contractTitle = "Proposal"): Promise<ParsedUploadedProposalResult> {
  const sourceText = sanitizeText(proposalText);
  const truncatedText = sourceText.slice(0, 14000);

  if (!truncatedText) {
    const fallbackSections = buildProposalSections("Uploaded proposal content was not readable.", vendorName, contractTitle);
    return {
      proposal_title: `${contractTitle || "Uploaded Proposal"} Proposal`,
      sections: fallbackSections,
      extracted_price: "",
      extracted_timeline: "",
    };
  }

  const result = await openRouterChatJSON<Partial<ParsedUploadedProposalResult> & { sections?: unknown }>({
    model: AGENT_MODEL.TEMPLATE_FORMATTING,
    temperature: 0.2,
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a proposal-writing assistant. Rewrite uploaded proposal text into a polished, sectioned proposal. Ignore PDF headers, page numbers, binary noise, repeated boilerplate, and OCR artifacts. Preserve only facts supported by the source. Fill every section with clear professional phrasing, and do not copy raw PDF fragments or gibberish. Return only valid JSON.",
      },
      {
        role: "user",
        content: `Transform the uploaded proposal into the exact JSON shape below.

Contract title: ${contractTitle}
Vendor name: ${vendorName}

Return JSON with this shape:
{
  "proposal_title": "",
  "sections": {
    "vendor_information": "",
    "company_profile": "",
    "project_understanding": "",
    "proposed_solution": "",
    "deliverables": "",
    "project_timeline": "",
    "cost_proposal": "",
    "team_details": "",
    "past_experience": "",
    "risk_management": "",
    "support_maintenance": "",
    "graphs_visualizations": "",
    "terms_conditions": "",
    "document_uploads": "",
    "final_declaration": ""
  },
  "extracted_price": "",
  "extracted_timeline": ""
}

Section guidance:
- vendor_information: identity, contact, and submission context.
- company_profile: company overview, capabilities, and differentiators.
- project_understanding: the problem, goals, and success criteria.
- proposed_solution: the recommended approach and why it fits.
- deliverables: concrete outputs and handoff items.
- project_timeline: milestones, sequencing, and duration.
- cost_proposal: pricing, fees, and commercial structure.
- team_details: delivery lead, key specialists, and responsibilities.
- past_experience: relevant similar work and outcomes.
- risk_management: delivery, dependency, and mitigation approach.
- support_maintenance: support model, service levels, and follow-up.
- graphs_visualizations: any charts, tables, or visual summaries.
- terms_conditions: assumptions, exceptions, and commercial terms.
- document_uploads: supporting files and attachments.
- final_declaration: closing confirmation and sign-off language.

Uploaded proposal text:
${truncatedText}`,
      },
    ],
  });

  const sections = normalizeSections(result.sections, sourceText, vendorName, contractTitle);
  const extractedPrice = typeof result.extracted_price === "string" && result.extracted_price.trim()
    ? sanitizeText(result.extracted_price)
    : buildPriceFromText(sourceText);
  const extractedTimeline = typeof result.extracted_timeline === "string" && result.extracted_timeline.trim()
    ? sanitizeText(result.extracted_timeline)
    : buildTimelineFromText(sourceText);
  const proposalTitle = typeof result.proposal_title === "string" && result.proposal_title.trim()
    ? sanitizeText(result.proposal_title)
    : `${contractTitle || "Uploaded Proposal"} Proposal`;

  return {
    proposal_title: proposalTitle,
    sections,
    extracted_price: extractedPrice,
    extracted_timeline: extractedTimeline,
  };
}