"""Settings endpoints"""

import json
from pathlib import Path
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..config import settings

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


# #20 / #54: Pydantic model for valid settings keys
class CropSettings(BaseModel):
    x: int = 0
    y: int = 0
    w: int = 1920
    h: int = 1080


class SettingsUpdate(BaseModel):
    default_crop: CropSettings | None = None
    default_false_color: Literal["vegetation", "fire", "natural", "urban", "water"] | None = None
    timestamp_enabled: bool | None = None
    timestamp_position: Literal["top-left", "top-right", "bottom-left", "bottom-right"] | None = None
    video_fps: int | None = Field(default=None, ge=1, le=120)
    video_codec: Literal["h264", "h265", "vp9"] | None = None
    video_quality: int | None = Field(default=None, ge=0, le=51)


def _load() -> dict:
    if _SETTINGS_FILE.exists():
        return json.loads(_SETTINGS_FILE.read_text())
    return dict(_DEFAULTS)


def _save(data: dict):
    _SETTINGS_FILE.write_text(json.dumps(data, indent=2))


@router.get("")
async def get_settings():
    return _load()


@router.put("")
async def update_settings(body: SettingsUpdate):
    current = _load()
    update_data = body.model_dump(exclude_none=True)
    # Convert nested models to dicts for JSON serialization
    for key, val in update_data.items():
        if isinstance(val, BaseModel):
            update_data[key] = val.model_dump()
    current.update(update_data)
    _save(current)
    return current
