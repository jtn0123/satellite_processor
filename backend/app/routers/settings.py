"""Settings endpoints"""

import json
from pathlib import Path
from fastapi import APIRouter
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
async def update_settings(body: dict):
    current = _load()
    current.update(body)
    _save(current)
    return current
