"""Preset CRUD endpoints"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..db.database import DbSession
from ..db.models import Preset
from ..errors import APIError
from ..models.settings import PresetCreate
from ..utils import sanitize_log

logger = logging.getLogger(__name__)


class PresetRename(BaseModel):
    name: str = Field(min_length=1, max_length=100)


router = APIRouter(prefix="/api/presets", tags=["presets"])


@router.get("")
async def list_presets(
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """List presets with pagination (#160)."""
    logger.debug("Listing presets: limit=%d, offset=%d", limit, offset)
    result = await db.execute(select(Preset).order_by(Preset.name).offset(offset).limit(limit))
    presets = result.scalars().all()
    return [{"id": p.id, "name": p.name, "params": p.params, "created_at": str(p.created_at)} for p in presets]


@router.post("")
async def create_preset(preset_in: PresetCreate, db: DbSession):
    """Create a preset"""
    logger.info("Creating preset: name=%s", sanitize_log(preset_in.name))
    result = await db.execute(select(Preset).where(Preset.name == preset_in.name))
    if result.scalar_one_or_none():
        raise APIError(409, "duplicate_preset", f"Preset '{preset_in.name}' already exists")

    db_preset = Preset(name=preset_in.name, params=preset_in.params)
    db.add(db_preset)
    await db.commit()
    await db.refresh(db_preset)
    return {"id": db_preset.id, "name": db_preset.name}


@router.patch("/{name}")
async def rename_preset(name: str, body: PresetRename, db: DbSession):
    """Rename a preset"""
    logger.info("Renaming preset: %s -> %s", sanitize_log(name), sanitize_log(body.name))
    result = await db.execute(select(Preset).where(Preset.name == name))
    preset = result.scalar_one_or_none()
    if not preset:
        raise APIError(404, "not_found", "Preset not found")

    # Check new name not taken
    if body.name != name:
        dup = await db.execute(select(Preset).where(Preset.name == body.name))
        if dup.scalar_one_or_none():
            raise APIError(409, "duplicate_preset", f"Preset '{body.name}' already exists")

    preset.name = body.name
    await db.commit()
    await db.refresh(preset)
    return {"id": preset.id, "name": preset.name}


@router.delete("/{name}")
async def delete_preset(name: str, db: DbSession):
    """Delete a preset by name"""
    logger.info("Deleting preset: name=%s", sanitize_log(name))
    result = await db.execute(select(Preset).where(Preset.name == name))
    preset = result.scalar_one_or_none()
    if not preset:
        raise APIError(404, "not_found", "Preset not found")

    await db.delete(preset)
    await db.commit()
    return {"deleted": True}
