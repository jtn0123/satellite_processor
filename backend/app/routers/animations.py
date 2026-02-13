"""Animation studio endpoints — crop presets and animations."""

from __future__ import annotations

import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db.models import Animation, CollectionFrame, CropPreset, GoesFrame, Job
from ..errors import APIError, validate_uuid
from ..models.animation import (
    AnimationCreate,
    AnimationResponse,
    CropPresetCreate,
    CropPresetResponse,
    CropPresetUpdate,
)
from ..models.pagination import PaginatedResponse

router = APIRouter(prefix="/api/goes", tags=["animation-studio"])


# ── Crop Presets ──────────────────────────────────────────


@router.post("/crop-presets", response_model=CropPresetResponse)
async def create_crop_preset(
    payload: CropPresetCreate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(CropPreset).where(CropPreset.name == payload.name))
    if existing.scalars().first():
        raise APIError(409, "conflict", "Crop preset name already exists")
    preset = CropPreset(
        id=str(uuid.uuid4()),
        name=payload.name,
        x=payload.x,
        y=payload.y,
        width=payload.width,
        height=payload.height,
    )
    db.add(preset)
    await db.commit()
    await db.refresh(preset)
    return CropPresetResponse.model_validate(preset)


@router.get("/crop-presets", response_model=list[CropPresetResponse])
async def list_crop_presets(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CropPreset).order_by(CropPreset.name))
    return [CropPresetResponse.model_validate(p) for p in result.scalars().all()]


@router.put("/crop-presets/{preset_id}", response_model=CropPresetResponse)
async def update_crop_preset(
    preset_id: str,
    payload: CropPresetUpdate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CropPreset).where(CropPreset.id == preset_id))
    preset = result.scalars().first()
    if not preset:
        raise APIError(404, "not_found", "Crop preset not found")
    for field in ("name", "x", "y", "width", "height"):
        val = getattr(payload, field)
        if val is not None:
            setattr(preset, field, val)
    await db.commit()
    await db.refresh(preset)
    return CropPresetResponse.model_validate(preset)


@router.delete("/crop-presets/{preset_id}")
async def delete_crop_preset(
    preset_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CropPreset).where(CropPreset.id == preset_id))
    preset = result.scalars().first()
    if not preset:
        raise APIError(404, "not_found", "Crop preset not found")
    await db.delete(preset)
    await db.commit()
    return {"deleted": preset_id}


# ── Animations ──────────────────────────────────────────


