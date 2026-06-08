import base64

from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .proxy import proxy_to_frontend
from .pdf_jobs import create_vendor_pdf_job, get_vendor_pdf_job, serialize_job as serialize_pdf_job
from .ai_service import parse_rfp_with_ai, proposal_chat_ai, expand_sections_batch, generate_executive_summary
from .rfp_parse_jobs import create_rfp_parse_job, get_rfp_parse_job, serialize_rfp_parse_job
from .proposal_parse_jobs import create_proposal_parse_job, get_proposal_parse_job, serialize_proposal_parse_job
from .settings import settings
from .ai_service import rephrase_and_parse_proposal
from .companies import get_all_companies, search_companies, get_company


app = FastAPI(title="ProcureNet Backend - Vendor PDF Generator", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.56\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "vendor-pdf-generator"}


# ═══════════════════════════════════════════════════════════
# Companies / Directory Endpoints
# ═══════════════════════════════════════════════════════════

@app.get("/api/companies")
async def list_companies(limit: int = 50, offset: int = 0):
    """
    Fetch all companies with pagination.
    
    Query params:
    - limit: Number of companies to return (default 50, max 100)
    - offset: Number of companies to skip (default 0)
    """
    try:
        companies = await get_all_companies(limit=limit, offset=offset)
        return {"companies": companies, "count": len(companies)}
    except Exception as e:
        print(f"[Companies] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/companies/search")
async def search_companies_endpoint(query: str, limit: int = 50):
    """
    Search companies by name or industry.
    
    Query params:
    - query: Search term (required)
    - limit: Number of results to return (default 50, max 100)
    """
    if not query or len(query.strip()) < 1:
        raise HTTPException(status_code=400, detail="Search query is required")
    
    try:
        companies = await search_companies(query=query, limit=limit)
        return {"companies": companies, "count": len(companies)}
    except Exception as e:
        print(f"[Companies] Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/companies/{company_id}")
