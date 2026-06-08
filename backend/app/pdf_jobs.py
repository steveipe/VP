from __future__ import annotations

import asyncio
import base64
from copy import deepcopy
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .job_store import JobStore, StoredJob
from .settings import settings
from .pdfshift_client import convert_html_to_pdf
from .vendor_html_renderer import render_vendor_response_to_html


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class PdfJobState:
    job_id: str
    status: str = "queued"
    progress: dict[str, Any] | None = None
    result: dict[str, Any] | None = None
    pdf_base64: str | None = None
    error: str | None = None
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)


_jobs: dict[str, PdfJobState] = {}
_job_store = JobStore(settings.job_store_path)


def create_vendor_pdf_job(vendor_response: dict[str, Any], contract_id: str | None = None, options: dict[str, Any] | None = None) -> PdfJobState:
    """Create a new PDF generation job for vendor response."""
    job = PdfJobState(job_id=uuid4().hex)
    _jobs[job.job_id] = job
    # Store a deep copy of the request payload to avoid later mutation
    request_payload = {"vendor_response": deepcopy(vendor_response), "contract_id": contract_id, "options": deepcopy(options)}

    _job_store.upsert_job(
        StoredJob(
            job_id=job.job_id,
            kind="vendor_pdf",
            status=job.status,
            progress=job.progress,
            result=job.result,
            pdf_base64=job.pdf_base64,
            decomposition=None,
            error=job.error,
            request=request_payload,
            created_at=job.created_at,
            updated_at=job.updated_at,
        )
    )
    # Pass deep copies into the background task to avoid accidental mutation
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_run_vendor_pdf_job(job.job_id, deepcopy(vendor_response), deepcopy(options)))
    except RuntimeError:
        # In a synchronous or test context without an event loop, run the job inline.
        asyncio.run(_run_vendor_pdf_job(job.job_id, deepcopy(vendor_response), deepcopy(options)))
    return job


def get_vendor_pdf_job(job_id: str) -> PdfJobState | None:
    """Get PDF generation job by ID."""
    job = _jobs.get(job_id)
    if not job:
        # Try loading from job store
        stored = _job_store.get_job(job_id)
        if stored and stored.kind == "vendor_pdf":
            job = PdfJobState(
                job_id=stored.job_id,
                status=stored.status,
                progress=stored.progress,
                result=stored.result,
                pdf_base64=stored.pdf_base64,
                error=stored.error,
                created_at=stored.created_at,
                updated_at=stored.updated_at,
            )
            _jobs[job_id] = job
    return job


def serialize_job(job: PdfJobState) -> dict[str, Any]:
    """Serialize job state for API response."""
    return {
        "job_id": job.job_id,
        "status": job.status,
        "progress": job.progress,
        "result": job.result,
        "pdf_base64": job.pdf_base64,
        "error": job.error,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }


async def _run_vendor_pdf_job(job_id: str, vendor_response: dict[str, Any], options: dict[str, Any] | None = None) -> None:
    """Background task to generate PDF."""
    job = _jobs.get(job_id)
    if not job:
        return
    
    try:
        # Update status to rendering
        job.status = "rendering"
        job.progress = {"step": "rendering HTML from vendor response"}
        job.updated_at = _now()
        _persist_job(job)
        
        print(f"[PDF Job {job_id}] Rendering HTML...")
        html = render_vendor_response_to_html(vendor_response, options)
        print(f"[PDF Job {job_id}] HTML rendering successful: {len(html)} chars")
        
        # Update status to generating PDF
        job.status = "generating_pdf"
        job.progress = {"step": "calling PDFShift API"}
        job.updated_at = _now()
        _persist_job(job)
        
        print(f"[PDF Job {job_id}] Converting HTML to PDF via PDFShift...")
        pdf_bytes = convert_html_to_pdf(html)
        print(f"[PDF Job {job_id}] PDF conversion successful: {len(pdf_bytes)} bytes")
        
        # Convert PDF bytes to base64
        pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
        
        # Update job with result
        job.status = "completed"
        job.pdf_base64 = pdf_base64
        job.result = {
            "pdf_size_bytes": len(pdf_bytes),
            "timestamp": _now(),
            "status": "completed",
            "download_url": f"/api/vendor/pdf/generate/jobs/{job_id}/download",
        }
        job.progress = {"step": "completed"}
        job.updated_at = _now()
        _persist_job(job)
        
        print(f"[PDF Job {job_id}] Success: {len(pdf_bytes)} bytes")
    
    except Exception as e:
        import traceback

        print(f"[PDF Job {job_id}] Error: {e}")
        print(f"[PDF Job {job_id}] Error type: {type(e).__name__}")
        print(f"[PDF Job {job_id}] vendor_response keys: {list(vendor_response.keys()) if isinstance(vendor_response, dict) else type(vendor_response)}")
        print(f"[PDF Job {job_id}] options: {options}")
        traceback.print_exc()
        job.status = "failed"
        job.error = str(e)
        job.progress = {"step": "failed", "error": str(e)}
        job.updated_at = _now()
        _persist_job(job)


def _persist_job(job: PdfJobState) -> None:
    """Persist job state to store."""
    # Preserve the original request payload if it exists in the store
    existing = _job_store.get_job(job.job_id)
    request_payload = existing.request if existing and existing.request else None

    _job_store.upsert_job(
        StoredJob(
            job_id=job.job_id,
            kind="vendor_pdf",
            status=job.status,
            progress=job.progress,
            result=job.result,
            pdf_base64=job.pdf_base64,
            decomposition=None,
            error=job.error,
            request=request_payload,
            created_at=job.created_at,
            updated_at=job.updated_at,
        )
    )
