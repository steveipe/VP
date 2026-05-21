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

const jobStore = new Map<string, LocalJob<any>>();

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
    "What is your company name, primary contact, email, phone, address, and years of experience?",
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
