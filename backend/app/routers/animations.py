"""Animation studio endpoints — crop presets, animations, presets, and batch."""

import os
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db.models import (
    Animation,
    AnimationPreset,
    CollectionFrame,
    CropPreset,
    GoesFrame,
    Job,
)
from ..errors import APIError, validate_uuid
from ..models.animation import (
    AnimationCreate,
    AnimationFromRange,
    AnimationPresetCreate,
    AnimationPresetResponse,
    AnimationPresetUpdate,
    AnimationRecent,
    AnimationResponse,
    BatchAnimationRequest,
    CropPresetCreate,
    CropPresetResponse,
    CropPresetUpdate,
    FrameRangePreview,
)
from ..models.pagination import PaginatedResponse

router = APIRouter(prefix="/api/goes", tags=["animation-studio"])

_ANIMATION_PRESET_NOT_FOUND = "Animation preset not found"


# ── Helpers ──────────────────────────────────────────


def _build_anim_response(anim: Animation) -> AnimationResponse:
    return AnimationResponse(
        id=anim.id,
        name=anim.name,
        status=anim.status,
        frame_count=anim.frame_count,
        fps=anim.fps,
        format=anim.format,
        quality=anim.quality,
        resolution=anim.resolution or "full",
        loop_style=anim.loop_style or "forward",
        overlay=anim.overlay,
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


async def _create_animation_from_frames(
    db: AsyncSession,
    frame_ids: list[str],
    name: str = "Untitled Animation",
    fps: int = 10,
    fmt: str = "mp4",
    quality: str = "medium",
    resolution: str = "full",
    loop_style: str = "forward",
    overlay: dict | None = None,
    crop_preset_id: str | None = None,
    false_color: bool = False,
    scale: str = "100%",
) -> Animation:
    """Create animation + job from frame IDs and dispatch task."""
    if not frame_ids:
        raise APIError(400, "bad_request", "No frames matched the given criteria")

    job_id = str(uuid.uuid4())
    job = Job(
        id=job_id,
        status="pending",
        job_type="animation",
        params={
            "frame_ids": frame_ids,
            "fps": fps,
            "format": fmt,
            "quality": quality,
            "resolution": resolution,
            "loop_style": loop_style,
            "overlay": overlay,
            "crop_preset_id": crop_preset_id,
            "false_color": false_color,
            "scale": scale,
        },
    )
    db.add(job)

    anim_id = str(uuid.uuid4())
    anim = Animation(
        id=anim_id,
        name=name,
        status="pending",
        frame_count=len(frame_ids),
        fps=fps,
        format=fmt,
        quality=quality,
        resolution=resolution,
        loop_style=loop_style,
        overlay=overlay,
        crop_preset_id=crop_preset_id,
        false_color=bool(false_color),
        scale=scale,
        job_id=job_id,
    )
    db.add(anim)
    await db.commit()
    await db.refresh(anim)

    from ..tasks.animation_tasks import generate_animation

    generate_animation.delay(job_id, anim_id)

    return anim


async def _query_frame_ids(
    db: AsyncSession,
    satellite: str,
    sector: str,
    band: str,
    start_time: datetime,
    end_time: datetime,
) -> list[str]:
    """Query frame IDs matching satellite/sector/band in time range."""
    query = (
        select(GoesFrame.id)
        .where(
            GoesFrame.satellite == satellite,
            GoesFrame.sector == sector,
            GoesFrame.band == band,
            GoesFrame.capture_time >= start_time,
            GoesFrame.capture_time <= end_time,
        )
        .order_by(GoesFrame.capture_time.asc())
    )
    result = await db.execute(query)
    return [r[0] for r in result.all()]


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

    overlay_dict = payload.overlay.model_dump() if payload.overlay else None
    anim = await _create_animation_from_frames(
        db,
        frame_ids,
        name=payload.name,
        fps=payload.fps,
        fmt=payload.format,
        quality=payload.quality,
        resolution=payload.resolution,
        loop_style=payload.loop_style,
        overlay=overlay_dict,
        crop_preset_id=payload.crop_preset_id,
        false_color=payload.false_color,
        scale=payload.scale,
    )
    return _build_anim_response(anim)


@router.post("/animations/from-range", response_model=AnimationResponse)
async def create_animation_from_range(
    payload: AnimationFromRange = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Create animation from a satellite/sector/band time range."""
    frame_ids = await _query_frame_ids(
        db, payload.satellite, payload.sector, payload.band,
        payload.start_time, payload.end_time,
    )
    overlay_dict = payload.overlay.model_dump() if payload.overlay else None
    name = f"{payload.satellite} {payload.sector} {payload.band}"
    anim = await _create_animation_from_frames(
        db, frame_ids, name=name, fps=payload.fps, fmt=payload.format,
        quality=payload.quality, resolution=payload.resolution,
        loop_style=payload.loop_style, overlay=overlay_dict,
    )
    return _build_anim_response(anim)


@router.post("/animations/recent", response_model=AnimationResponse)
async def create_animation_recent(
    payload: AnimationRecent = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Create animation from the last N hours of frames."""
    end_time = datetime.now(UTC)
    start_time = end_time - timedelta(hours=payload.hours)
    frame_ids = await _query_frame_ids(
        db, payload.satellite, payload.sector, payload.band,
        start_time, end_time,
    )
    overlay_dict = payload.overlay.model_dump() if payload.overlay else None
    name = f"{payload.satellite} {payload.sector} {payload.band} (last {payload.hours}h)"
    anim = await _create_animation_from_frames(
        db, frame_ids, name=name, fps=payload.fps, fmt=payload.format,
        quality=payload.quality, resolution=payload.resolution,
        loop_style=payload.loop_style, overlay=overlay_dict,
    )
    return _build_anim_response(anim)


@router.post("/animations/batch", response_model=list[AnimationResponse])
async def create_animation_batch(
    payload: BatchAnimationRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple animation jobs at once."""
    results = []
    for item in payload.animations:
        frame_ids = await _query_frame_ids(
            db, item.satellite, item.sector, item.band,
            item.start_time, item.end_time,
        )
        overlay_dict = item.overlay.model_dump() if item.overlay else None
        name = f"{item.satellite} {item.sector} {item.band}"
        anim = await _create_animation_from_frames(
            db, frame_ids, name=name, fps=item.fps, fmt=item.format,
            quality=item.quality, resolution=item.resolution,
            loop_style=item.loop_style, overlay=overlay_dict,
        )
        results.append(_build_anim_response(anim))
    return results


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
    items = [_build_anim_response(anim) for anim in result.scalars().all()]
    return PaginatedResponse(items=items, total=count, page=page, limit=limit)


@router.get("/animations/{animation_id}", response_model=AnimationResponse)
async def get_animation(animation_id: str, db: AsyncSession = Depends(get_db)):
    validate_uuid(animation_id, "animation_id")
    result = await db.execute(select(Animation).where(Animation.id == animation_id))
    anim = result.scalars().first()
    if not anim:
        raise APIError(404, "not_found", "Animation not found")
    return _build_anim_response(anim)


@router.delete("/animations/{animation_id}")
async def delete_animation(animation_id: str, db: AsyncSession = Depends(get_db)):
    validate_uuid(animation_id, "animation_id")
    result = await db.execute(select(Animation).where(Animation.id == animation_id))
    anim = result.scalars().first()
    if not anim:
        raise APIError(404, "not_found", "Animation not found")
    if anim.output_path:
        try:
            os.remove(anim.output_path)
        except OSError:
            pass
    await db.delete(anim)
    await db.commit()
    return {"deleted": animation_id}


# ── Frame Range Preview ──────────────────────────────────


@router.get("/frames/preview-range", response_model=FrameRangePreview)
async def preview_frame_range(
    satellite: str = Query(...),
    sector: str = Query(...),
    band: str = Query(...),
    start_time: datetime = Query(...),
    end_time: datetime = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Preview frames in a time range — returns count and 3 sample frames."""
    base_filter = [
        GoesFrame.satellite == satellite,
        GoesFrame.sector == sector,
        GoesFrame.band == band,
        GoesFrame.capture_time >= start_time,
        GoesFrame.capture_time <= end_time,
    ]

    count_q = select(func.count(GoesFrame.id)).where(*base_filter)
    total = (await db.execute(count_q)).scalar() or 0

    if total == 0:
        return FrameRangePreview(total_frames=0)

    # Bug #15: Use 3 targeted queries instead of loading ALL frames
    first_q = select(GoesFrame).where(*base_filter).order_by(GoesFrame.capture_time.asc()).limit(1)
    first = (await db.execute(first_q)).scalars().first()

    last_q = select(GoesFrame).where(*base_filter).order_by(GoesFrame.capture_time.desc()).limit(1)
    last = (await db.execute(last_q)).scalars().first()

    mid_offset = max(0, total // 2)
    mid_q = select(GoesFrame).where(*base_filter).order_by(GoesFrame.capture_time.asc()).offset(mid_offset).limit(1)
    middle = (await db.execute(mid_q)).scalars().first()

    def _frame_dict(f: GoesFrame) -> dict:
        return {
            "id": f.id,
            "satellite": f.satellite,
            "sector": f.sector,
            "band": f.band,
            "capture_time": f.capture_time.isoformat() if f.capture_time else None,
            "file_size": f.file_size,
            "width": f.width,
            "height": f.height,
            "image_url": f"/api/goes/frames/{f.id}/image",
        }

    def _thumb(f: GoesFrame) -> str:
        return f"/api/goes/frames/{f.id}/thumbnail"

    return FrameRangePreview(
        total_frames=total,
        first=_frame_dict(first),
        middle=_frame_dict(middle),
        last=_frame_dict(last),
        first_thumbnail=_thumb(first),
        middle_thumbnail=_thumb(middle),
        last_thumbnail=_thumb(last),
    )


# ── Animation Presets CRUD ──────────────────────────────


@router.get("/animation-presets", response_model=list[AnimationPresetResponse])
async def list_animation_presets(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AnimationPreset).order_by(AnimationPreset.name)
    )
    return [AnimationPresetResponse.model_validate(p) for p in result.scalars().all()]


@router.post("/animation-presets", response_model=AnimationPresetResponse)
async def create_animation_preset(
    payload: AnimationPresetCreate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(AnimationPreset).where(AnimationPreset.name == payload.name)
    )
    if existing.scalars().first():
        raise APIError(409, "conflict", "Animation preset name already exists")
    preset = AnimationPreset(
        id=str(uuid.uuid4()),
        name=payload.name,
        satellite=payload.satellite,
        sector=payload.sector,
        band=payload.band,
        fps=payload.fps,
        format=payload.format,
        quality=payload.quality,
        resolution=payload.resolution,
        loop_style=payload.loop_style,
    )
    db.add(preset)
    await db.commit()
    await db.refresh(preset)
    return AnimationPresetResponse.model_validate(preset)


@router.get("/animation-presets/{preset_id}", response_model=AnimationPresetResponse)
async def get_animation_preset(
    preset_id: str,
    db: AsyncSession = Depends(get_db),
):
    validate_uuid(preset_id, "preset_id")
    result = await db.execute(
        select(AnimationPreset).where(AnimationPreset.id == preset_id)
    )
    preset = result.scalars().first()
    if not preset:
        raise APIError(404, "not_found", _ANIMATION_PRESET_NOT_FOUND)
    return AnimationPresetResponse.model_validate(preset)


@router.put("/animation-presets/{preset_id}", response_model=AnimationPresetResponse)
async def update_animation_preset(
    preset_id: str,
    payload: AnimationPresetUpdate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    validate_uuid(preset_id, "preset_id")
    result = await db.execute(
        select(AnimationPreset).where(AnimationPreset.id == preset_id)
    )
    preset = result.scalars().first()
    if not preset:
        raise APIError(404, "not_found", _ANIMATION_PRESET_NOT_FOUND)
    for field in ("name", "satellite", "sector", "band", "fps", "format",
                  "quality", "resolution", "loop_style"):
        val = getattr(payload, field)
        if val is not None:
            setattr(preset, field, val)
    await db.commit()
    await db.refresh(preset)
    return AnimationPresetResponse.model_validate(preset)


@router.delete("/animation-presets/{preset_id}")
async def delete_animation_preset(
    preset_id: str,
    db: AsyncSession = Depends(get_db),
):
    validate_uuid(preset_id, "preset_id")
    result = await db.execute(
        select(AnimationPreset).where(AnimationPreset.id == preset_id)
    )
    preset = result.scalars().first()
    if not preset:
        raise APIError(404, "not_found", _ANIMATION_PRESET_NOT_FOUND)
    await db.delete(preset)
    await db.commit()
    return {"deleted": preset_id}
