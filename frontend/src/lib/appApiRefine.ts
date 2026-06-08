import { buildSectionAdditionalSentences } from "@/lib/appApi";
import type { ProposalSectionsLike } from "@/lib/appApi";

export function buildChartDataFromSections(sections: Record<string, string>) {
  const values = Object.values(sections || {});
  const filledCount = values.filter((value) => String(value || "").trim().length > 0).length;
  return {
    cost_breakdown: [{ label: "Implementation", value: 60, color: "#3B82F6" }, { label: "Support", value: 25, color: "#10B981" }, { label: "Contingency", value: 15, color: "#F59E0B" }],
    timeline_phases: [{ label: "Discovery", start_week: 1, duration_weeks: 2, color: "#3B82F6" }, { label: "Build", start_week: 3, duration_weeks: 4, color: "#8B5CF6" }, { label: "Launch", start_week: 7, duration_weeks: 1, color: "#10B981" }],
    team_structure: [{ name: "Project Lead", role: "Lead", experience_years: 8 }],
    risk_matrix: [{ risk: "Scope drift", probability: "Medium", impact: "High" }],
    deliverables_progress: [{ name: "Proposal Draft", weight: filledCount || 1 }],
    budget_total: 100,
    timeline_total_weeks: 7,
  };
}

export function critiqueSections(sections: Record<string, string>, rfpContext: string) {
  const filled = Object.values(sections || {}).filter((value) => String(value || "").trim().length > 0).length;
  const overallScore = Math.min(95, 45 + filled * 3);
  const sectionKeys = Object.keys(sections || {});
  return {
    overall_score: overallScore,
    overall_grade: overallScore >= 85 ? "A" : overallScore >= 70 ? "B" : "C",
    summary: "The proposal is structurally sound but should be tightened for specificity, evidence, and delivery detail.",
    strengths: ["Clear structure", "Relevant scope coverage"],
    weaknesses: filled < 10 ? ["Several sections are still underdeveloped"] : ["Add more measurable proof points"],
    section_scores: Object.fromEntries(sectionKeys.map((key) => [key, { score: 70, feedback: "Good base draft", priority: "medium" }])) as Record<string, { score: number; feedback: string; priority: "high" | "medium" | "low" }>,
    top_improvements: [{ section: "project_understanding", action: "Add clearer delivery milestones and outcomes." }],
  };
}

export function refineSections(sections: Record<string, string>, critique: unknown, rfpContext: string): ProposalSectionsLike {
  const out = { ...(sections as ProposalSectionsLike) } as ProposalSectionsLike;
  for (const key of Object.keys(out) as (keyof ProposalSectionsLike)[]) {
    const value = String(out[key] || "").trim();
    if (!value) continue;
    const sectionLabel = String(key).replace(/_/g, " ");
    const addition = buildSectionAdditionalSentences(value, sectionLabel);
    out[key] = `${value}\n\n${addition}`;
  }
  return out;
}
