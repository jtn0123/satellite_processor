"""Settings endpoints — backed by database."""

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db.models import AppSettings

router = APIRouter(prefix="/api/settings", tags=["settings"])

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
    webhook_url: str | None = None


async def _load(db: AsyncSession) -> dict:
    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    row = result.scalars().first()
    if row is None:
        # First load — seed defaults
        row = AppSettings(id=1, data=dict(_DEFAULTS))
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return dict(row.data)


async def _save(db: AsyncSession, data: dict) -> None:
    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    row = result.scalars().first()
    if row is None:
        row = AppSettings(id=1, data=data)
        db.add(row)
    else:
        row.data = data
    await db.commit()


@router.get("")
async def get_settings(db: AsyncSession = Depends(get_db)):
    return await _load(db)


@router.put("")
async def update_settings(body: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    current = await _load(db)
    update_data = body.model_dump(exclude_none=True)
    for key, val in update_data.items():
        if isinstance(val, BaseModel):
            update_data[key] = val.model_dump()
    current.update(update_data)
    await _save(db, current)
    return current
