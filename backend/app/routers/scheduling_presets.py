"""Fetch preset CRUD and default preset seeding."""

from __future__ import annotations

import logging
import uuid
from datetime import timedelta

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db.models import (
    FetchPreset,
    Job,
)
from ..errors import APIError
from ..models.scheduling import (
    FetchPresetCreate,
    FetchPresetResponse,
    FetchPresetUpdate,
)
from ..rate_limit import limiter
from ..utils import utcnow

logger = logging.getLogger(__name__)

_FETCH_PRESET_NOT_FOUND = "Fetch preset not found"

router = APIRouter(prefix="/api/satellite", tags=["scheduling"])


# ── Default preset definitions ────────────────────────────

DEFAULT_FETCH_PRESETS = [
    {
        "name": "Himawari FLDK True Color",
        "satellite": "Himawari-9",
        "sector": "FLDK",
        "band": "TrueColor",
        "description": "Full disk true color composite",
    },
]


# ── Seed Defaults ─────────────────────────────────────────

@router.post("/fetch-presets/seed-defaults")
@limiter.limit("10/minute")
async def seed_default_presets(request: Request, db: AsyncSession = Depends(get_db)):
    """Create default fetch presets if they don't already exist."""
    logger.info("Seeding default fetch presets")
    created = []
    for preset_def in DEFAULT_FETCH_PRESETS:
        result = await db.execute(
            select(FetchPreset).where(FetchPreset.name == preset_def["name"])
        )
        if result.scalars().first():
            continue
        preset = FetchPreset(
            id=str(uuid.uuid4()),
            name=preset_def["name"],
            satellite=preset_def["satellite"],
            sector=preset_def["sector"],
            band=preset_def["band"],
            description=preset_def["description"],
        )
        db.add(preset)
        created.append(preset_def["name"])
    if created:
        await db.commit()
    return {"seeded": created, "total": len(created)}


# ── Fetch Presets ─────────────────────────────────────────

@router.post("/fetch-presets", response_model=FetchPresetResponse)
@limiter.limit("30/minute")
async def create_fetch_preset(
    request: Request,
    payload: FetchPresetCreate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    logger.info("Creating fetch preset")
    preset = FetchPreset(
        id=str(uuid.uuid4()),
        name=payload.name,
        satellite=payload.satellite,
        sector=payload.sector,
        band=payload.band,
        description=payload.description,
    )
    db.add(preset)
    await db.commit()
    await db.refresh(preset)
    return FetchPresetResponse.model_validate(preset)


@router.get("/fetch-presets", response_model=list[FetchPresetResponse])
@limiter.limit("60/minute")
async def list_fetch_presets(request: Request, db: AsyncSession = Depends(get_db)):
    logger.debug("Listing fetch presets")
    result = await db.execute(select(FetchPreset).order_by(FetchPreset.created_at.desc()))
    return [FetchPresetResponse.model_validate(p) for p in result.scalars().all()]


@router.put("/fetch-presets/{preset_id}", response_model=FetchPresetResponse)
@limiter.limit("30/minute")
async def update_fetch_preset(
    request: Request,
    preset_id: str,
    payload: FetchPresetUpdate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    logger.info("Updating fetch preset: id=%s", preset_id)
    result = await db.execute(select(FetchPreset).where(FetchPreset.id == preset_id))
    preset = result.scalars().first()
    if not preset:
        raise APIError(404, "not_found", _FETCH_PRESET_NOT_FOUND)
    for field in ("name", "satellite", "sector", "band", "description"):
        val = getattr(payload, field)
        if val is not None:
            setattr(preset, field, val)
    await db.commit()
    await db.refresh(preset)
    return FetchPresetResponse.model_validate(preset)


@router.delete("/fetch-presets/{preset_id}")
@limiter.limit("30/minute")
async def delete_fetch_preset(
    request: Request,
    preset_id: str,
    db: AsyncSession = Depends(get_db),
):
    logger.info("Deleting fetch preset: id=%s", preset_id)
    result = await db.execute(select(FetchPreset).where(FetchPreset.id == preset_id))
    preset = result.scalars().first()
    if not preset:
        raise APIError(404, "not_found", _FETCH_PRESET_NOT_FOUND)
    await db.delete(preset)
    await db.commit()
    return {"deleted": preset_id}


@router.post("/fetch-presets/{preset_id}/run")
@limiter.limit("10/minute")
async def run_fetch_preset(
    request: Request,
    preset_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Execute a preset immediately (fetches last 1 hour of data)."""
    result = await db.execute(select(FetchPreset).where(FetchPreset.id == preset_id))
    preset = result.scalars().first()
    if not preset:
        raise APIError(404, "not_found", _FETCH_PRESET_NOT_FOUND)

    now = utcnow()
    job_id = str(uuid.uuid4())
    job = Job(
        id=job_id,
        status="pending",
        job_type="goes_fetch",
        params={
            "satellite": preset.satellite,
            "sector": preset.sector,
            "band": preset.band,
            "start_time": (now - timedelta(hours=1)).isoformat(),
            "end_time": now.isoformat(),
            "preset_id": preset.id,
        },
    )
    db.add(job)
    await db.commit()

    # Dispatch to the correct task based on satellite type
    from ..services.satellite_registry import SATELLITE_REGISTRY

    sat_config = SATELLITE_REGISTRY.get(preset.satellite)
    if sat_config and sat_config.format == "hsd":
        if preset.band == "TrueColor":
            from ..tasks.himawari_fetch_task import fetch_himawari_true_color
            fetch_himawari_true_color.delay(job_id, job.params)
        else:
            from ..tasks.himawari_fetch_task import fetch_himawari_data
            fetch_himawari_data.delay(job_id, job.params)
    else:
        from ..tasks.fetch_task import fetch_goes_data
        fetch_goes_data.delay(job_id, job.params)

    return {"job_id": job_id, "status": "pending", "preset": preset.name}
