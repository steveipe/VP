"""
AI Service - handles RFP parsing, proposal chat, and other AI-powered features
Uses OpenRouter API for LLM access
"""

import json
import os
import sys
from pathlib import Path

# Load local env file if present so os.getenv picks up keys when running via uvicorn
# This helps when callers don't load .env automatically.
try:
    env_path = Path(__file__).resolve().parent.parent / ".env.local"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and not os.environ.get(k):
                os.environ[k] = v
except Exception:
    # best-effort only; continue if env file can't be read
    pass
import httpx
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# Get OpenRouter API key
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL") or "https://openrouter.ai/api/v1"

# Use Qwen Plus for context understanding
RFP_PARSER_MODEL = "qwen/qwen-plus"
CHAT_MODEL = "qwen/qwen-plus"

async def parse_rfp_with_ai(rfp_text: str, title: str = "", description: str = "") -> dict:
    """
    Use AI to analyze RFP text and extract key information.
    Returns structured RFP analysis with key requirements, evaluation criteria, etc.
    """
    if not OPENROUTER_API_KEY:
        logger.warning("OPENROUTER_API_KEY not set, returning minimal analysis")
        return {
            "key_requirements": [],
            "evaluation_criteria": [],
            "budget_range": "",
            "timeline_expectations": "",
            "submission_requirements": [],
            "questions_for_vendor": [],
        }
    
    prompt = f"""Analyze this RFP document and extract key information in JSON format.

Title: {title}
Description: {description}

RFP Content:
{rfp_text[:3000]}  # Keep input compact to reduce latency

Extract and return JSON with these fields:
- key_requirements: list of main requirements
- evaluation_criteria: list of evaluation criteria
- budget_range: budget information if available
- timeline_expectations: timeline or deadline info
- submission_requirements: list of submission requirements
- questions_for_vendor: suggested questions for vendors

Return only valid JSON, no other text."""

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": RFP_PARSER_MODEL,
                    "messages": [
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    "temperature": 0.3,
                    "max_tokens": 700,
                },
                timeout=20.0,
            )
            
            if response.status_code != 200:
                logger.error(f"OpenRouter error: {response.text}")
                return {}
            
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            
            # Parse JSON from response
            analysis = json.loads(content)
            return analysis
            
    except Exception as e:
        logger.error(f"Error parsing RFP with AI: {e}")
        return {}


