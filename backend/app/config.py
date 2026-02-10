"""Application configuration using pydantic-settings"""

import logging
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Satellite Processor API"
    debug: bool = False

    # Database
    database_url: str = "sqlite+aiosqlite:///./data/satellite_processor.db"

    # Storage paths
    storage_path: str = "./data"
    upload_dir: str | None = None
    output_dir: str | None = None
    temp_dir: str | None = None

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Authentication (optional — if unset, auth is disabled)
    api_key: str = ""

    @model_validator(mode="after")
    def derive_paths(self):
        base = self.storage_path
        if self.upload_dir is None:
            self.upload_dir = str(Path(base) / "uploads")
        if self.output_dir is None:
            self.output_dir = str(Path(base) / "output")
        if self.temp_dir is None:
            self.temp_dir = str(Path(base) / "temp")
        return self

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

# Ensure directories exist
for d in [settings.storage_path, settings.upload_dir, settings.output_dir, settings.temp_dir]:
    Path(d).mkdir(parents=True, exist_ok=True)

# #70: Warn if DATABASE_URL is still SQLite in non-debug mode
if not settings.debug and "sqlite" in settings.database_url.lower():
    logging.getLogger(__name__).warning(
        "DATABASE_URL is using SQLite in non-debug mode. "
        "Consider switching to PostgreSQL for production."
    )
