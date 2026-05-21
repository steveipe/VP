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
    ]
    
    section_name = PROPOSAL_SECTIONS[section_index] if section_index < len(PROPOSAL_SECTIONS) else "final_declaration"
    
    # Build system prompt
    system_prompt = f"""You are an expert proposal consultant helping {vendor_name} build a winning proposal.

RFP Context:
{rfp_context}

Current section being filled: Section {section_index + 1} - {section_name}

Guide the user through building the proposal. Ask specific, actionable questions about the current section.
If all sections are complete (14 sections), respond with PROPOSAL_READY in your response.

Be professional, concise, and help them write winning proposals."""

    # Convert chat messages to OpenRouter format
    chat_messages = [
        {
            "role": msg["role"],
            "content": msg["content"]
        }
        for msg in messages
    ]

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
                    "messages": chat_messages,
                    "system": system_prompt,
                    "temperature": 0.7,
                    "max_tokens": 500,
                },
                timeout=30.0,
            )
            
            if response.status_code != 200:
                logger.error(f"OpenRouter error: {response.text}")
                return {
                    "reply": "Error generating response. Please try again.",
                    "proposal_ready": False,
                    "section_index": section_index,
                }
            
            data = response.json()
            reply = data["choices"][0]["message"]["content"]
            
            # Check if proposal is ready
            proposal_ready = "PROPOSAL_READY" in reply
            
            # Determine next section index
            next_section_index = section_index
            if proposal_ready or section_index >= len(PROPOSAL_SECTIONS) - 1:
                next_section_index = len(PROPOSAL_SECTIONS)
            elif "section" in reply.lower() or "next" in reply.lower():
                next_section_index = section_index + 1
            
            # Remove the marker if present
            reply = reply.replace("PROPOSAL_READY", "").strip()
            
            return {
                "reply": reply,
                "proposal_ready": proposal_ready,
                "section_index": next_section_index,
            }
            
    except Exception as e:
        logger.error(f"Error in proposal chat: {e}")
        return {
            "reply": f"An error occurred: {str(e)}",
            "proposal_ready": False,
            "section_index": section_index,
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
