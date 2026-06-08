export type LocalJobStatus = "queued" | "running" | "completed" | "failed";

export interface LocalJob<T = unknown> {
  id: string;
  status: LocalJobStatus;
  progress: { message: string; percent: number } | null;
  result: T | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const jobStore = (() => {
  const globalSym = Symbol.for("vp4.localJobStore");
  const globalAny = globalThis as any;
  if (!globalAny[globalSym]) {
    globalAny[globalSym] = new Map<string, LocalJob<any>>();
  }
  return globalAny[globalSym] as Map<string, LocalJob<any>>;
})();

export function createLocalJob<T>(initial?: Partial<LocalJob<T>>): LocalJob<T> {
  const now = new Date().toISOString();
  const job: LocalJob<T> = {
    id: crypto.randomUUID(),
    status: "queued",
    progress: { message: "Queued", percent: 0 },
    result: null,
    error: null,
    created_at: now,
    updated_at: now,
    ...initial,
  };
  jobStore.set(job.id, job);
  return job;
}

export function updateLocalJob<T>(id: string, patch: Partial<LocalJob<T>>): LocalJob<T> | null {
  const existing = jobStore.get(id) as LocalJob<T> | undefined;
  if (!existing) return null;
  const updated: LocalJob<T> = {
    ...existing,
    ...patch,
    progress: patch.progress ?? existing.progress,
    updated_at: new Date().toISOString(),
  };
  jobStore.set(id, updated);
  return updated;
}

export function getLocalJob<T>(id: string): LocalJob<T> | null {
  return (jobStore.get(id) as LocalJob<T> | undefined) ?? null;
}

export function sanitizeText(value: string): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function splitParagraphs(text: string): string[] {
  return sanitizeText(text)
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function extractPriceLikeText(text: string): string {
  const source = sanitizeText(text);
  const matches = [
    /(?:total|price|budget|cost|fee|quote)[:\s-]*([^\n]{0,120})/i,
    /([$€£₹¥]\s?[\d,.]+(?:\s?(?:k|m|million|thousand))?)/i,
    /(\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b\s?(?:USD|EUR|GBP|INR|CAD|AUD|JPY|CHF|AED|SAR)?)/i,
  ];
  for (const pattern of matches) {
    const found = source.match(pattern);
    if (found?.[1]) return found[1].trim();
  }
  return "";
}

export function extractTimelineLikeText(text: string): string {
  const source = sanitizeText(text);
  const matches = [
    /(?:timeline|duration|schedule|delivery|milestone)[:\s-]*([^\n]{0,140})/i,
    /(\b\d+(?:\.\d+)?\s?(?:days?|weeks?|months?|years?)\b[^\n]*)/i,
  ];
  for (const pattern of matches) {
    const found = source.match(pattern);
    if (found?.[1]) return found[1].trim();
  }
  return "";
}

export function sectionTemplate(sectionName: string, source: string, vendorName: string, contractTitle: string): string {
  const excerpt = splitParagraphs(source)[0] || sanitizeText(source).slice(0, 220);
  const cleanVendor = vendorName || "the vendor";
  const cleanContract = contractTitle || "the project";

  const templates: Record<string, string> = {
    vendor_information: `${cleanVendor} is the vendor submitting this proposal for ${cleanContract}. Contact and company details are presented in the source document and should be verified before submission.`,
    company_profile: `Company profile for ${cleanVendor}: ${excerpt || "A concise company profile was not detected, so this section should be edited to add the vendor's core services, experience, and differentiators."}`,
    project_understanding: `The proposal demonstrates an understanding of ${cleanContract} and frames the response around the stated requirements, outcomes, and delivery expectations. ${excerpt}`,
    proposed_solution: `Proposed solution for ${cleanContract}: ${excerpt || "Describe the solution approach, implementation method, and any relevant technology or service model."}`,
    deliverables: `Deliverables for ${cleanContract} should include the agreed scope items, documentation, handoff materials, and any supporting deliverables listed in the uploaded proposal.`,
    project_timeline: `Timeline for ${cleanContract}: ${extractTimelineLikeText(source) || "Add the delivery window, milestones, and expected completion dates."}`,
    cost_proposal: `Cost proposal for ${cleanContract}: ${extractPriceLikeText(source) || "Add pricing, payment milestones, and any assumptions or exclusions."}`,
    team_details: `Team details should identify the delivery lead, key specialists, and responsibilities for ${cleanContract}. ${excerpt}`,
    past_experience: `Past experience should summarize similar work completed by ${cleanVendor}, including relevant clients, outcomes, and measurable results.`,
    risk_management: `Risk management for ${cleanContract} should address delivery risk, scope risk, dependency risk, and mitigation steps.`,
    support_maintenance: `Support and maintenance for ${cleanContract} should state the service window, response targets, and ongoing support model.`,
    graphs_visualizations: `Use charts or visual summaries here to highlight cost, timeline, staffing, or comparison data relevant to ${cleanContract}.`,
    terms_conditions: `Terms and conditions for ${cleanContract} should cover commercial terms, IP, confidentiality, acceptance, and change control.`,
    document_uploads: `Document uploads should list all supporting materials included with the proposal package and any referenced attachments.`,
    final_declaration: `Final declaration: ${cleanVendor} confirms the proposal is accurate, complete, and submitted in good faith for ${cleanContract}.`,
  };

  return templates[sectionName] || excerpt || `Content for ${sectionName} should be completed by the vendor.`;
}

function extractSectionItems(text: string): string[] {
  const normalized = sanitizeText(text);
  const itemMatches = Array.from(normalized.matchAll(/\(\d+\)\s*([^;\n]+)/g)).map((m) => m[1].trim()).filter(Boolean);
  if (itemMatches.length) return itemMatches;

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[\-\*\d\.\)]+\s*/, ""))
    .filter((line) => line.length > 10);

  return lines.slice(0, 5);
}