async def parse_uploaded_proposal(proposal_text: str) -> dict:
    """
    Parse an uploaded proposal text into the 15-section structure using the OpenRouter model.
    Returns the parsed JSON object (dict) or empty dict on failure.
    """
    if not OPENROUTER_API_KEY:
        logger.warning("OPENROUTER_API_KEY not set, returning empty parse")
        return {}

    parse_prompt = (
        "You are a proposal document parser. Parse the following uploaded proposal document into the 15-section vendor proposal structure.\n\n"
        "DOCUMENT:\n"
        + proposal_text[:12000]
        + "\n\nParse and return ONLY valid JSON in this exact format, no markdown:\n"
        + json.dumps(
            {
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
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n\nMap the content to the closest matching section. If a section isn't found, leave it as an empty string.\nReturn ONLY valid JSON. "
    )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": RFP_PARSER_MODEL,
                    "messages": [
                        {"role": "system", "content": "You are a JSON-only parser. Respond with raw JSON only."},
                        {"role": "user", "content": parse_prompt},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 4000,
                },
                timeout=60.0,
            )

            if response.status_code != 200:
                logger.error(f"OpenRouter error (parse upload): {response.text}")
                return {}

            data = response.json()
            content = data["choices"][0]["message"]["content"]
            logger.debug("Model output (first 4000 chars): %s", content[:4000])
            try:
                parsed = json.loads(content)
                return parsed
            except Exception as e:
                logger.error("Failed to parse JSON from model output: %s", e)
                logger.error("Model output was: %s", content)
                return {}
    except Exception as e:
        logger.error(f"Error parsing uploaded proposal with AI: {e}")
        return {}


async def proposal_chat_ai(
    messages: list,
    rfp_context: str,
    section_index: int,
    vendor_name: str = "Vendor"
) -> dict:
    """
    AI-powered proposal chat - guides through proposal building.
    Returns reply text, whether proposal is ready, and next section index.
    """
    if not OPENROUTER_API_KEY:
        logger.warning("OPENROUTER_API_KEY not set")
        return {
            "reply": "I'm unable to process your request at this time. Please check the API configuration.",
            "proposal_ready": False,
            "section_index": section_index,
        }
    
    PROPOSAL_SECTIONS = [
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
    ]
    
    section_name = PROPOSAL_SECTIONS[section_index] if section_index < len(PROPOSAL_SECTIONS) else "final_declaration"
    
    SECTION_LABELS = {
        "company_profile": "Company Profile",
        "project_understanding": "Project Understanding",
        "proposed_solution": "Proposed Solution",
        "deliverables": "Deliverables",
        "project_timeline": "Project Timeline",
        "cost_proposal": "Cost Proposal",
        "team_details": "Team Details",
        "past_experience": "Past Experience",
        "risk_management": "Risk Management",
        "support_maintenance": "Support & Maintenance",
        "graphs_visualizations": "Graphs & Visualizations",
        "terms_conditions": "Terms & Conditions",
        "document_uploads": "Document Uploads",
        "final_declaration": "Final Declaration",
    }

    SECTION_QUESTIONS = {
        "company_profile": (
            "Please describe your company profile in one paragraph, including your company background, core capabilities, certifications, and why you are qualified to deliver this project."
        ),
        "project_understanding": (
            "Describe your understanding of the client's needs and goals from the RFP. What problem are you solving?"
        ),
        "proposed_solution": (
            "Describe your proposed solution, approach, or methodology to meet the client's requirements."
        ),
        "deliverables": (
            "List the key deliverables you will provide, including a short acceptance criterion for each."
        ),
        "project_timeline": (
            "Share the project timeline or milestones, with dates or durations for major phases."
        ),
        "cost_proposal": (
            "State your cost proposal with currency, totals, and payment terms."
        ),
        "team_details": (
            "Describe the team assigned to this proposal, including roles and percent allocation."
        ),
        "past_experience": (
            "Describe one or two relevant past projects or experience that support your ability to deliver."
        ),
        "risk_management": (
            "Identify the key risks and how you will mitigate them."
        ),
        "support_maintenance": (
            "Describe your support or maintenance offering, including duration or SLA terms."
        ),
        "graphs_visualizations": (
            "Explain any graphs, dashboards, or visualizations you would include to support this proposal."
        ),
        "terms_conditions": (
            "State your proposed terms and conditions, or say 'use standard terms' if appropriate."
        ),
        "document_uploads": (
            "List the supporting documents or attachments you will provide, including file names and formats."
        ),
        "final_declaration": (
            "Provide a final declaration with signatory name, title, and date."
        ),
    }

    def _min_len(text: str, n: int) -> bool:
        return isinstance(text, str) and len(text.strip()) >= n

    import re

    def validate_section(name: str, text: str) -> tuple[bool, str]:
        t = (text or "").strip()
        if name == "document_uploads":
            if t == "" or re.search(r"\.(xlsx|docx|pdf|xls|doc|jpg|png)", t, re.I):
                return True, ""
            return False, "Please list supporting files or attachments and their formats."
        if name == "company_profile":
            if _min_len(t, 20) and not re.fullmatch(r"[A-Za-z0-9 \-_,\.]{1,20}", t):
                return True, ""
            return False, "Please describe your company background, strengths, certifications, and why you are a strong fit for this project."
        if name == "project_understanding":
            if _min_len(t, 40):
                return True, ""
            return False, "That looks too short — please explain the client's needs and what you believe the project should achieve."
        if name == "proposed_solution":
            if _min_len(t, 40):
                return True, ""
            return False, "Please describe your proposed solution and the main approach you will take."
        if name == "deliverables":
            lines = [l.strip() for l in t.splitlines() if l.strip()]
            if len(lines) >= 1 and any(len(l) > 10 for l in lines):
                return True, ""
            return False, "Please list at least one concrete deliverable with a brief acceptance criterion."
        if name == "project_timeline":
            if re.search(r"\d{4}|\d+\s*(weeks|week|months|month|days|day)", t, re.I):
                return True, ""
            return False, "Please include a milestone or phase with an estimated date or duration."
        if name == "cost_proposal":
            if re.search(r"[€$£]|\bUSD\b|\bEUR\b|\d{2,}", t):
                return True, ""
            return False, "Please provide the price with currency and terms (for example, USD 12,000, 30% upfront)."
        if name == "team_details":
            if re.search(r"\d+%", t) or re.search(r"lead|manager|engineer|pm|developer|analyst", t, re.I):
                return True, ""
            return False, "Please describe at least one team member with role and allocation, such as 'Lead PM — 30%'."
        if name == "past_experience":
            if _min_len(t, 30):
                return True, ""
            return False, "Please describe at least one relevant past project or experience."
        if name == "risk_management":
            if re.search(r"risk|mitigat|contingenc|issue", t, re.I):
                return True, ""
            return False, "Please identify a risk and how you will mitigate it."
        if name == "support_maintenance":
            if re.search(r"(support|warrant|SLA|days|months|years)", t, re.I):
                return True, ""
            return False, "Please describe your support or maintenance offering, including duration or service levels."
        if name == "graphs_visualizations":
            return True, ""
        if name == "terms_conditions":
            if re.search(r"termination|IP|liability|ownership|confidentiality", t, re.I) or _min_len(t, 15):
                return True, ""
            return False, "Please state your terms and conditions or say 'use standard terms'."
        if name == "final_declaration":
            # Accept any non-empty declaration (more lenient validation)
            if _min_len(t, 10):
                return True, ""
            return False, "Please provide signatory name, title, and date."
        return True, ""

    def get_section_prompt(name: str) -> str:
        return SECTION_QUESTIONS.get(name, f"Please provide the content for {SECTION_LABELS.get(name, name)}.")

    def summarize_answer(name: str, text: str) -> str:
        normalized = " ".join((text or "").strip().split())
        if not normalized:
            return f"You provided the {SECTION_LABELS.get(name, name)}."

        # Extract the first sentence if present, else truncate
        first_sentence_match = re.match(r"^(.*?[\.\!\?])(\s|$)", normalized)
        if first_sentence_match:
            summary_text = first_sentence_match.group(1).strip()
        else:
            summary_text = normalized[:180].rstrip()
            if len(normalized) > 180:
                summary_text = summary_text.rstrip(".,!?") + "..."
        if not summary_text.endswith((".", "!", "?")):
            summary_text += "."
        return f"You described the {SECTION_LABELS.get(name, name)} as {summary_text}"

    last_user_msg = None
    for m in reversed(messages):
        if m.get("role") == "user":
            last_user_msg = m.get("content", "")
            break

    if last_user_msg is None:
        return {
            "reply": get_section_prompt(section_name),
            "proposal_ready": False,
            "section_index": section_index,
        }

    ok, reprompt = validate_section(section_name, last_user_msg)
    if not ok:
        return {
            "reply": reprompt,
            "proposal_ready": False,
            "section_index": section_index,
        }

    summary = summarize_answer(section_name, last_user_msg)
    if section_index >= len(PROPOSAL_SECTIONS) - 1:
        return {
            "reply": f"Received. {summary} I’ve captured all sections and can generate the proposal now.",
            "proposal_ready": True,
            "section_index": len(PROPOSAL_SECTIONS),
        }

    next_section = PROPOSAL_SECTIONS[section_index + 1]
    return {
        "reply": f"Received. {summary} Next, {get_section_prompt(next_section)}",
        "proposal_ready": False,
        "section_index": section_index + 1,
    }


async def rephrase_and_parse_proposal(proposal_text: str, cta_text: str | None = None) -> dict:
    """
    Parse the proposal and rephrase the upload CTA using the AI model.
    Returns: { "parsed": {...}, "cta": "..." }
    """
    parsed = await parse_uploaded_proposal(proposal_text)

    default_cta = cta_text or "Upload vendor proposal"
    if not OPENROUTER_API_KEY:
        logger.warning("OPENROUTER_API_KEY not set, returning parsed result with default CTA")
        return {"parsed": parsed, "cta": default_cta}

    rephrase_prompt = (
        "You are a UX copywriter. Rewrite the following call-to-action for a file upload button on an application page into a short, friendly, and clear phrase (max 8 words)."
        " Return only the button text, no punctuation.\n\n"
        f"Original: {default_cta}"
    )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": CHAT_MODEL,
                    "messages": [
                        {"role": "system", "content": "You are a helpful copywriter."},
                        {"role": "user", "content": rephrase_prompt},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 50,
                },
                timeout=10.0,
            )

            if response.status_code != 200:
                logger.error(f"OpenRouter error (rephrase): {response.text}")
                return {"parsed": parsed, "cta": default_cta}

            data = response.json()
            cta = data["choices"][0]["message"]["content"].strip()
            # sanitize newlines
            cta = " ".join(cta.splitlines()).strip()
            return {"parsed": parsed, "cta": cta or default_cta}
    except Exception as e:
        logger.error(f"Error rephrasing CTA: {e}")
        return {"parsed": parsed, "cta": default_cta}


