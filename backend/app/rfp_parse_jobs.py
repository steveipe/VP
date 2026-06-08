from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .ai_service import parse_rfp_with_ai
from .job_store import JobStore, StoredJob
from .settings import settings


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class RfpParseJobState:
    id: str
    status: str = "queued"
    progress_message: str = "Queued"
    progress_percent: int = 0
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)
    request: dict[str, Any] | None = None


_jobs: dict[str, RfpParseJobState] = {}
_job_store = JobStore(settings.job_store_path)


def _to_store(job: RfpParseJobState) -> StoredJob:
    return StoredJob(
        job_id=job.id,
        kind="rfp_parse",
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


def _from_store(stored: StoredJob) -> RfpParseJobState:
    progress = stored.progress or {}
    return RfpParseJobState(
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


def create_rfp_parse_job(input: dict[str, Any]) -> RfpParseJobState:
    job = RfpParseJobState(id=uuid4().hex, request=input)
    _jobs[job.id] = job
    _job_store.upsert_job(_to_store(job))
    asyncio.create_task(_run_background_parse(job.id, input))
    return job


def get_rfp_parse_job(job_id: str) -> RfpParseJobState | None:
    job = _jobs.get(job_id)
    if job:
        return job

    stored = _job_store.get_job(job_id)
    if not stored or stored.kind != "rfp_parse":
        return None

    restored = _from_store(stored)
    _jobs[job_id] = restored
    return restored


def update_rfp_parse_job(job_id: str, **patch: Any) -> RfpParseJobState | None:
    current = get_rfp_parse_job(job_id)
    if not current:
        return None

    updated = RfpParseJobState(
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
        update_rfp_parse_job(job_id, status="running", progress_message="Preparing RFP text", progress_percent=10)

        rfp_text = str(body.get("rfp_text") or "")
        if not rfp_text.strip():
            update_rfp_parse_job(
                job_id,
                status="completed",
                progress_message="No text to parse",
                progress_percent=100,
                result={
                    "key_requirements": [],
                    "evaluation_criteria": [],
                    "budget_range": "",
                    "timeline_expectations": "",
                    "submission_requirements": [],
                    "questions_for_vendor": [],
                },
            )
            return

        update_rfp_parse_job(job_id, status="running", progress_message="Running AI analysis", progress_percent=60)

        analysis = await parse_rfp_with_ai(
            rfp_text,
            title=str(body.get("contract_title") or ""),
            description=str(body.get("contract_description") or ""),
        )

        # Ensure analysis has the expected shape. If the AI failed or returned
        # invalid/empty output, fall back to a safe, empty structure so the
        # frontend doesn't receive an empty object and break parsing flows.
        if not isinstance(analysis, dict) or not any(k in analysis for k in (
            "key_requirements",
            "evaluation_criteria",
            "budget_range",
            "timeline_expectations",
        )):
            analysis = {
                "key_requirements": [],
                "evaluation_criteria": [],
                "budget_range": "",
                "timeline_expectations": "",
                "submission_requirements": [],
                "questions_for_vendor": [],
            }

        update_rfp_parse_job(
            job_id,
            status="running",
            progress_message="Finalizing extracted requirements",
            progress_percent=90,
        )

        update_rfp_parse_job(
            job_id,
            status="completed",
            progress_message="Analysis complete",
            progress_percent=100,
            result=analysis,
        )
    except Exception as error:  # noqa: BLE001
        update_rfp_parse_job(
            job_id,
            status="failed",
            progress_message="Analysis failed",
            progress_percent=100,
            error=str(error),
        )


def serialize_rfp_parse_job(job: RfpParseJobState) -> dict[str, Any]:
    payload = asdict(job)
    payload["progress"] = {
        "message": job.progress_message,
        "percent": job.progress_percent,
    }
    return payload
