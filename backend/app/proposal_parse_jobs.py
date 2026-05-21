from __future__ import annotations

import asyncio
import base64
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import logging

from .ai_service import parse_uploaded_proposal
from .job_store import JobStore, StoredJob
from .settings import settings


logger = logging.getLogger(__name__)


def _extract_pdf_text(data: bytes) -> str:
    try:
        from io import BytesIO

        from pypdf import PdfReader

        reader = PdfReader(BytesIO(data))
        texts: list[str] = []
        for page in reader.pages:
            try:
                texts.append(page.extract_text() or "")
            except Exception:
                texts.append("")
        return "\n\n".join(text for text in texts if text).strip()
    except Exception as error:  # noqa: BLE001
        logger.debug("PDF text extraction failed: %s", error)
        return ""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ProposalParseJobState:
    id: str
    status: str = "queued"
    progress_message: str = "Queued"
    progress_percent: int = 0
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)
    request: dict[str, Any] | None = None


_jobs: dict[str, ProposalParseJobState] = {}
_job_store = JobStore(settings.job_store_path)


def _to_store(job: ProposalParseJobState) -> StoredJob:
    return StoredJob(
        job_id=job.id,
        kind="proposal_parse",
        status=job.status,
        progress={"message": job.progress_message, "percent": job.progress_percent},
        result=job.result,
        pdf_base64=None,
        decomposition=None,
        error=job.error,
        request=job.request,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _from_store(stored: StoredJob) -> ProposalParseJobState:
    progress = stored.progress or {}
    return ProposalParseJobState(
        id=stored.job_id,
        status=stored.status,
        progress_message=str(progress.get("message") or "Queued"),
        progress_percent=int(progress.get("percent") or 0),
        result=stored.result,
        error=stored.error,
        created_at=stored.created_at,
        updated_at=stored.updated_at,
        request=stored.request,
    )


def create_proposal_parse_job(input: dict[str, Any]) -> ProposalParseJobState:
    job = ProposalParseJobState(id=uuid4().hex, request=input)
    _jobs[job.id] = job
    _job_store.upsert_job(_to_store(job))
    asyncio.create_task(_run_background_parse(job.id, input))
    return job


def get_proposal_parse_job(job_id: str) -> ProposalParseJobState | None:
    job = _jobs.get(job_id)
    if job:
        return job

    stored = _job_store.get_job(job_id)
    if not stored or stored.kind != "proposal_parse":
        return None

    restored = _from_store(stored)
    _jobs[job_id] = restored
    return restored


def update_proposal_parse_job(job_id: str, **patch: Any) -> ProposalParseJobState | None:
    current = get_proposal_parse_job(job_id)
    if not current:
        return None

    updated = ProposalParseJobState(
        id=current.id,
        status=str(patch.get("status", current.status)),
        progress_message=str(patch.get("progress_message", current.progress_message)),
        progress_percent=int(patch.get("progress_percent", current.progress_percent)),
        result=patch.get("result", current.result),
        error=patch.get("error", current.error),
        created_at=current.created_at,
        updated_at=_now(),
        request=patch.get("request", current.request),
    )

    _jobs[job_id] = updated
    _job_store.upsert_job(_to_store(updated))
    return updated


async def _run_background_parse(job_id: str, body: dict[str, Any]) -> None:
    try:
        update_proposal_parse_job(job_id, status="running", progress_message="Preparing proposal text", progress_percent=10)

        # Determine source of text: direct text payload or file_url
        proposal_text = str(body.get("text") or "")

        if not proposal_text and body.get("file_url"):
            update_proposal_parse_job(job_id, status="running", progress_message="Downloading file", progress_percent=25)
            # Download file and extract PDF text from the raw bytes.
            import httpx
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    r = await client.get(str(body.get("file_url")))
                    if r.status_code == 200:
                        proposal_text = _extract_pdf_text(r.content)
            except Exception as e:
                logger.error("Failed to download file for proposal parse: %s", e)

            # If still no text, but file bytes were provided as base64, try extracting
            if not proposal_text and body.get("file_base64"):
                try:
                    raw = base64.b64decode(str(body.get("file_base64")))
                    proposal_text = _extract_pdf_text(raw)
                except Exception as e:
                    logger.error("Failed to decode base64 file for parse: %s", e)

        if not proposal_text.strip():
            update_proposal_parse_job(
                job_id,
                status="running",
                progress_message="No text found; sending best-effort parse",
                progress_percent=50,
            )

        else:
            update_proposal_parse_job(job_id, status="running", progress_message="Running AI parse", progress_percent=60)

        parsed = {}
        try:
            parsed = await parse_uploaded_proposal(proposal_text or "")
        except Exception as e:
            logger.error("AI parse failed: %s", e)
            parsed = {}

        # If AI returned empty or invalid parse, fall back to a heuristic sections structure
        if not parsed or not isinstance(parsed, dict) or not parsed.get("sections"):
            logger.warning("AI parse returned empty result; populating fallback sections")
            # Define section keys expected by frontend
            section_keys = [
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
            ]
            sections = {k: "" for k in section_keys}
            parsed = {
                "proposal_title": (body.get("file_name") or "Uploaded Proposal") + " Proposal",
                "sections": sections,
                "extracted_price": "",
                "extracted_timeline": "",
            }

        update_proposal_parse_job(
            job_id,
            status="running",
            progress_message="Finalizing parsed proposal",
            progress_percent=90,
        )

        update_proposal_parse_job(
            job_id,
            status="completed",
            progress_message="Parsing complete",
            progress_percent=100,
            result=parsed,
        )
    except Exception as error:  # noqa: BLE001
        update_proposal_parse_job(
            job_id,
            status="failed",
            progress_message="Parsing failed",
            progress_percent=100,
            error=str(error),
        )


def serialize_proposal_parse_job(job: ProposalParseJobState) -> dict[str, Any]:
    payload = asdict(job)
    payload["progress"] = {
        "message": job.progress_message,
        "percent": job.progress_percent,
    }
    return payload