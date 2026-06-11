"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { buildProposalSections } from "@/lib/appApi";
import { extractTextFromPDF } from "@/lib/extractPdfText";

import {
  parseRFP,
  proposalChat,
  generateFullProposal,
  parseUploadedProposal,
  editProposalSection,
  extractChartData,
  critiqueProposal,
  refineProposal,
  expandAllSections,
  type RFPAnalysis,
  type ParseRFPProgress,
  type ChatMessage,
  type ProposalSections,
  type ChartData,
  type ProposalCritique,
  type ExpandProgress,
} from "@/services/aiService";
import { supabase } from "@/services/supabase";

/** Ensure every section value is a plain string (LLMs sometimes return objects). */
function normalizeSections(
  raw: Partial<ProposalSections> | Record<string, unknown>,
  fallbackText = "",
  vendorName = "Vendor",
  contractTitle = "Proposal"
): ProposalSections {
  const out = buildProposalSections(fallbackText || "Uploaded proposal", vendorName, contractTitle);

  // Build reverse lookup from human labels to canonical keys
  const labelToKey = Object.entries(SECTION_LABELS).reduce((acc, [key, label]) => {
    acc[label.toLowerCase()] = key;
    // also map a simplified label form (spaces/underscores removed)
    acc[label.toLowerCase().replace(/[^a-z0-9]/g, "")] = key;
    return acc;
  }, {} as Record<string, string>);

  for (const [rawKey, v] of Object.entries(raw)) {
    // Normalize incoming key: could be canonical, human label, or varied casing
    const keyCandidate = String(rawKey || "");
    const lookupKey = keyCandidate.toLowerCase();
    const compactLookup = lookupKey.replace(/[^a-z0-9]/g, "");

    let targetKey: string | undefined = undefined;
    if ((out as any)[keyCandidate] !== undefined) {
      targetKey = keyCandidate;
    } else if (labelToKey[lookupKey]) {
      targetKey = labelToKey[lookupKey];
    } else if (labelToKey[compactLookup]) {
      targetKey = labelToKey[compactLookup];
    } else {
      // try to coerce common variants: replace spaces with underscores
      const alt = lookupKey.replace(/\s+/g, "_");
      if ((out as any)[alt] !== undefined) targetKey = alt;
    }

    // Fallback: if no matching canonical key, skip unknown keys
    if (!targetKey) continue;

    if (typeof v === "string" && v.trim()) (out as any)[targetKey] = v;
    else if (v && typeof v === "object") {
      const flattened = Object.entries(v as Record<string, unknown>)
        .map(([field, val]) => `${field}: ${String(val ?? "")}`)
        .join("\n")
        .trim();
      if (flattened) (out as any)[targetKey] = flattened;
    } else if (v != null && String(v).trim()) {
      (out as any)[targetKey] = String(v);
    }
  }

  return out;
}

const SECTION_LABELS: Record<keyof ProposalSections, string> = {
  vendor_information: "Vendor Information",
  company_profile: "Company Profile",
  project_understanding: "Project Understanding",
  proposed_solution: "Proposed Solution",
  deliverables: "Deliverables",
  project_timeline: "Project Timeline",
  cost_proposal: "Cost Proposal",
  team_details: "Team Details",
  past_experience: "Past Experience",
  risk_management: "Risk Management",
  support_maintenance: "Support & Maintenance",
  graphs_visualizations: "Graphs & Visualizations",
  terms_conditions: "Terms & Conditions",
  document_uploads: "Document Uploads",
  final_declaration: "Final Declaration",
};

const VISIBLE_SECTION_KEYS = Object.keys(SECTION_LABELS) as (keyof ProposalSections)[];
const VISIBLE_SECTION_COUNT = VISIBLE_SECTION_KEYS.length;

function renderDescription(text: string): React.ReactNode {
  return text.split("\n").map((line, i) => (
    line.trim() ? <div key={i}>{line}</div> : <br key={i} />
  ));
}

async function readTextFromFile(file: File): Promise<string> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    return (await extractTextFromPDF(file)).trim();
  }

  return file.text();
}

type Step = "rfp_upload" | "choice" | "chat_build" | "editor" | "preview";

