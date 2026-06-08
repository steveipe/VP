from pathlib import Path
import os

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return

    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and not os.environ.get(key):
                os.environ[key] = value
    except Exception:
        pass


_SETTINGS_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _SETTINGS_DIR.parent.parent

for candidate in (
    _SETTINGS_DIR.parent / ".env.local",
    _PROJECT_ROOT / ".env.local",
    _PROJECT_ROOT / "frontend" / ".env.local",
):
    _load_env_file(candidate)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(
            str(_SETTINGS_DIR.parent / ".env.local"),
            str(_PROJECT_ROOT / ".env.local"),
            str(_PROJECT_ROOT / "frontend" / ".env.local"),
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    frontend_base_url: str = "http://127.0.0.1:3000"
    api_prefix: str = "/api"
    job_store_path: str = str(Path(__file__).resolve().parent / "procurelink_jobs.sqlite3")
    cors_allow_origins_raw: str = Field(
        default="http://127.0.0.1:3000,http://localhost:3000,http://10.214.102.101:3000",
        alias="BACKEND_CORS_ORIGINS",
    )

    # PDFShift configuration
    pdfshift_api_key: str | None = Field(default=None, alias="PDFSHIFT_API_KEY")
    pdfshift_timeout_ms: int = Field(default=30000, alias="PDFSHIFT_TIMEOUT_MS")
    pdfshift_max_retries: int = Field(default=3, alias="PDFSHIFT_MAX_RETRIES")

    @property
    def cors_allow_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allow_origins_raw.split(",") if origin.strip()]


settings = Settings()