export function buildSectionAdditionalSentences(
  current: string,
  sectionLabel: string,
  contractTitle?: string,
  vendorName?: string
): string {
  const clean = sanitizeText(current);
  const items = extractSectionItems(clean);
  const title = sectionLabel || "this section";
  const sectionPhrase = /section$/i.test(title) ? title : `${title} section`;
  const projectRef = contractTitle ? ` for ${contractTitle}` : "";
  const vendorRef = vendorName ? ` ${vendorName}` : "";

  const sectionContext: Record<string, string> = {
    "company profile": `It positions${vendorRef} as a qualified partner for${projectRef}, highlighting certified quality management, compliance, and a track record of delivering scalable solutions to government and private sector clients.`,
    "project understanding": `It demonstrates a clear grasp of the project requirements, success criteria, and delivery expectations for${projectRef}.`,
    "proposed solution": `It presents a practical, phased solution designed to meet the business objectives and reduce implementation risk for${projectRef}.`,
    "deliverables": `It clarifies the proposed deliverables, milestone outputs, and documentation required to successfully complete${projectRef}.`,
    "project timeline": `It frames the timeline around discovery, development, testing, and deployment milestones so reviewers can track progress for${projectRef}.`,
    "cost proposal": `It positions the pricing as a value-based proposal with clear assumptions, payment milestones, and cost controls for${projectRef}.`,
    "team details": `It identifies the delivery team, their roles, and the governance approach that will support successful execution of${projectRef}.`,
    "past experience": `It highlights relevant past engagements, measurable outcomes, and proof points that increase confidence in delivering${projectRef}.`,
    "risk management": `It outlines risk mitigation, quality controls, and contingency measures to keep${projectRef} on track and within scope.`,
    "support & maintenance": `It describes ongoing support, response expectations, and service management to sustain${projectRef} after launch.`,
    "graphs / visualizations": `It signals the use of charts or visual summaries to communicate cost, timeline, and performance expectations for${projectRef}.`,
    "terms & conditions": `It covers acceptance criteria, confidentiality, change control, and commercial terms relevant to${projectRef}.`,
    "document uploads": `It lists supporting materials and attachments that will accompany the proposal package for${projectRef}.`,
    "final declaration": `It confirms the proposal is accurate, complete, and submitted in good faith with a commitment to deliver${projectRef}.`,
  };

  const sectionSpecific = sectionContext[title.toLowerCase()] || `It strengthens the ${sectionPhrase} with project-specific clarity and reviewer-friendly structure for${projectRef}.`;

  const baseSentence = clean
    ? clean.endsWith(".") || clean.endsWith("!") || clean.endsWith("?")
      ? clean
      : `${clean}.`
    : `This ${sectionPhrase} is prepared for${projectRef}.`;

  const detailSentences: Record<string, string[]> = {
    "company profile": [
      `It emphasizes the vendor's core capabilities, relevant experience, and points of differentiation for reviewer confidence.${vendorRef ? ` ${vendorRef}` : ""}`,
      `It showcases the business strengths, team depth, and service focus that make this proposal compelling for${projectRef}.`,
      `This helps stakeholders understand why the vendor is the most appropriate partner for the engagement.`,
    ],
    "project understanding": [
      `It explains the key objectives, scope boundaries, and success criteria that are critical to the project.`,
      `It also highlights how the vendor has interpreted the RFP requirements and the business value expected from this work.`,
      `This level of clarity reduces ambiguity and helps align the response to expected outcomes.`,
    ],
    "proposed solution": [
      `It describes the recommended technical and delivery approach, with a focus on practical execution and risk reduction.`,
      `It also outlines the expected benefits, efficiency gains, and value drivers for the project.`,
      `This makes the solution easier to evaluate and compare against stakeholder priorities.`,
    ],
    "deliverables": [
      `It lists the deliverables, milestones, and tangible outputs that will be produced as part of the engagement.`,
      `It also clarifies the documentation, review gates, and acceptance criteria associated with each deliverable.`,
      `This ensures reviewers can see exactly what will be delivered and when.`,
    ],
    "project timeline": [
      `It structures the timeline around key milestones, phases, and decision points for the project.`,
      `It also calls out review cycles, approval checkpoints, and expected delivery windows.`,
      `This helps stakeholders understand the pace and sequencing of work for the project.`,
    ],
    "cost proposal": [
      `It explains the cost basis, pricing assumptions, and commercial terms behind the proposal.`,
      `It also clarifies any payment milestones, contingency allowances, and value-driven rationale.`,
      `This makes the pricing more transparent and easier to justify.`,
    ],
    "team details": [
      `It identifies the core delivery team, their roles, and how they will collaborate to execute the project.`,
      `It also describes governance, escalation, and quality assurance arrangements.`,
      `This helps reviewers understand the people and structure behind the proposal.`,
    ],
    "past experience": [
      `It highlights relevant past projects, client outcomes, and measurable results that support the proposal.`,
      `It also connects experience to the project scope and explains why this track record matters.`,
      `This provides credibility and confidence in the vendor's ability to deliver.`,
    ],
    "risk management": [
      `It outlines the main risks, mitigation strategies, and contingency plans for the project.`,
      `It also describes monitoring, governance, and quality controls that will keep the work on track.`,
      `This reassures reviewers that risks are understood and actively managed.`,
    ],
    "support & maintenance": [
      `It describes the post-delivery support model, service levels, and response commitments.`,
      `It also clarifies ongoing maintenance, escalation paths, and continuity planning.`,
      `This makes the long-term support approach easier to evaluate and trust.`,
    ],
    "graphs / visualizations": [
      `It explains the types of charts, comparisons, or visual summaries that would make this section valuable.`,
      `It also highlights how visual data supports the budget, timeline, and team narrative.`,
      `This helps reviewers quickly grasp the most important information through visual aids.`,
    ],
    "terms & conditions": [
      `It covers the essential contractual terms, confidentiality obligations, and change control processes.`,
      `It also clarifies acceptance criteria, liability expectations, and any key commercial terms.`,
      `This provides a more complete picture of the proposal's legal and commercial framework.`,
    ],
    "document uploads": [
      `It lists supporting materials, attachments, and evidence that accompany the proposal.`,
      `It also clarifies which documents are provided for compliance, validation, and technical detail.`,
      `This makes the supporting package easier to review and trust.`,
    ],
    "final declaration": [
      `It makes a clear statement of accuracy, intent, and the vendor's commitment to the proposal.`,
      `It also reinforces the validity period, review readiness, and confidence behind the submission.`,
      `This helps close the proposal with a professional and trustworthy tone.`,
    ],
    "default": [
      `It also clarifies how this section supports the broader proposal and what reviewers should take away from it.`,
      `It is written to be clear, professional, and aligned with the user's key project objectives.`,
      `This ensures the proposal remains focused, persuasive, and easy to evaluate.`,
    ],
  };

  const details = detailSentences[title.toLowerCase()] || detailSentences.default;
  const sentences: string[] = [baseSentence];

  if (items.length > 0) {
    const excerpts = items
      .map((item) => item.replace(/\s*\b(accepted when|accepted upon|accepted by)\b.*$/i, "").trim())
      .filter(Boolean);
    const summaryItems = excerpts.slice(0, 4);
    const listPhrase = summaryItems.length === 1
      ? summaryItems[0]
      : summaryItems.length === 2
        ? `${summaryItems[0]} and ${summaryItems[1]}`
        : `${summaryItems.slice(0, -1).join(", ")}, and ${summaryItems.slice(-1)}`;
    sentences.push(`It includes ${listPhrase}${items.length > 4 ? ", among other key commitments" : ""}.`);
    sentences.push(sectionSpecific);
  } else {
    sentences.push(sectionSpecific);
  }

  sentences.push(...details.slice(0, 3));
  sentences.push(`Overall, this ${sectionPhrase} provides a strong, professional response that reflects the user's input and makes the proposal easier to evaluate.`);

  return sentences.join(" ").trim();
}