export default function ApplyPage() {
  const router = useRouter();
  const { user, profile } = useAuth();

  /* ─── Core state ─── */
  const [step, setStep] = useState<Step>("rfp_upload");
  const [submitting, setSubmitting] = useState(false);

  /* ─── RFP Upload & Analysis (Step 1) ─── */
  const [rfpFile, setRfpFile] = useState<File | null>(null);
  const [rfpText, setRfpText] = useState("");
  const [rfpAnalysis, setRfpAnalysis] = useState<RFPAnalysis | null>(null);
  const [analyzingRfp, setAnalyzingRfp] = useState(false);
  const [rfpProgressPercent, setRfpProgressPercent] = useState(0);
  const [rfpProgressMessage, setRfpProgressMessage] = useState("Queued for analysis");
  const [rfpElapsedMs, setRfpElapsedMs] = useState(0);
  const [rfpTitle, setRfpTitle] = useState("My Proposal");

  /* ─── Chat builder ─── */
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [proposalReady, setProposalReady] = useState(false);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [showPdfOptions, setShowPdfOptions] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  /* ─── Proposal sections ─── */
  const [sections, setSections] = useState<ProposalSections>({
    vendor_information: "",
    company_profile: "",
    project_understanding: "",
    proposed_solution: "",
    deliverables: "",
    project_timeline: "",
    cost_proposal: "",
    team_details: "",
    past_experience: "",
    risk_management: "",
    support_maintenance: "",
    graphs_visualizations: "",
    terms_conditions: "",
    document_uploads: "",
    final_declaration: "",
  });
  const [proposalTitle, setProposalTitle] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [timelineSummary, setTimelineSummary] = useState("");

  /* ─── Editor state ─── */
  const [editingSection, setEditingSection] = useState<keyof ProposalSections | null>(null);
  const [editInstructions, setEditInstructions] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [activeEditorSection, setActiveEditorSection] = useState<keyof ProposalSections>("company_profile");

  /* ─── Upload state ─── */
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFileName, setUploadFileName] = useState("");
  const [parsingUpload, setParsingUpload] = useState(false);
  const [uploadProgressPercent, setUploadProgressPercent] = useState(0);
  const [uploadProgressMessage, setUploadProgressMessage] = useState("Queued for parsing");
  const [uploadCta, setUploadCta] = useState<string | null>(null);

  /* ─── Generating full proposal ─── */
  const [generatingProposal, setGeneratingProposal] = useState(false);

  /* ─── Charts ─── */
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [extractingCharts, setExtractingCharts] = useState(false);

  /* ─── AI Critique ─── */
  const [critique, setCritique] = useState<ProposalCritique | null>(null);
  const [critiquing, setCritiquing] = useState(false);
  const [refining, setRefining] = useState(false);

  /* ─── Expand to Full Proposal ─── */
  const [expanding, setExpanding] = useState(false);
  const [expandProgress, setExpandProgress] = useState<ExpandProgress | null>(null);
  const [executiveSummary, setExecutiveSummary] = useState("");

  /* ─── PDF Preview ─── */
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState<string | null>(null);
  const [pdfPreviewGenerating, setPdfPreviewGenerating] = useState(false);
  const [pdfPreviewProgressPercent, setPdfPreviewProgressPercent] = useState(0);
  const [pdfPreviewProgressMessage, setPdfPreviewProgressMessage] = useState("Queued for PDF generation");

  const STORAGE_KEY = "proposal-builder-state";

  /* ─── Restore saved state ─── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as Partial<{
        step: Step;
        generatingProposal: boolean;
        showPdfOptions: boolean;
        proposalTitle: string;
        totalPrice: string;
        timelineSummary: string;
        chartData: ChartData | null;
        executiveSummary: string;
        sections: ProposalSections;
        proposalReady: boolean;
        sectionIndex: number;
        rfpTitle: string;
        rfpText: string;
      }>;

      if (parsed.step) setStep(parsed.step);
      if (typeof parsed.generatingProposal === "boolean") setGeneratingProposal(parsed.generatingProposal);
      if (typeof parsed.showPdfOptions === "boolean") setShowPdfOptions(parsed.showPdfOptions);
      if (parsed.proposalTitle) setProposalTitle(parsed.proposalTitle);
      if (parsed.totalPrice) setTotalPrice(parsed.totalPrice);
      if (parsed.timelineSummary) setTimelineSummary(parsed.timelineSummary);
      if (parsed.chartData) setChartData(parsed.chartData);
      if (parsed.executiveSummary) setExecutiveSummary(parsed.executiveSummary);
      if (parsed.sections) setSections(parsed.sections);
      if (typeof parsed.proposalReady === "boolean") setProposalReady(parsed.proposalReady);
      if (typeof parsed.sectionIndex === "number") setSectionIndex(parsed.sectionIndex);
      if (parsed.rfpTitle) setRfpTitle(parsed.rfpTitle);
      if (parsed.rfpText) setRfpText(parsed.rfpText);
    } catch (err) {
      console.warn("Failed to restore state:", err);
    }
  }, [STORAGE_KEY]);

  /* ─── Save state ─── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        step,
        generatingProposal,
        showPdfOptions,
        proposalTitle,
        totalPrice,
        timelineSummary,
        chartData,
        executiveSummary,
        sections,
        proposalReady,
        sectionIndex,
        rfpTitle,
        rfpText,
      }));
    } catch (err) {
      console.warn("Failed to save state:", err);
    }
  }, [step, generatingProposal, showPdfOptions, proposalTitle, totalPrice, timelineSummary, chartData, executiveSummary, sections, proposalReady, sectionIndex, rfpTitle, rfpText]);

  /* ─── Auto-scroll chat ─── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (!analyzingRfp) return;

    const intervalId = setInterval(() => {
      setRfpElapsedMs((current) => current + 1000);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [analyzingRfp]);

  /* ─── Auto-start interview ─── */
  useEffect(() => {
    if (step !== "chat_build" || chatMessages.length > 0) return;
    setChatLoading(true);
    proposalChat([], getRfpContext(), 0)
      .then((resp) => {
        setChatMessages([{ role: "assistant", content: resp.reply }]);
        setSectionIndex(resp.section_index);
      })
      .catch(() => {
        setChatMessages([{ role: "assistant", content: "Absolutely — I’ll be a little yappy on purpose. I’ll walk you through the proposal section by section, explain what each part means, and keep calling out anything missing so we can fill it in together or infer it from the RFP." }]);
      })
      .finally(() => setChatLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /* ─── Build RFP context string ─── */
  const getRfpContext = useCallback(() => {
    const textExcerpt = (rfpText || "").slice(0, 5000);
    const keyRequirements = (rfpAnalysis?.key_requirements || []).slice(0, 12).join("; ");
    const technicalRequirements = (rfpAnalysis?.technical_requirements || []).slice(0, 10).join("; ");
    const deliverables = (rfpAnalysis?.deliverables || []).slice(0, 10).join("; ");
    const evaluationCriteria = (rfpAnalysis?.evaluation_criteria || []).slice(0, 10).join("; ");
    const vendorQuestions = (rfpAnalysis?.questions_for_vendor || []).slice(0, 8).join("; ");

    const parts = [
      `Proposal: ${rfpTitle}`,
      `RFP Summary: ${rfpAnalysis?.summary || "Not available"}`,
      `RFP Key Requirements: ${keyRequirements || "Not available"}`,
      `RFP Technical Requirements: ${technicalRequirements || "Not available"}`,
      `RFP Deliverables: ${deliverables || "Not available"}`,
      `RFP Evaluation Criteria: ${evaluationCriteria || "Not available"}`,
      `RFP Budget Range: ${rfpAnalysis?.budget_range || "Not available"}`,
      `RFP Timeline Expectations: ${rfpAnalysis?.timeline_expectations || "Not available"}`,
      `RFP Submission Requirements: ${(rfpAnalysis?.submission_requirements || []).slice(0, 8).join("; ") || "Not available"}`,
      `RFP Vendor Discovery Questions: ${vendorQuestions || "Not available"}`,
      `RFP Text Excerpt (trimmed):\n${textExcerpt}`,
    ];

    return parts.join("\n");
  }, [rfpTitle, rfpText, rfpAnalysis]);

  /* ═══ STEP 1: Upload RFP ═══ */
  const handleRfpFileChange = async (file: File) => {
    console.log("[Apply] RFP file selected:", {
      name: file.name,
      size: file.size,
      type: file.type,
    });

    setRfpFile(file);
    setAnalyzingRfp(true);
    setRfpProgressPercent(5);
    setRfpProgressMessage("Reading file");
    setRfpElapsedMs(0);
    try {
      console.log("[Apply] Reading file content...");
      const text = await readTextFromFile(file);
      console.log("[Apply] File content read, length:", text.length);

      const ab = await file.arrayBuffer();
      const uint8 = new Uint8Array(ab);
      let binary = "";
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
      const fileBase64 = typeof window !== "undefined" ? window.btoa(binary) : Buffer.from(uint8).toString("base64");

      setRfpText(text);
      const title = file.name.replace(/\.[^/.]+$/, "");
      setRfpTitle(title);

      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const rfpTextForRequest = isPdf && text.trim().length < 120 ? "" : text.trim();

      console.log("[Apply] Starting RFP analysis...");
      // Analyze the RFP
      const analysis = await parseRFP({
        rfp_text: rfpTextForRequest,
        contract_title: file.name,
        contract_description: "",
        contract_budget: "",
        contract_deadline: "",
        contract_industry: "",
        file_base64: fileBase64,
        file_name: file.name,
        content_type: file.type,
      }, (progress: ParseRFPProgress) => {
        setRfpProgressPercent(progress.percent);
        setRfpProgressMessage(progress.message);
        setRfpElapsedMs(progress.elapsedMs);
      });

      console.log("[Apply] RFP analysis complete:", {
        has_requirements: !!analysis.key_requirements,
        requirements_count: analysis.key_requirements?.length || 0,
        has_criteria: !!analysis.evaluation_criteria,
        criteria_count: analysis.evaluation_criteria?.length || 0,
      });

      setRfpAnalysis(analysis);
      setRfpProgressPercent(100);
      setRfpProgressMessage("Analysis complete");
    } catch (err) {
      console.error("[Apply] Failed to process RFP:", {
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : "",
      });
      alert("Failed to process RFP file. Check browser console for details.");
    }
    setAnalyzingRfp(false);
  };

  /* ═══ STEP 3a: Chat ═══ */
  const sectionKeys = VISIBLE_SECTION_KEYS;

  const handleSendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    const updated = [...chatMessages, userMsg];
    setChatMessages(updated);
    setChatInput("");
    setChatLoading(true);
    try {
      const recentMessages = updated.slice(-4);
      const resp = await proposalChat(recentMessages, getRfpContext(), sectionIndex);
      setChatMessages([...updated, { role: "assistant", content: resp.reply }]);
      setSectionIndex(resp.section_index);
      if (resp.proposal_ready || resp.section_index >= VISIBLE_SECTION_COUNT) {
        setProposalReady(true);
      }
    } catch {
      setChatMessages([...updated, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]);
    }
    setChatLoading(false);
  };

  const handleGenerateFromChat = async () => {
    setGeneratingProposal(true);
    try {
      const proposal = await generateFullProposal(
        chatMessages,
        getRfpContext(),
        profile?.company_name || "Vendor",
        rfpTitle
      );
      const normalizedSections = normalizeSections(proposal.sections);
      setSections(normalizedSections);
      setProposalTitle(proposal.proposal_title);
      setTotalPrice(proposal.total_price);
      setTimelineSummary(proposal.timeline_summary);
      setShowPdfOptions(true);

      // Expand generated section content immediately so the editor shows richer, proposal-ready text.
      setExpanding(true);
      setExpandProgress(null);
      try {
        const expanded = await expandAllSections(
          normalizedSections,
          getRfpContext(),
          profile?.company_name || "Vendor",
          rfpTitle,
          (p) => setExpandProgress(p)
        );
        setSections(normalizeSections(expanded.sections));
        if (expanded.executiveSummary) setExecutiveSummary(expanded.executiveSummary);
      } catch {
        // If expansion fails, keep the generated proposal sections and continue.
      } finally {
        setExpanding(false);
      }

      setStep("editor");
    } catch {
      alert("Failed to generate proposal. Please try again.");
    }
    setGeneratingProposal(false);
  };

  /* ═══ STEP 3b: Upload & Parse ═══ */
  const handleParseUpload = async (selectedFile?: File) => {
    const file = selectedFile || uploadFile;
    if (!file) return;

    setParsingUpload(true);
    setUploadProgressPercent(5);
    setUploadProgressMessage("Reading proposal file");
    try {
      const text = await readTextFromFile(file);
      setUploadProgressPercent(20);
      setUploadProgressMessage("Preparing proposal parse");

      const backendEndpoint = apiUrl("/api/ai/parse-proposal/background");
      let body: any = {};

      if (text && text.length > 200) {
        try {
          const resp = await fetch(apiUrl("/api/ai/rephrase-and-parse-proposal"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, cta_text: uploadCta || undefined }),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data?.parsed?.sections) {
              setUploadProgressPercent(70);
              setUploadProgressMessage("Parsing proposal sections");
              setSections(normalizeSections(data.parsed.sections || {}, text, profile?.company_name || "Vendor", rfpTitle));
              setTotalPrice(data.parsed.extracted_price || "");
              setTimelineSummary(data.parsed.extracted_timeline || "");
              setProposalTitle(`Proposal for ${rfpTitle}`);
              if (data?.cta) setUploadCta(String(data.cta));

              const expanded = await expandAllSections(
                normalizeSections(data.parsed.sections || {}, text, profile?.company_name || "Vendor", rfpTitle),
                getRfpContext(),
                profile?.company_name || "Vendor",
                rfpTitle,
                (p) => {
                  setExpandProgress(p);
                  const percent = 75 + Math.round((p.current / Math.max(p.total, 1)) * 20);
                  setUploadProgressPercent(Math.min(percent, 95));
                  setUploadProgressMessage(p.phase === "summary" ? "Writing executive summary" : p.phase === "charts" ? "Preparing visuals" : `Expanding ${p.sectionLabel || "proposal"}`);
                }
              );
              setSections(normalizeSections(expanded.sections));
              if (expanded.executiveSummary) setExecutiveSummary(expanded.executiveSummary);
              setUploadProgressPercent(100);
              setUploadProgressMessage("Parse complete");
              setStep("editor");
              setParsingUpload(false);
              return;
            }
            if (data?.cta) setUploadCta(String(data.cta));
          }
        } catch (e) {
          console.debug("Rephrase-and-parse API failed, falling back to background parse", e);
        }
        body = { text, file_name: file.name };
      } else {
        const ab = await file.arrayBuffer();
        const uint8 = new Uint8Array(ab);
        let binary = "";
        for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
        const b64 = typeof window !== "undefined" ? window.btoa(binary) : Buffer.from(uint8).toString("base64");
        body = { file_base64: b64, file_name: file.name, content_type: file.type };
      }

      const queueResp = await fetch(backendEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!queueResp.ok) throw new Error("Failed to queue parse job");
      const queued = await queueResp.json();
      const jobId = queued.job_id;
      if (!jobId) throw new Error("No job id returned from parse queue");

      const pollUrl = apiUrl(`/api/ai/parse-proposal/jobs/${jobId}`);
      let attempts = 0;
      let parsedResult: any = null;
      while (attempts < 120) {
        await new Promise((r) => setTimeout(r, 1500));
        attempts++;
        try {
          const statusResp = await fetch(pollUrl);
          if (!statusResp.ok) continue;
          const statusJson = await statusResp.json();
          const job = statusJson.job;
          if (!job) continue;
          if (job.progress) {
            setUploadProgressPercent(Number(job.progress.percent ?? 0));
            setUploadProgressMessage(String(job.progress.message || "Parsing proposal"));
          }
          if (job.status === "completed") {
            parsedResult = job.result || {};
            break;
          }
          if (job.status === "failed") {
            throw new Error(job.error || "Parse job failed");
          }
        } catch (e) {
          console.debug("Parse job poll error", e);
        }
      }

      if (!parsedResult) throw new Error("Parse job did not complete in time");

      setUploadProgressPercent(75);
      setUploadProgressMessage("Expanding proposal for preview");
      const parsedSections = normalizeSections(parsedResult.sections || {}, text, profile?.company_name || "Vendor", rfpTitle);
      const expanded = await expandAllSections(
        parsedSections,
        getRfpContext(),
        profile?.company_name || "Vendor",
        rfpTitle,
        (p) => {
          setExpandProgress(p);
          const percent = 75 + Math.round((p.current / Math.max(p.total, 1)) * 20);
          setUploadProgressPercent(Math.min(percent, 95));
          setUploadProgressMessage(p.phase === "summary" ? "Writing executive summary" : p.phase === "charts" ? "Preparing visuals" : `Expanding ${p.sectionLabel || "proposal"}`);
        }
      );

      setSections(normalizeSections(expanded.sections));
      setTotalPrice(parsedResult.extracted_price || "");
      setTimelineSummary(parsedResult.extracted_timeline || "");
      setProposalTitle(`Proposal for ${rfpTitle}`);
      if (expanded.executiveSummary) setExecutiveSummary(expanded.executiveSummary);
      setUploadProgressPercent(100);
      setUploadProgressMessage("Parse complete");
      setStep("editor");
    } catch (err) {
      console.error("Failed to parse uploaded proposal:", err);
      alert("Failed to parse proposal. Make sure it's a readable file or try again.");
    }
    setParsingUpload(false);
  };

  /* ═══ STEP 4: Edit section ═══ */
  const handleEditSection = async (sectionKey: keyof ProposalSections) => {
    if (!editInstructions.trim()) return;
    setEditLoading(true);
    try {
      const edited = await editProposalSection(
        SECTION_LABELS[sectionKey],
        sections[sectionKey],
        editInstructions,
        getRfpContext()
      );
      setSections((prev) => ({ ...prev, [sectionKey]: edited }));
      setEditInstructions("");
      setEditingSection(null);
    } catch {
      alert("Failed to edit section.");
    }
    setEditLoading(false);
  };

  /* ═══ PDF helpers ═══ */
  const getPdfInput = useCallback(() => ({
    title: proposalTitle || "Vendor Proposal",
    vendorName: profile?.company_name || "Vendor",
    contractTitle: rfpTitle,
    totalPrice,
    timeline: timelineSummary,
    sections,
    sectionLabels: SECTION_LABELS,
    chartData,
    executiveSummary,
  }), [proposalTitle, profile?.company_name, rfpTitle, totalPrice, timelineSummary, sections, chartData, executiveSummary]);

  const handleDownloadPDF = () => {
    void (async () => {
      try {
        const response = await fetch(apiUrl("/api/vendor/pdf/generate/background"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vendorResponse: getPdfInput(), options: {} }),
        });
        if (!response.ok) throw new Error("Failed to queue PDF job");
        const { job_id: jobId } = await response.json();
        if (!jobId) throw new Error("No job id returned from PDF queue");

        const pollUrl = apiUrl(`/api/vendor/pdf/generate/jobs/${jobId}`);
        let pdfBase64 = "";
        let attempts = 0;
        while (attempts < 120) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          attempts++;
          const statusResp = await fetch(pollUrl);
          if (!statusResp.ok) continue;
          const statusJson = await statusResp.json();
          const job = statusJson.job || statusJson;
          if (job?.status === "completed") {
            setPdfDownloadUrl(job?.result?.download_url || null);
            if (job?.pdf_base64) {
              pdfBase64 = job.pdf_base64;
              break;
            }
            if (job?.result?.download_url) {
              const downloadUrl = job.result.download_url as string;
              window.open(downloadUrl, "_blank");
              return;
            }
          }
          if (job?.status === "failed") throw new Error(job.error || "PDF job failed");
        }

        if (!pdfBase64) throw new Error("PDF job did not complete in time");
        const binary = atob(pdfBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${(proposalTitle || "proposal").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (err) {
        console.error("PDF download failed:", err);
      }
    })();
  };

  /* Regenerate PDF preview when on preview step */
  useEffect(() => {
    if (step !== "preview") return;
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        setPdfPreviewGenerating(true);
        setPdfPreviewProgressPercent(15);
        setPdfPreviewProgressMessage("Preparing PDFShift job");
        // Queue server-side PDF generation on the backend so PDFShift runs server-side
        const resp = await fetch(apiUrl("/api/vendor/pdf/generate/background"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vendorResponse: getPdfInput(), options: {} }),
        });
        if (!resp.ok) throw new Error("Failed to queue PDF job");
        const data = await resp.json();
        const jobId = data.job_id || data.job_id?.toString();
        if (!jobId) throw new Error("No job id returned from PDF queue");

        // Poll for PDF job on backend (PDFShift path)
        const pollUrl = apiUrl(`/api/vendor/pdf/generate/jobs/${jobId}`);
        let attempts = 0;
        let pdfBase64: string | null = null;
        const maxAttempts = 240;
        while (attempts < maxAttempts && !cancelled) {
          await new Promise((r) => setTimeout(r, 1500));
          attempts++;
          try {
            const statusResp = await fetch(pollUrl);
            if (!statusResp.ok) continue;
            const statusJson = await statusResp.json();
            const job = statusJson.job || statusJson;
            if (!job) continue;
            setPdfDownloadUrl(job?.result?.download_url || null);
            // Map progress updates from either backend or frontend job shape
            if (job.progress?.step === "rendering HTML from vendor response" || job.progress?.message === "Rendering HTML") {
              setPdfPreviewProgressPercent(35);
              setPdfPreviewProgressMessage("Rendering proposal HTML");
            } else if (job.progress?.step === "calling PDFShift API" || job.progress?.message === "Calling PDFShift") {
              setPdfPreviewProgressPercent(75);
              setPdfPreviewProgressMessage("Calling PDFShift");
            } else if (job.status === "completed") {
              setPdfPreviewProgressPercent(100);
              setPdfPreviewProgressMessage("PDF ready");
            }

            // Frontend local job stores may include result.pdf_base64 or pdf_base64 directly
            if (job.status === "completed") {
              if (job.pdf_base64) {
                pdfBase64 = job.pdf_base64;
                break;
              }
              if (job.result?.pdf_base64) {
                pdfBase64 = job.result.pdf_base64;
                break;
              }
              if (job.result?.download_url) {
                if (!cancelled) {
                  setPdfPreviewUrl(job.result.download_url as string);
                }
                return;
              }
            }
            if (job.status === "failed") throw new Error(job.error || "PDF job failed");
          } catch (e) {
            console.debug("PDF job poll error", e);
          }
        }

        if (!pdfBase64) {
          console.error(`PDF job timeout after ${attempts} attempts of ${maxAttempts}`);
          throw new Error(`PDF job did not complete in time (${attempts}/${maxAttempts} attempts)`);
        }
        const binary = atob(pdfBase64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/pdf" });
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPdfPreviewUrl(url);
      } catch (e) {
        console.error("PDF preview generation failed:", e);
      } finally {
        setPdfPreviewGenerating(false);
      }
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [step, getPdfInput]);

  /* ═══ AI Critique & Refine ═══ */
  const handleCritique = async () => {
    setCritiquing(true);
    try {
      const result = await critiqueProposal(sections, getRfpContext());
      setCritique(result);
    } catch {
      alert("Failed to critique proposal.");
    }
    setCritiquing(false);
  };

  const handleRefineAll = async () => {
    if (!critique) return;
    setRefining(true);
    try {
      const result = await refineProposal(sections, critique, getRfpContext());
      if (result.improved_sections) {
        const normalized = normalizeSections(result.improved_sections as Record<string, unknown>);
        setSections(prev => ({ ...prev, ...normalized }));
      }
    } catch {
      alert("Failed to refine proposal.");
    }
    setRefining(false);
  };

  const handleExtractCharts = async () => {
    setExtractingCharts(true);
    try {
      const data = await extractChartData(sections);
      setChartData(data);
    } catch {
      alert("Failed to extract chart data.");
    }
    setExtractingCharts(false);
  };

  /* ═══ Expand All Sections ═══ */
  const handleExpandAll = async () => {
    setExpanding(true);
    setExpandProgress(null);
    try {
      const result = await expandAllSections(
        sections,
        getRfpContext(),
        profile?.company_name || "Vendor",
        rfpTitle,
        (p) => setExpandProgress(p)
      );
      setSections(normalizeSections(result.sections));
      if (result.executiveSummary) setExecutiveSummary(result.executiveSummary);
    } catch {
      alert("Failed to expand proposal. Some sections may have been updated.");
    }
    setExpanding(false);
    setExpandProgress(null);
  };

  /* ═══ STEP 5: Submit ═══ */
  const handleSubmit = async () => {
    if (!user) {
      alert("Please sign in to submit.");
      return;
    }
    setSubmitting(true);
    try {
      const safeName = (proposalTitle || "proposal").replace(/[^a-zA-Z0-9]/g, "_");

      const proposalPayload = {
        title: proposalTitle || "Vendor Proposal",
        vendorName: profile?.company_name || "Vendor",
        contractTitle: rfpTitle,
        totalPrice,
        timeline: timelineSummary,
        sections,
        sectionLabels: SECTION_LABELS,
      };

      const submissionPayload = {
        ...proposalPayload,
        vendor_name: profile?.company_name || "Unknown",
        price: totalPrice,
        timeline: timelineSummary,
        experience: sections.past_experience.slice(0, 500),
        proposal_data: JSON.stringify(proposalPayload),
        proposal_file_name: `${safeName}.pdf`,
        proposal_type: "generated",
        ai_score: null,
        risk_level: null,
        created_at: new Date().toISOString(),
      };

      // Queue PDF generation job on the backend
      const resp = await fetch(apiUrl("/api/vendor/pdf/generate/background"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorResponse: getPdfInput(), options: {} }),
      });
      if (!resp.ok) throw new Error("Failed to queue PDF job");
      const startData = await resp.json();
      const jobId = startData.job_id;
      if (!jobId) throw new Error("No job id returned from PDF queue");

      const pollUrl = apiUrl(`/api/vendor/pdf/generate/jobs/${jobId}`);
      let pdfBase64: string | null = null;
      let attempts = 0;
      while (attempts < 240) {
        await new Promise((r) => setTimeout(r, 1500));
        attempts++;
        try {
          const statusResp = await fetch(pollUrl);
          if (!statusResp.ok) continue;
          const statusJson = await statusResp.json();
          const job = statusJson.job || statusJson;
          if (!job) continue;
          if (job.status === "completed") {
            pdfBase64 = job.pdf_base64 || job.result?.pdf_base64 || null;
            if (!pdfBase64 && job.result?.download_url) {
              // fetch the generated file and convert to base64
              try {
                const fileResp = await fetch(job.result.download_url);
                if (fileResp.ok) {
                  const arrayBuffer = await fileResp.arrayBuffer();
                  const uint8 = new Uint8Array(arrayBuffer);
                  let binary = "";
                  for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
                  pdfBase64 = typeof window !== "undefined" ? window.btoa(binary) : Buffer.from(uint8).toString("base64");
                }
              } catch (e) {
                console.debug("Failed fetching download_url for PDF job", e);
              }
            }
            break;
          }
          if (job.status === "failed") throw new Error(job.error || "PDF job failed");
        } catch (e) {
          console.debug("PDF job poll error", e);
        }
      }

      if (!pdfBase64) throw new Error("PDF job did not complete in time");

      const uploadResp = await fetch("/api/vendor/pdf/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          fileName: `${safeName}.pdf`,
          pdfBase64,
          bucket: process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "proposals",
          vendorName: profile?.company_name || user.email || "",
          price: totalPrice || null,
          timeline: timelineSummary || null,
          contractTitle: proposalTitle || rfpTitle || "Vendor Proposal",
          contractDescription: `Generated proposal for ${rfpTitle}`,
          proposal_data: JSON.stringify(proposalPayload),
        }),
      });

      if (!uploadResp.ok) {
        const uploadError = await uploadResp.json().catch(() => null);
        throw new Error(uploadError?.error || "Failed to upload proposal PDF");
      }

      const uploadData = await uploadResp.json();
      const publicUrl = uploadData?.url;
      if (!publicUrl) throw new Error("Failed to obtain proposal download URL");

      // Server upload route will persist a DB row using the service-role key.

      setPdfDownloadUrl(publicUrl);
      alert("Proposal saved to your profile. You can download it from your Profile.");
      router.push("/profile");
    } catch (err) {
      console.error("Submission failed:", err);
      alert("Failed to submit proposal. Check the console for details.");
      setSubmitting(false);
    }
  };

  if (!user) return <div className="flex justify-center items-center min-h-screen text-[var(--muted)]">Please sign in to build a proposal.</div>;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* ─── Step Progress Bar ─── */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {[
            { key: "rfp_upload", label: "Upload RFP" },
            { key: "choice", label: "Choose Method" },
            { key: "chat_build", label: "Build Proposal" },
            { key: "editor", label: "Edit & Refine" },
            { key: "preview", label: "Preview & Submit" },
          ].map((s, i) => {
            const stepOrder: Step[] = ["rfp_upload", "choice", "chat_build", "editor", "preview"];
            const currentIdx = stepOrder.indexOf(step);
            const isActive = step === s.key;
            const isPast = i < currentIdx;
            return (
              <div key={s.key} className="flex items-center gap-2 shrink-0">
                {i > 0 && <div className={`w-8 h-0.5 ${isPast ? "bg-[var(--primary)]" : "bg-[var(--divider)]"}`} />}
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isActive ? "bg-[var(--primary)] text-[#EFECE3] shadow-md" : isPast ? "bg-[var(--primary-light)] text-[var(--primary)]" : "bg-[var(--surface)] text-[var(--muted)]"}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${isActive ? "bg-[#EFECE3]/20" : isPast ? "bg-[var(--accent-light)] text-[var(--primary)]" : "bg-[var(--divider)]"}`}>
                    {isPast ? "✓" : i + 1}
                  </span>
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* ═══════════════════════════════════════════════════ */}
        {/*           STEP 1: RFP UPLOAD                         */}
        {/* ═══════════════════════════════════════════════════ */}
        {step === "rfp_upload" && (
          <div className="space-y-6">
            <div className="card">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-[var(--primary-light)] rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 12l2 2 4-4" /></svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-[var(--foreground)]">Upload your RFP PDF</h2>
                  <p className="text-sm text-[var(--muted)] mt-1">Drop in the vendor RFP and I’ll read it first, then guide you through the build.</p>
                </div>
              </div>

              <label className="block cursor-pointer">
                <input
                  type="file"
                  accept=".pdf,.txt,.doc,.docx"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleRfpFileChange(f);
                  }}
                  disabled={analyzingRfp}
                  className="hidden"
                />
                <div className="bg-[#EFECE3] border-2 border-dashed border-[var(--divider)] hover:border-[var(--primary)] rounded-2xl p-12 text-center transition-colors cursor-pointer">
                  {rfpFile ? (
                    <>
                      <div className="flex items-center justify-center gap-2 mb-3">
                        <svg className="w-6 h-6 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        <p className="text-lg font-semibold text-[var(--foreground)]">{rfpFile.name}</p>
                      </div>
                      {analyzingRfp && (
                        <div className="max-w-md mx-auto space-y-2">
                          <p className="text-sm text-[var(--muted)]">{rfpProgressMessage} ({Math.round(rfpElapsedMs / 1000)}s)</p>
                          <div className="w-full h-2 bg-[var(--divider)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[var(--primary)] transition-all duration-500 ease-out"
                              style={{ width: `${rfpProgressPercent}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <svg className="w-12 h-12 text-[var(--muted)] mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 12l2 2 4-4" /></svg>
                      <p className="text-lg font-semibold text-[var(--foreground)] mb-1">Upload your source RFP</p>
                      <p className="text-sm text-[var(--muted)]">PDF, TXT, DOC, or DOCX files supported</p>
                    </>
                  )}
                </div>
              </label>

              {rfpAnalysis && (
                <div className="mt-6 p-4 bg-[var(--surface)] border border-[var(--divider)] rounded-xl">
                  <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">RFP Analysis</h3>
                  <div className="space-y-3 text-sm text-[var(--muted)]">
                    {rfpAnalysis.summary && (
                      <div>
                        <p className="font-medium text-[var(--foreground)]">Summary:</p>
                        <p className="mt-1">{rfpAnalysis.summary}</p>
                      </div>
                    )}

                    {rfpAnalysis.key_requirements && rfpAnalysis.key_requirements.length > 0 && (
                      <div>
                        <p className="font-medium text-[var(--foreground)]">Key Requirements:</p>
                        <ul className="list-disc list-inside ml-2 mt-1">{rfpAnalysis.key_requirements.slice(0, 5).map((r, i) => <li key={i}>{r}</li>)}</ul>
                      </div>
                    )}

                    {rfpAnalysis.technical_requirements && rfpAnalysis.technical_requirements.length > 0 && (
                      <div>
                        <p className="font-medium text-[var(--foreground)]">Technical Requirements:</p>
                        <ul className="list-disc list-inside ml-2 mt-1">{rfpAnalysis.technical_requirements.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}</ul>
                      </div>
                    )}

                    {rfpAnalysis.deliverables && rfpAnalysis.deliverables.length > 0 && (
                      <div>
                        <p className="font-medium text-[var(--foreground)]">Deliverables:</p>
                        <ul className="list-disc list-inside ml-2 mt-1">{rfpAnalysis.deliverables.slice(0, 3).map((d, i) => <li key={i}>{d}</li>)}</ul>
                      </div>
                    )}

                    {rfpAnalysis.evaluation_criteria && rfpAnalysis.evaluation_criteria.length > 0 && (
                      <div>
                        <p className="font-medium text-[var(--foreground)]">Evaluation Criteria:</p>
                        <ul className="list-disc list-inside ml-2 mt-1">{rfpAnalysis.evaluation_criteria.slice(0, 3).map((c, i) => <li key={i}>{c}</li>)}</ul>
                      </div>
                    )}

                    {rfpAnalysis.budget_range && (
                      <div>
                        <p className="font-medium text-[var(--foreground)]">Budget Range:</p>
                        <p className="mt-1">{rfpAnalysis.budget_range}</p>
                      </div>
                    )}

                    {rfpAnalysis.timeline_expectations && (
                      <div>
                        <p className="font-medium text-[var(--foreground)]">Timeline:</p>
                        <p className="mt-1">{rfpAnalysis.timeline_expectations}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button onClick={() => setStep("choice")} disabled={!rfpFile || analyzingRfp} className="flex items-center justify-center gap-2 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[#EFECE3] px-8 py-3.5 rounded-full text-sm font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50">
                Continue to Proposal Builder
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/*           STEP 2: CHOICE                            */}
        {/* ═══════════════════════════════════════════════════ */}
        {step === "choice" && (
          <div className="space-y-6">
            <div className="text-center mb-2">
              <h2 className="text-2xl font-bold text-[var(--foreground)]">How would you like to build?</h2>
              <p className="text-sm text-[var(--muted)] mt-2">Choose your preferred method.</p>
            </div>

            <div className="flex flex-wrap justify-center gap-5">
              {/* Build from Scratch */}
              <button onClick={() => {
                setChatMessages([]);
                setSectionIndex(0);
                setProposalReady(false);
                setShowPdfOptions(false);
                setStep("chat_build");
              }} className="group bg-[#EFECE3] border-2 border-[var(--divider)] hover:border-[var(--accent)] rounded-2xl p-8 text-left transition-all hover:shadow-lg mx-auto max-w-2xl w-full sm:w-[46%]">
                <div className="w-14 h-14 bg-[var(--primary-light)] group-hover:bg-[var(--accent-light)] rounded-full flex items-center justify-center mb-5 transition-colors">
                  <svg className="w-7 h-7 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">Build from Scratch</h3>
                <p className="text-sm text-[var(--muted)] leading-relaxed mb-4">Our AI assistant will interview you step by step, ask the defined section questions, and clearly call out anything that is still missing.</p>
                <div className="flex flex-wrap gap-2">
                  <span className="bg-[var(--primary-light)] text-[var(--primary)] px-2.5 py-1 rounded-lg text-xs font-medium">AI-Guided</span>
                  <span className="bg-[var(--primary-light)] text-[var(--primary)] px-2.5 py-1 rounded-lg text-xs font-medium">Interactive Chat</span>
                </div>
              </button>

            </div>

            <button onClick={() => setStep("rfp_upload")} className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors mx-auto">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back to RFP Upload
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/*           STEP 3a: AI CHAT BUILDER                  */}
        {/* ═══════════════════════════════════════════════════ */}
        {step === "chat_build" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[var(--foreground)]">AI Proposal Builder</h2>
                <p className="text-xs text-[var(--muted)]">Answer all 14 sections. The AI will ask about each one in order.</p>
              </div>
              <div className="flex gap-2">
                {(proposalReady || chatMessages.length >= 6) && !showPdfOptions && (
                  <button onClick={handleGenerateFromChat} disabled={generatingProposal} className="flex items-center gap-2 bg-[var(--primary)] text-[#EFECE3] px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[var(--primary-hover)] disabled:opacity-50 transition-all shadow-sm">
                    {generatingProposal ? (
                      <><div className="w-3.5 h-3.5 border-2 border-[#EFECE3]/30 border-t-[#EFECE3] rounded-full animate-spin" />Generating...</>
                    ) : (
                      <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Generate Proposal</>
                    )}
                  </button>
                )}
                {showPdfOptions && (
                  <button onClick={() => setStep("editor")} className="flex items-center gap-2 bg-[var(--primary)] text-[#EFECE3] px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[var(--primary-hover)] transition-all shadow-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Edit Sections
                  </button>
                )}
              </div>
            </div>

            {/* Section Progress Bar */}
            <div className="card !p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-[var(--foreground)]">Interview Progress</p>
                <span className="text-xs font-bold text-[var(--primary)]">{Math.min(sectionIndex, VISIBLE_SECTION_COUNT)}/{VISIBLE_SECTION_COUNT} Sections</span>
              </div>
              <div className="w-full bg-[var(--surface)] rounded-full h-2.5">
                <div className="bg-gradient-to-r from-violet-500 to-emerald-500 h-2.5 rounded-full transition-all duration-700 ease-out" style={{ width: `${(Math.min(sectionIndex, VISIBLE_SECTION_COUNT) / VISIBLE_SECTION_COUNT) * 100}%` }} />
              </div>
            </div>

            {/* Main chat + sidebar */}
            <div className="flex gap-4">
              {/* Chat Window */}
              <div className="flex-1 min-w-0">
                <div className="card !p-0 overflow-hidden">
                  <div className="h-[28rem] overflow-y-auto p-5 space-y-4">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === "user" ? "bg-[var(--primary-light)]" : "bg-[var(--primary-light)]"}`}>
                          {msg.role === "user" ? (
                            <svg className="w-4 h-4 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          ) : (
                            <svg className="w-4 h-4 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                          )}
                        </div>
                        <div className={`rounded-2xl px-4 py-3 max-w-[80%] ${msg.role === "user" ? "bg-[var(--primary)] text-[#EFECE3] rounded-tr-sm" : "bg-[var(--surface)] text-[var(--foreground)] rounded-tl-sm"}`}>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    ))}

                    {chatLoading && (
                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-[var(--primary-light)] rounded-full flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <div className="bg-[var(--surface)] rounded-2xl rounded-tl-sm px-4 py-3">
                          <div className="flex gap-1.5">
                            <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                            <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                            <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {proposalReady && !showPdfOptions && (
                      <div className="pt-4">
                        <button
                          onClick={handleGenerateFromChat}
                          disabled={generatingProposal}
                          className="flex items-center gap-2 bg-[var(--primary)] text-[#EFECE3] px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[var(--primary-hover)] disabled:opacity-50 transition-all shadow-sm"
                        >
                          {generatingProposal ? (
                            <><div className="w-3.5 h-3.5 border-2 border-[#EFECE3]/30 border-t-[#EFECE3] rounded-full animate-spin" />Generating...</>
                          ) : (
                            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Generate Proposal</>
                          )}
                        </button>
                      </div>
                    )}

                    <div ref={chatEndRef} />
                  </div>

                  {/* Input */}
                  <div className="border-t border-[var(--divider)] p-4 bg-[var(--surface)]/50">
                    <form onSubmit={(e) => { e.preventDefault(); handleSendChat(); }} className="space-y-2">
                      <div className="flex gap-3">
                        <input
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Type your response..."
                          disabled={chatLoading}
                          maxLength={1200}
                          className="input-field !rounded-xl flex-1 disabled:opacity-50"
                        />
                        <button
                          type="submit"
                          disabled={chatLoading || !chatInput.trim()}
                          aria-label="Send message"
                          title="Send message"
                          className="bg-[var(--primary)] text-[#EFECE3] px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-[var(--primary-hover)] disabled:opacity-50 transition-all shadow-sm"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                        <span>{chatInput.length}/1200 characters</span>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>

            {/* PDF Options */}
            {showPdfOptions && (
              <div className="bg-gradient-to-r from-emerald-50 to-blue-50 rounded-2xl border border-emerald-200/60 p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[var(--primary-light)] rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[var(--foreground)]">Proposal Generated Successfully!</h3>
                    <p className="text-xs text-[var(--muted)]">Continue to the editor for refinements.</p>
                  </div>
                </div>
              </div>
            )}

            <button onClick={() => setStep("choice")} className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors mx-auto">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back to Method Selection
            </button>
          </div>
        )}

        {/* STEP 3b: UPLOAD & PARSE */}
        {/* Upload/edit option removed: only build from scratch is available. */}

        {/* STEP 4: EDITOR */}
        {step === "editor" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[var(--foreground)]">Edit & Refine Proposal</h2>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {/* Section List */}
              <div className="lg:col-span-1">
                <div className="card !p-3 sticky top-24 max-h-96 overflow-y-auto">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold px-2 mb-2">Sections</p>
                  <div className="space-y-1">
                    {VISIBLE_SECTION_KEYS.map((key) => (
                      <button
                        key={key}
                        onClick={() => setActiveEditorSection(key)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${activeEditorSection === key ? "bg-[var(--primary)] text-[#EFECE3] font-semibold" : "text-[var(--muted)] hover:bg-[var(--surface)]"}`}
                      >
                        {SECTION_LABELS[key]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Editor */}
              <div className="lg:col-span-3">
                <div className="card">
                  <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">{SECTION_LABELS[activeEditorSection]}</h3>
                  <textarea
                    value={sections[activeEditorSection]}
                    onChange={(e) => setSections(prev => ({ ...prev, [activeEditorSection]: e.target.value }))}
                    aria-label={`${SECTION_LABELS[activeEditorSection]} content`}
                    className="w-full h-64 p-3 border border-[var(--divider)] rounded-lg font-mono text-sm text-[var(--foreground)] bg-[var(--surface)] resize-none"
                  />
                  <div className="mt-4 space-y-2">
                    <textarea
                      value={editInstructions}
                      onChange={(e) => setEditInstructions(e.target.value)}
                      placeholder="Or tell AI to edit this section..."
                      className="w-full h-20 p-3 border border-[var(--divider)] rounded-lg text-sm text-[var(--foreground)] bg-[var(--surface)]"
                    />
                    <button onClick={() => handleEditSection(activeEditorSection)} disabled={editLoading || !editInstructions.trim()} className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[#EFECE3] px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50">
                      {editLoading ? "Editing..." : "AI Edit"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep("choice")} className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              <button onClick={() => setStep("preview")} className="flex items-center gap-2 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[#EFECE3] px-6 py-2 rounded-lg text-sm font-semibold">
                Preview
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: PREVIEW */}
        {step === "preview" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--foreground)]">Preview & Submit</h2>
              <button onClick={handleDownloadPDF} className="flex items-center gap-2 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[#EFECE3] px-5 py-2.5 rounded-xl text-sm font-semibold">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Download PDF
              </button>
            </div>

            {pdfPreviewUrl ? (
              <div className="space-y-4">
                <iframe src={pdfPreviewUrl} title="Proposal PDF preview" className="w-full h-96 border border-[var(--divider)] rounded-lg" />
                {pdfDownloadUrl ? (
                  <div className="flex justify-end">
                    <a
                      href={pdfDownloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 bg-[var(--surface)] border border-[var(--divider)] text-[var(--foreground)] px-4 py-2 rounded-lg text-sm hover:bg-[var(--surface-hover)]"
                    >
                      Open full PDF
                    </a>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="card text-center py-12 space-y-4">
                <p className="text-[var(--muted)]">Generating PDF preview...</p>
                {pdfPreviewGenerating && (
                  <div className="max-w-md mx-auto space-y-2">
                    <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                      <span>{pdfPreviewProgressMessage}</span>
                      <span>{pdfPreviewProgressPercent}%</span>
                    </div>
                    <progress className="w-full h-2 overflow-hidden rounded-full" value={pdfPreviewProgressPercent} max={100} />
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between">
              <button onClick={() => setStep("editor")} className="flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Back to Editor
              </button>
              <button onClick={handleSubmit} disabled={submitting} className="flex items-center gap-2 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[#EFECE3] px-8 py-3 rounded-full text-sm font-semibold disabled:opacity-50">
                {submitting ? <>Submitting...</> : <>Submit Proposal</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