async def expand_section_content(
    section_key: str,
    existing_content: str,
    rfp_context: str,
    all_sections: dict | None = None,
) -> str:
    """
    Enhance a proposal section by adding 2-3 contextual lines based on RFP.
    Returns the enhanced section content.
    """
    if not OPENROUTER_API_KEY:
        logger.warning("OPENROUTER_API_KEY not set, returning original content")
        return existing_content

    if not existing_content or not existing_content.strip():
        return existing_content

    section_labels = {
        "vendor_information": "Vendor Information",
        "company_profile": "Company Profile",
        "project_understanding": "Project Understanding",
        "proposed_solution": "Proposed Solution",
        "deliverables": "Deliverables",
        "project_timeline": "Project Timeline",
        "cost_proposal": "Cost Proposal",
        "team_details": "Team Details",
        "past_experience": "Past Experience",
        "risk_management": "Risk Management",
        "support_maintenance": "Support & Maintenance",
        "graphs_visualizations": "Graphs & Visualizations",
        "terms_conditions": "Terms & Conditions",
        "document_uploads": "Document Uploads",
        "final_declaration": "Final Declaration",
    }

    section_label = section_labels.get(section_key, section_key)

    expand_prompt = f"""You are a proposal writing expert. Enhance the following proposal section by adding 2-3 relevant, concrete lines that strengthen the response based on the RFP context.

RFP Context:
{rfp_context[:2000]}

Section: {section_label}
Current Content:
{existing_content}

Add 2-3 lines that:
1. Address requirements mentioned in the RFP
2. Provide concrete details or examples
3. Strengthen the proposal competitively

Return ONLY the enhanced full section content (original + additions), no explanations."""

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": CHAT_MODEL,
                    "messages": [
                        {"role": "system", "content": "You are a proposal writing expert. Enhance sections concisely."},
                        {"role": "user", "content": expand_prompt},
                    ],
                    "temperature": 0.6,
                    "max_tokens": 500,
                },
                timeout=30.0,
            )

            if response.status_code != 200:
                logger.error(f"OpenRouter error (expand section): {response.text}")
                return existing_content

            data = response.json()
            expanded = data["choices"][0]["message"]["content"].strip()
            # If the model returned the original first sentence again, remove
            # the duplicated leading sentence so the caller doesn't see the
            # same text twice when concatenating.
            try:
                first_sentence_match = re.match(r'^(.*?[\.\!\?])(\s|$)', existing_content.strip())
                first_sentence = first_sentence_match.group(1).strip() if first_sentence_match else ""
                if first_sentence and expanded.startswith(first_sentence):
                    # Remove the leading duplicate sentence from the expansion
                    expanded = expanded[len(first_sentence):].lstrip(': -–— \n')
                # Also remove any accidental repeats of the original content
                if existing_content.strip() and existing_content.strip() in expanded:
                    expanded = expanded.replace(existing_content.strip(), "").strip()
                elif first_sentence and first_sentence in expanded:
                    expanded = expanded.replace(first_sentence, "").strip()

                # If expansion is now only a short leftover fragment like "It includes .",
                # discard it to avoid appending meaningless text.
                # Remove leftover empty connectors like "It includes ." if present
                expanded = re.sub(r"\bIt includes\b\s*[\.:;\-–—]*\s*", "", expanded, flags=re.I).strip()

                if len(re.sub(r'[^A-Za-z0-9]', '', expanded)) < 5:
                    expanded = ""
            except Exception:
                pass

            return expanded if expanded else existing_content

    except Exception as e:
        logger.error(f"Error expanding section {section_key}: {e}")
        return existing_content


