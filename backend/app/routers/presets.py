"""Preset CRUD endpoints"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db.models import Preset
from ..errors import APIError
from ..models.settings import PresetCreate

router = APIRouter(prefix="/api/presets", tags=["presets"])


@router.get("")
async def list_presets(db: AsyncSession = Depends(get_db)):
    """List all presets"""
    result = await db.execute(select(Preset).order_by(Preset.name))
    presets = result.scalars().all()
    return [
        {"id": p.id, "name": p.name, "params": p.params, "created_at": str(p.created_at)}
        for p in presets
    ]


@router.post("")
async def create_preset(preset_in: PresetCreate, db: AsyncSession = Depends(get_db)):
    """Create a preset"""
    # Check for duplicate name
    result = await db.execute(select(Preset).where(Preset.name == preset_in.name))
    if result.scalar_one_or_none():
        raise APIError(409, "duplicate_preset", f"Preset '{preset_in.name}' already exists")

    db_preset = Preset(name=preset_in.name, params=preset_in.params)
    db.add(db_preset)
    await db.commit()
    await db.refresh(db_preset)
    return {"id": db_preset.id, "name": db_preset.name}


@router.delete("/{name}")
async def delete_preset(name: str, db: AsyncSession = Depends(get_db)):
    """Delete a preset by name"""
    result = await db.execute(select(Preset).where(Preset.name == name))
    preset = result.scalar_one_or_none()
    if not preset:
        raise APIError(404, "not_found", "Preset not found")

    await db.delete(preset)
    await db.commit()
    return {"deleted": True}
