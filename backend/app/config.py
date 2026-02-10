"""Application configuration using pydantic-settings"""

from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Satellite Processor API"
    debug: bool = True
    
    # Database
    database_url: str = "sqlite+aiosqlite:///./data/satellite_processor.db"
    
    # Storage paths
    storage_path: str = "./data"
    upload_dir: str = "./data/uploads"
    output_dir: str = "./data/output"
    temp_dir: str = "./data/temp"
    
    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure directories exist
for d in [settings.storage_path, settings.upload_dir, settings.output_dir, settings.temp_dir]:
    Path(d).mkdir(parents=True, exist_ok=True)