async def expand_sections_batch(
    section_keys: list[str],
    all_sections: dict,
    rfp_context: str,
) -> dict:
    """
    Expand multiple sections in batch.
    Returns dict mapping section_key -> expanded_content.
    """
    expanded_sections = {}

    for section_key in section_keys:
        existing_content = all_sections.get(section_key, "")
        expanded = await expand_section_content(
            section_key=section_key,
            existing_content=existing_content,
            rfp_context=rfp_context,
            all_sections=all_sections,
        )
        expanded_sections[section_key] = expanded

    return expanded_sections


async def generate_executive_summary(
    all_sections: dict,
    rfp_context: str,
    vendor_name: str,
    contract_title: str,
) -> str:
    """
    Generate an executive summary from all proposal sections.
    """
    if not OPENROUTER_API_KEY:
        logger.warning("OPENROUTER_API_KEY not set, returning empty summary")
        return ""

    sections_text = ""
    for key, content in all_sections.items():
        if content and content.strip():
            section_labels = {
                "vendor_information": "Vendor Information",
                "company_profile": "Company Profile",
                "project_understanding": "Project Understanding",
                "proposed_solution": "Proposed Solution",
                "deliverables": "Deliverables",
                "project_timeline": "Project Timeline",
                "cost_proposal": "Cost Proposal",
                "team_details": "Team Details",
                "past_experience": "Past Experience",
                "risk_management": "Risk Management",
                "support_maintenance": "Support & Maintenance",
                "graphs_visualizations": "Graphs & Visualizations",
                "terms_conditions": "Terms & Conditions",
                "document_uploads": "Document Uploads",
                "final_declaration": "Final Declaration",
            }
            label = section_labels.get(key, key)
            sections_text += f"\n{label}:\n{content}\n"

    summary_prompt = f"""Create a professional executive summary (200-300 words) from the following proposal sections. The summary should highlight:
1. Key strengths and differentiators
2. How we address the RFP requirements
3. Value proposition and timeline
4. Why we're the best choice

RFP Context:
{rfp_context[:1500]}

Vendor: {vendor_name}
Contract: {contract_title}

Proposal Content:
{sections_text[:3000]}

Write a compelling, concise executive summary that a C-level executive would want to read:"""

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": CHAT_MODEL,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are an executive summary writer for business proposals. Create compelling, professional summaries.",
                        },
                        {"role": "user", "content": summary_prompt},
                    ],
                    "temperature": 0.6,
                    "max_tokens": 500,
                },
                timeout=30.0,
            )

            if response.status_code != 200:
                logger.error(f"OpenRouter error (executive summary): {response.text}")
                return ""

            data = response.json()
            summary = data["choices"][0]["message"]["content"].strip()
            return summary if summary else ""

    except Exception as e:
        logger.error(f"Error generating executive summary: {e}")
        return ""