async def get_company_endpoint(company_id: str):
    """
    Fetch a single company profile by ID.
    
    Args:
        company_id: UUID of the company
    """
    try:
        company = await get_company(company_id=company_id)
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
        return {"company": company}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Companies] Error fetching company {company_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════
# AI Service Endpoints
# ═══════════════════════════════════════════════════════════

class ParseRFPRequest(BaseModel):
    rfp_text: str | None = None
    contract_title: str | None = None
    contract_description: str | None = None
    contract_budget: str | None = None
    contract_deadline: str | None = None
    contract_industry: str | None = None


@app.post("/api/ai/parse-rfp")
async def parse_rfp_endpoint(body: ParseRFPRequest):
    """Parse RFP document using AI to extract key information."""
    try:
        rfp_text = body.rfp_text or ""
        if not rfp_text:
            return {
                "rfp_analysis": {
                    "key_requirements": [],
                    "evaluation_criteria": [],
                    "budget_range": "",
                    "timeline_expectations": "",
                    "submission_requirements": [],
                    "questions_for_vendor": [],
                }
            }
        
        analysis = await parse_rfp_with_ai(
            rfp_text,
            title=body.contract_title or "",
            description=body.contract_description or ""
        )
        
        return {"rfp_analysis": analysis}
    except Exception as e:
        print(f"[AI] RFP parsing error: {e}")
        return {
            "rfp_analysis": {
                "key_requirements": [],
                "evaluation_criteria": [],
                "budget_range": "",
                "timeline_expectations": "",
                "submission_requirements": [],
                "questions_for_vendor": [],
            }
        }


@app.post("/api/ai/parse-rfp/background")
async def start_parse_rfp_background_job(body: ParseRFPRequest):
    """
    Queue RFP parsing in the background for faster API responsiveness.
    """
    try:
        payload = body.model_dump()
        job = create_rfp_parse_job(payload)
        print(f"[AI] Created RFP parse job {job.id}")
        return {"job_id": job.id, "status": "queued"}
    except Exception as e:
        print(f"[AI] Error creating RFP parse job: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@app.post("/api/ai/parse-proposal/background")
async def start_parse_proposal_background_job(request: Request):
    """Queue parsing of an uploaded proposal. Accepts JSON: { text?: string, file_url?: string }"""
    try:
        body = await request.json()
        job = create_proposal_parse_job(body)
        print(f"[AI] Created proposal parse job {job.id}")
        return {"job_id": job.id, "status": "queued"}
    except Exception as e:
        print(f"[AI] Error creating proposal parse job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ai/parse-proposal/jobs/{job_id}")
async def get_parse_proposal_background_job(job_id: str):
    try:
        job = get_proposal_parse_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return {"job": serialize_proposal_parse_job(job)}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        print(f"[AI] Error fetching proposal parse job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ai/parse-rfp/jobs/{job_id}")
async def get_parse_rfp_background_job(job_id: str):
    """
    Get RFP parse job status and result.
    """
    try:
        job = get_rfp_parse_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return {"job": serialize_rfp_parse_job(job)}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        print(f"[AI] Error fetching RFP parse job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ProposalChatRequest(BaseModel):
    messages: list[dict]
    rfp_context: str
    section_index: int
    vendor_name: str | None = None


@app.post("/api/ai/proposal-chat")
async def proposal_chat_endpoint(body: ProposalChatRequest):
    """AI-powered chat for guiding proposal building."""
    try:
        response = await proposal_chat_ai(
            messages=body.messages,
            rfp_context=body.rfp_context,
            section_index=body.section_index,
            vendor_name=body.vendor_name or "Vendor"
        )
        return response
    except Exception as e:
        print(f"[AI] Chat error: {e}")
        return {
            "reply": "An error occurred. Please try again.",
            "proposal_ready": False,
            "section_index": body.section_index,
        }


class RephraseAndParseRequest(BaseModel):
    text: str
    cta_text: str | None = None


@app.post("/api/ai/rephrase-and-parse-proposal")
async def rephrase_and_parse_endpoint(body: RephraseAndParseRequest):
    """Rephrase upload CTA and parse proposal text."""
    try:
        result = await rephrase_and_parse_proposal(body.text or "", cta_text=body.cta_text)
        return result
    except Exception as e:
        print(f"[AI] Rephrase and parse error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class GenerateProposalRequest(BaseModel):
    mode: str  # "batch_expand", "expand_section", "executive_summary", etc.
    section_keys: list[str] | None = None
    section_key: str | None = None
    all_sections: dict | None = None
    section_content: str | None = None
    rfp_context: str | None = None
    vendor_name: str | None = None
    contract_title: str | None = None


@app.post("/api/ai/generate-proposal")
async def generate_proposal_endpoint(body: GenerateProposalRequest):
    """
    Proposal generation endpoint supporting multiple modes:
    - batch_expand: Enhance multiple sections with AI details
    - expand_section: Enhance a single section
    - executive_summary: Generate executive summary from all sections
    """
    try:
        if body.mode == "batch_expand":
            if not body.section_keys or not body.all_sections or not body.rfp_context:
                raise HTTPException(status_code=400, detail="Missing required fields for batch_expand")
            
            expanded = await expand_sections_batch(
                section_keys=body.section_keys,
                all_sections=body.all_sections,
                rfp_context=body.rfp_context,
            )
            return {"expanded_sections": expanded}
        
        elif body.mode == "executive_summary":
            if not body.all_sections or not body.rfp_context:
                raise HTTPException(status_code=400, detail="Missing required fields for executive_summary")
            
            summary = await generate_executive_summary(
                all_sections=body.all_sections,
                rfp_context=body.rfp_context,
                vendor_name=body.vendor_name or "Vendor",
                contract_title=body.contract_title or "",
            )
            return {"executive_summary": summary}
        
        else:
            raise HTTPException(status_code=400, detail=f"Unknown mode: {body.mode}")
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"[AI] Generate proposal error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════
# PDF Service Endpoints
# ═══════════════════════════════════════════════════════════

class VendorPdfRequest(BaseModel):
    vendorResponse: dict
    options: dict | None = None


@app.post("/api/vendor/pdf/generate/background")
async def start_vendor_pdf_background_job(body: VendorPdfRequest):
    """
    Queue a vendor PDF generation job.
    
    Accepts vendor response JSON and returns job_id for polling.
    """
    try:
        if not body.vendorResponse:
            return {"error": "vendorResponse is required"}, 400
        
        job = create_vendor_pdf_job(body.vendorResponse, options=body.options)
        print(f"[PDF] Created job {job.job_id}")
        return {"job_id": job.job_id, "status": "queued"}
    except Exception as e:
        print(f"[PDF] Error creating job: {e}")
        return {"error": str(e)}, 500


@app.get("/api/vendor/pdf/generate/jobs/{job_id}")
async def get_vendor_pdf_background_job(job_id: str):
    """
    Get PDF generation job status and result.
    
    Returns job state including pdf_base64 when completed.
    """
    try:
        job = get_vendor_pdf_job(job_id)
        if not job:
            return {"error": "Job not found"}, 404
        return {"job": serialize_pdf_job(job)}
    except Exception as e:
        print(f"[PDF] Error fetching job {job_id}: {e}")
        return {"error": str(e)}, 500


@app.get("/api/vendor/pdf/generate/jobs/{job_id}/download")
async def download_vendor_pdf(job_id: str):
    job = get_vendor_pdf_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="PDF job not found")
    if job.status != "completed" or not job.pdf_base64:
        raise HTTPException(status_code=409, detail="PDF is not yet ready")

    pdf_bytes = base64.b64decode(job.pdf_base64)
    filename = f"proposal_{job_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""},
    )


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def api_proxy(path: str, request: Request):
    return await proxy_to_frontend(request, settings.frontend_base_url, f"/api/{path}")
