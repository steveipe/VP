import requests
import time
import os
from pathlib import Path
from typing import Optional, Dict, Any

from .settings import settings

PDFSHIFT_BASE_URL = "https://api.pdfshift.io/v3/convert/pdf"


def _load_pdfshift_key_from_backend_env() -> str | None:
    env_file = Path(__file__).resolve().parent.parent / ".env.local"
    if not env_file.exists():
        return None

    try:
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if not line or line.strip().startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() == "PDFSHIFT_API_KEY":
                return value.strip().strip('"').strip("'")
    except Exception:
        pass

    return None


def _pdfshift_api_key() -> str | None:
    return _load_pdfshift_key_from_backend_env() or settings.pdfshift_api_key or os.getenv("PDFSHIFT_API_KEY")


def _pdfshift_timeout_ms() -> int:
    return settings.pdfshift_timeout_ms or int(os.getenv("PDFSHIFT_TIMEOUT_MS", "30000"))


def _pdfshift_max_retries() -> int:
    return settings.pdfshift_max_retries or int(os.getenv("PDFSHIFT_MAX_RETRIES", "3"))

def convert_html_to_pdf(html_string: str, options: Optional[Dict[str, Any]] = None) -> bytes:
    """
    Convert HTML to PDF using PDFShift API.
    
    Args:
        html_string: HTML content
        options: PDFShift options (format, margin, landscape, etc.)
    
    Returns:
        PDF bytes
    
    Raises:
        ValueError: Missing API key or empty HTML
        RuntimeError: PDFShift API errors, timeouts, max retries exceeded
    """
    api_key = _pdfshift_api_key()
    if not api_key:
        raise ValueError("PDFSHIFT_API_KEY not set. Add it to backend/.env.local or the workspace .env.local.")

    if not html_string or not html_string.strip():
        raise ValueError("HTML content cannot be empty")
    
    payload = {
        "source": html_string,
        "format": "A4",
        "margin": "10mm",
        **(options or {})
    }
    
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": api_key,
        "X-Processor-Version": "142",
    }
    
    timeout_sec = _pdfshift_timeout_ms() / 1000.0
    last_error = None
    max_retries = _pdfshift_max_retries()

    for attempt in range(max_retries):
        try:
            print(f"[PDFShift] Attempt {attempt + 1}/{max_retries}")
            response = requests.post(
                PDFSHIFT_BASE_URL,
                json=payload,
                headers=headers,
                timeout=timeout_sec,
            )

            if response.status_code == 200:
                print(f"[PDFShift] Success: {response.headers.get('Content-Length', '?')} bytes")
                return response.content

            if response.status_code == 429:
                wait_time = (2 ** attempt) * 0.5
                print(f"[PDFShift] Rate limited (429), retrying in {wait_time}s")
                last_error = f"Rate limited: {response.text[:200]}"
                time.sleep(wait_time)
                continue

            error_text = response.text[:500]
            print(f"[PDFShift] Error {response.status_code}: {error_text}")
            last_error = f"HTTP {response.status_code}: {error_text}"

            if response.status_code >= 500 and attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 0.5
                print(f"[PDFShift] Server error, retrying in {wait_time}s")
                time.sleep(wait_time)
                continue

            raise RuntimeError(last_error)

        except requests.Timeout:
            print(f"[PDFShift] Timeout on attempt {attempt + 1}")
            last_error = f"Timeout after {timeout_sec}s"
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 0.5
                time.sleep(wait_time)
                continue
            raise RuntimeError(last_error)

        except requests.RequestException as e:
            print(f"[PDFShift] Request error: {e}")
            last_error = f"Network error: {str(e)}"
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 0.5
                time.sleep(wait_time)
                continue
            raise RuntimeError(last_error)
    
    raise RuntimeError(f"Max retries exceeded. Last error: {last_error}")