@router.post("/animations", response_model=AnimationResponse)
async def create_animation(
    payload: AnimationCreate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Create an animation generation job."""
    # Resolve frame IDs — either from explicit list or via filters
    if payload.frame_ids:
        frame_ids = payload.frame_ids
    else:
        query = select(GoesFrame.id)
        if payload.satellite:
            query = query.where(GoesFrame.satellite == payload.satellite)
        if payload.band:
            query = query.where(GoesFrame.band == payload.band)
        if payload.sector:
            query = query.where(GoesFrame.sector == payload.sector)
        if payload.start_date:
            query = query.where(GoesFrame.capture_time >= datetime.fromisoformat(payload.start_date))
        if payload.end_date:
            query = query.where(GoesFrame.capture_time <= datetime.fromisoformat(payload.end_date))
        if payload.collection_id:
            query = query.join(
                CollectionFrame, CollectionFrame.frame_id == GoesFrame.id
            ).where(CollectionFrame.collection_id == payload.collection_id)
        query = query.order_by(GoesFrame.capture_time.asc())
        result = await db.execute(query)
        frame_ids = [r[0] for r in result.all()]

    if not frame_ids:
        raise APIError(400, "bad_request", "No frames matched the given criteria")

    # Create a Job record for progress tracking
    job_id = str(uuid.uuid4())
    job = Job(
        id=job_id,
        status="pending",
        job_type="animation",
        params={
            "frame_ids": frame_ids,
            "fps": payload.fps,
            "format": payload.format,
            "quality": payload.quality,
            "crop_preset_id": payload.crop_preset_id,
            "false_color": payload.false_color,
            "scale": payload.scale,
        },
    )
    db.add(job)

    anim_id = str(uuid.uuid4())
    anim = Animation(
        id=anim_id,
        name=payload.name,
        status="pending",
        frame_count=len(frame_ids),
        fps=payload.fps,
        format=payload.format,
        quality=payload.quality,
        crop_preset_id=payload.crop_preset_id,
        false_color=1 if payload.false_color else 0,
        scale=payload.scale,
        job_id=job_id,
    )
    db.add(anim)
    await db.commit()
    await db.refresh(anim)

    # Dispatch Celery task
    from ..tasks.animation_tasks import generate_animation

    generate_animation.delay(job_id, anim_id)

    return AnimationResponse(
        id=anim.id,
        name=anim.name,
        status=anim.status,
        frame_count=anim.frame_count,
        fps=anim.fps,
        format=anim.format,
        quality=anim.quality,
        crop_preset_id=anim.crop_preset_id,
        false_color=bool(anim.false_color),
        scale=anim.scale,
        output_path=anim.output_path,
        file_size=anim.file_size or 0,
        duration_seconds=anim.duration_seconds or 0,
        created_at=anim.created_at,
        completed_at=anim.completed_at,
        error=anim.error or "",
        job_id=anim.job_id,
    )


@router.get("/animations", response_model=PaginatedResponse[AnimationResponse])
async def list_animations(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    count = (await db.execute(select(func.count(Animation.id)))).scalar() or 0
    offset = (page - 1) * limit
    result = await db.execute(
        select(Animation).order_by(Animation.created_at.desc()).offset(offset).limit(limit)
    )
    items = []
    for anim in result.scalars().all():
        items.append(AnimationResponse(
            id=anim.id,
            name=anim.name,
            status=anim.status,
            frame_count=anim.frame_count,
            fps=anim.fps,
            format=anim.format,
            quality=anim.quality,
            crop_preset_id=anim.crop_preset_id,
            false_color=bool(anim.false_color),
            scale=anim.scale,
            output_path=anim.output_path,
            file_size=anim.file_size or 0,
            duration_seconds=anim.duration_seconds or 0,
            created_at=anim.created_at,
            completed_at=anim.completed_at,
            error=anim.error or "",
            job_id=anim.job_id,
        ))
    return PaginatedResponse(items=items, total=count, page=page, limit=limit)


@router.get("/animations/{animation_id}", response_model=AnimationResponse)
async def get_animation(animation_id: str, db: AsyncSession = Depends(get_db)):
    validate_uuid(animation_id, "animation_id")
    result = await db.execute(select(Animation).where(Animation.id == animation_id))
    anim = result.scalars().first()
    if not anim:
        raise APIError(404, "not_found", "Animation not found")
    return AnimationResponse(
        id=anim.id,
        name=anim.name,
        status=anim.status,
        frame_count=anim.frame_count,
        fps=anim.fps,
        format=anim.format,
        quality=anim.quality,
        crop_preset_id=anim.crop_preset_id,
        false_color=bool(anim.false_color),
        scale=anim.scale,
        output_path=anim.output_path,
        file_size=anim.file_size or 0,
        duration_seconds=anim.duration_seconds or 0,
        created_at=anim.created_at,
        completed_at=anim.completed_at,
        error=anim.error or "",
        job_id=anim.job_id,
    )


@router.delete("/animations/{animation_id}")
async def delete_animation(animation_id: str, db: AsyncSession = Depends(get_db)):
    validate_uuid(animation_id, "animation_id")
    result = await db.execute(select(Animation).where(Animation.id == animation_id))
    anim = result.scalars().first()
    if not anim:
        raise APIError(404, "not_found", "Animation not found")
    # Delete output file
    if anim.output_path:
        try:
            os.remove(anim.output_path)
        except OSError:
            pass
    await db.delete(anim)
    await db.commit()
    return {"deleted": animation_id}
