"""Settings endpoints — reads/writes from database with JSON file fallback."""

import json
import logging
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db.database import get_db
from ..db.models import AppSetting

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])

_SETTINGS_FILE = Path(settings.storage_path) / "app_settings.json"
_DEFAULTS = {
    "default_crop": {"x": 0, "y": 0, "w": 1920, "h": 1080},
    "default_false_color": "vegetation",
    "timestamp_enabled": True,
    "timestamp_position": "bottom-left",
    "video_fps": 24,
    "video_codec": "h264",
    "video_quality": 23,
}


class CropSettings(BaseModel):
    x: int = 0
    y: int = 0
    w: int = 1920
    h: int = 1080


class SettingsUpdate(BaseModel):
    default_crop: CropSettings | None = None
    default_false_color: Literal["vegetation", "fire", "water_vapor", "dust", "airmass"] | None = None
    timestamp_enabled: bool | None = None
    timestamp_position: Literal["top-left", "top-right", "bottom-left", "bottom-right"] | None = None
    video_fps: int | None = Field(default=None, ge=1, le=120)
    video_codec: Literal["h264", "hevc", "av1"] | None = None
    video_quality: int | None = Field(default=None, ge=0, le=51)


def _load_file_defaults() -> dict:
    """Load settings from legacy JSON file, falling back to hardcoded defaults."""
    if _SETTINGS_FILE.exists():
        try:
            return json.loads(_SETTINGS_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            logger.warning("Failed to read legacy settings file, using defaults")
    return dict(_DEFAULTS)


async def _load_from_db(db: AsyncSession) -> dict:
    """Load all settings from database. If empty, seed from file/defaults."""
    result = await db.execute(select(AppSetting))
    rows = result.scalars().all()

    if rows:
        return {row.key: row.value for row in rows}

    # DB empty — seed from file defaults (backward compat)
    defaults = _load_file_defaults()
    for key, value in defaults.items():
        db.add(AppSetting(key=key, value=value))
    await db.commit()
    return defaults


async def _save_to_db(db: AsyncSession, data: dict) -> None:
    """Upsert settings into the database."""
    for key, value in data.items():
        existing = (
            await db.execute(select(AppSetting).where(AppSetting.key == key))
        ).scalars().first()
        if existing:
            existing.value = value
        else:
            db.add(AppSetting(key=key, value=value))
    await db.commit()


@router.get("")
async def get_settings(db: AsyncSession = Depends(get_db)):
    return await _load_from_db(db)


@router.put("")
async def update_settings(body: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    current = await _load_from_db(db)
    update_data = body.model_dump(exclude_none=True)
    # Convert nested models to dicts for JSON serialization
    for key, val in update_data.items():
        if isinstance(val, BaseModel):
            update_data[key] = val.model_dump()
    current.update(update_data)
    await _save_to_db(db, current)
    return current
