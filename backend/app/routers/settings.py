"""Settings endpoints — reads/writes from database with JSON file fallback."""

import json
import logging
from pathlib import Path
from typing import Literal

import sqlalchemy.exc
from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db.database import DbSession
from ..db.models import AppSetting
from ..errors import API_ERROR_RESPONSES, APIError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"], responses=API_ERROR_RESPONSES)

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


_CROP_MAX_AXIS = 32_000


class CropSettings(BaseModel):
    """Default crop bounds. All coordinates must be non-negative and within
    a sane axis limit (JTN-474 ISSUE-060, -069)."""

    model_config = ConfigDict(extra="forbid")

    x: int = Field(default=0, ge=0, le=_CROP_MAX_AXIS)
    y: int = Field(default=0, ge=0, le=_CROP_MAX_AXIS)
    w: int = Field(default=1920, ge=1, le=_CROP_MAX_AXIS)
    h: int = Field(default=1080, ge=1, le=_CROP_MAX_AXIS)


class SettingsUpdate(BaseModel):
    """Request schema for ``PUT /api/settings``.

    JTN-474 ISSUE-073: ``extra="forbid"`` so typos like
    ``completely_unknown_field`` return 422 instead of being silently
    dropped on the floor.
    """

    model_config = ConfigDict(extra="forbid")

    default_crop: CropSettings | None = None
    default_false_color: Literal["vegetation", "fire", "water_vapor", "dust", "airmass"] | None = None
    timestamp_enabled: bool | None = None
    timestamp_position: Literal["top-left", "top-right", "bottom-left", "bottom-right"] | None = None
    video_fps: int | None = Field(default=None, ge=1, le=60)
    video_codec: Literal["h264", "hevc", "av1"] | None = None
    video_quality: int | None = Field(default=None, ge=0, le=51)
    max_frames_per_fetch: int | None = Field(default=None, ge=50, le=1000)
    webhook_url: str | None = None


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
        data: dict = {}
        for row in rows:
            try:
                data[row.key] = json.loads(row.value)
            except (json.JSONDecodeError, TypeError):
                data[row.key] = row.value
        return data

    # DB empty — seed from file defaults (backward compat)
    defaults = _load_file_defaults()
    for key, value in defaults.items():
        db.add(AppSetting(key=key, value=value))
    await db.commit()
    return defaults


async def _save_to_db(db: AsyncSession, data: dict) -> None:
    """Upsert settings into the database."""
    for key, value in data.items():
        # Bug #1: Ensure all values are JSON-serializable primitives.
        # Dict/list values must be serialized to JSON strings for the text column.
        if isinstance(value, (dict, list)):
            value = json.dumps(value)
        await db.merge(AppSetting(key=key, value=value))
    await db.commit()


@router.get("")
async def get_settings(db: DbSession):
    try:
        return await _load_from_db(db)
    except sqlalchemy.exc.SQLAlchemyError:
        logger.exception("Failed to load settings from DB, returning defaults")
        return _load_file_defaults()


@router.put("")
async def update_settings(body: SettingsUpdate, db: DbSession):
    try:
        current = await _load_from_db(db)
        update_data = body.model_dump(exclude_none=True)
        # Convert nested models to dicts for JSON serialization
        for key, val in update_data.items():
            if isinstance(val, BaseModel):
                update_data[key] = val.model_dump()
        current.update(update_data)
        await _save_to_db(db, current)
        return current
    except sqlalchemy.exc.SQLAlchemyError:
        logger.exception("Failed to save settings to DB")
        await db.rollback()
        raise APIError(500, "db_error", "Failed to save settings")
    except (ValueError, TypeError, KeyError):
        logger.exception("Unexpected error saving settings")
        await db.rollback()
        raise