export const PROPOSAL_SECTION_KEYS = [
  "vendor_information",
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
] as const;

export type ProposalSectionKey = (typeof PROPOSAL_SECTION_KEYS)[number];

export interface ProposalSectionsLike extends Record<ProposalSectionKey, string> {}

export function buildProposalSections(text: string, vendorName = "Vendor", contractTitle = "Proposal"): ProposalSectionsLike {
  const paragraphs = splitParagraphs(text);
  const joined = sanitizeText(text);
  const sections = {} as ProposalSectionsLike;

  PROPOSAL_SECTION_KEYS.forEach((key, index) => {
    const seed = paragraphs[index] || paragraphs[0] || joined.slice(index * 160, index * 160 + 220) || "";
    sections[key] = sectionTemplate(key, seed || joined, vendorName, contractTitle);
  });

  return sections;
}

export interface RFPAnalysisLike {
  summary: string;
  key_requirements: string[];
  technical_requirements: string[];
  deliverables: string[];
  evaluation_criteria: string[];
  required_certifications: string[];
  budget_range: string;
  timeline_expectations: string;
  submission_requirements: string[];
  questions_for_vendor: string[];
}

export function buildRfpAnalysis(text: string): RFPAnalysisLike {
  const clean = sanitizeText(text);
  const paragraphs = splitParagraphs(clean);
  const first = paragraphs[0] || clean.slice(0, 280);
  const reqs = paragraphs.filter((p) => /require|must|shall|need|deliver|submit|timeline|budget/i.test(p)).slice(0, 6);
  const tech = paragraphs.filter((p) => /technical|platform|system|implementation|integration|software|hardware/i.test(p)).slice(0, 6);
  const deliverables = paragraphs.filter((p) => /deliverable|output|report|document|phase|milestone/i.test(p)).slice(0, 6);
  const criteria = paragraphs.filter((p) => /evaluate|evaluation|score|award|criteria|selection/i.test(p)).slice(0, 6);
  const certs = Array.from(new Set((clean.match(/\b(?:ISO\s?\d{4,5}|SOC\s?2|PCI|HIPAA|GDPR|FedRAMP|CMMI|ITIL)\b/gi) || []).map((v) => v.trim())));
  const budget = extractPriceLikeText(clean);
  const timeline = extractTimelineLikeText(clean);
  const questions = reqs.slice(0, 5).map((item) => item.replace(/\.$/, ""));

  return {
    summary: first || "RFP summary unavailable.",
    key_requirements: reqs.length ? reqs : [first || "No explicit key requirements were detected in the uploaded RFP."],
    technical_requirements: tech.length ? tech : [first || "No explicit technical requirements were detected in the uploaded RFP."],
    deliverables: deliverables.length ? deliverables : [first || "No explicit deliverables were detected in the uploaded RFP."],
    evaluation_criteria: criteria.length ? criteria : [first || "No explicit evaluation criteria were detected in the uploaded RFP."],
    required_certifications: certs,
    budget_range: budget || "Not specified",
    timeline_expectations: timeline || "Not specified",
    submission_requirements: paragraphs.filter((p) => /submit|submission|deadline|format|email|portal/i.test(p)).slice(0, 6),
    questions_for_vendor: questions.length ? questions : ["What is your implementation timeline and pricing?"],
  };
}

export function buildChatQuestion(sectionIndex: number): string {
  const questions = [
    "Please provide your vendor information, including company name, contact details, and proposal ownership.",
    "Briefly describe your company profile and the services you provide.",
    "What is your understanding of the project requirements and success criteria?",
    "What solution do you recommend, and why is it the right fit?",
    "What deliverables will you provide and in what format?",
    "What timeline or milestones should we expect?",
    "What is the total price or pricing structure?",
    "Who are the key team members and what are their roles?",
    "What similar projects or relevant past experience should we highlight?",
    "How will you manage risks and handle issues during delivery?",
    "What support or maintenance will you provide after delivery?",
    "Are there any charts, visuals, or diagrams that should be included?",
    "Are there any terms, conditions, or assumptions we should note?",
    "Which supporting documents or attachments should be included?",
    "Please confirm the proposal is complete and ready for submission.",
  ];

  return questions[Math.min(sectionIndex, questions.length - 1)];
}

export function buildConciseAssistantReply(sectionIndex: number): string {
  const prompt = buildChatQuestion(sectionIndex);
  return `Got it. ${prompt}`;
}

export function buildPriceFromText(text: string): string {
  return extractPriceLikeText(text) || "";
}

export function buildTimelineFromText(text: string): string {
  return extractTimelineLikeText(text) || "";
}
