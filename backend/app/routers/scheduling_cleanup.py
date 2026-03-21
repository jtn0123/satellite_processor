"""Cleanup rules CRUD and cleanup execution endpoints."""

from __future__ import annotations

import logging
import os
import uuid
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db.database import get_db
from ..db.models import (
    CleanupRule,
    CollectionFrame,
    GoesFrame,
)
from ..errors import APIError
from ..models.scheduling import (
    CleanupPreviewResponse,
    CleanupRuleCreate,
    CleanupRuleResponse,
    CleanupRuleUpdate,
    CleanupRunResponse,
)
from ..rate_limit import limiter
from ..services.cache import invalidate
from ..utils import utcnow

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/satellite", tags=["scheduling"])


# ── Cleanup Rules ─────────────────────────────────────────

@router.post("/cleanup-rules", response_model=CleanupRuleResponse)
@limiter.limit("10/minute")
async def create_cleanup_rule(
    request: Request,
    payload: CleanupRuleCreate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    logger.info("Creating cleanup rule")
    rule = CleanupRule(
        id=str(uuid.uuid4()),
        name=payload.name,
        rule_type=payload.rule_type,
        value=payload.value,
        satellite=payload.satellite,
        protect_collections=payload.protect_collections,
        is_active=payload.is_active,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return CleanupRuleResponse.model_validate(rule)


@router.get("/cleanup-rules", response_model=list[CleanupRuleResponse])
@limiter.limit("60/minute")
async def list_cleanup_rules(request: Request, db: AsyncSession = Depends(get_db)):
    logger.debug("Listing cleanup rules")
    result = await db.execute(select(CleanupRule).order_by(CleanupRule.created_at.desc()))
    return [CleanupRuleResponse.model_validate(r) for r in result.scalars().all()]


@router.put("/cleanup-rules/{rule_id}", response_model=CleanupRuleResponse)
@limiter.limit("10/minute")
async def update_cleanup_rule(
    request: Request,
    rule_id: str,
    payload: CleanupRuleUpdate = Body(...),
    db: AsyncSession = Depends(get_db),
):
    logger.info("Updating cleanup rule: id=%s", rule_id)
    result = await db.execute(select(CleanupRule).where(CleanupRule.id == rule_id))
    rule = result.scalars().first()
    if not rule:
        raise APIError(404, "not_found", "Cleanup rule not found")
    for field in ("name", "rule_type", "value", "satellite", "protect_collections", "is_active"):
        val = getattr(payload, field)
        if val is not None:
            setattr(rule, field, val)
    await db.commit()
    await db.refresh(rule)
    return CleanupRuleResponse.model_validate(rule)


@router.delete("/cleanup-rules/{rule_id}")
@limiter.limit("10/minute")
async def delete_cleanup_rule(
    request: Request,
    rule_id: str,
    db: AsyncSession = Depends(get_db),
):
    logger.info("Deleting cleanup rule: id=%s", rule_id)
    result = await db.execute(select(CleanupRule).where(CleanupRule.id == rule_id))
    rule = result.scalars().first()
    if not rule:
        raise APIError(404, "not_found", "Cleanup rule not found")
    await db.delete(rule)
    await db.commit()
    return {"deleted": rule_id}


@router.get("/cleanup/stats")
@limiter.limit("60/minute")
async def cleanup_storage_stats(request: Request, db: AsyncSession = Depends(get_db)):
    """Per-satellite storage breakdown for the cleanup dashboard."""
    logger.debug("Cleanup storage stats requested")
    rows = (await db.execute(
        select(
            GoesFrame.satellite,
            GoesFrame.sector,
            func.count(GoesFrame.id).label("count"),
            func.coalesce(func.sum(GoesFrame.file_size), 0).label("size"),
            func.min(GoesFrame.capture_time).label("oldest"),
            func.max(GoesFrame.capture_time).label("newest"),
        ).group_by(GoesFrame.satellite, GoesFrame.sector)
    )).all()

    satellites: dict = {}
    total_frames = 0
    total_size = 0

    for sat, sector, count, size, oldest, newest in rows:
        total_frames += count
        total_size += size
        if sat not in satellites:
            satellites[sat] = {"total_frames": 0, "total_size": 0, "sectors": {}}
        satellites[sat]["total_frames"] += count
        satellites[sat]["total_size"] += size
        satellites[sat]["sectors"][sector] = {
            "count": count,
            "size": size,
            "oldest": oldest.isoformat() if oldest else None,
            "newest": newest.isoformat() if newest else None,
        }

    return {
        "total_frames": total_frames,
        "total_size": total_size,
        "satellites": satellites,
    }


@router.get("/cleanup/preview", response_model=CleanupPreviewResponse)
@limiter.limit("10/minute")
async def preview_cleanup(request: Request, db: AsyncSession = Depends(get_db)):
    """Dry-run: show what would be deleted by active cleanup rules."""
    logger.info("Preview cleanup requested")
    frames_to_delete = await _get_frames_to_cleanup(db)
    total_size = sum(f.file_size or 0 for f in frames_to_delete)
    return CleanupPreviewResponse(
        frame_count=len(frames_to_delete),
        total_size_bytes=total_size,
        frames=[
            {
                "id": f.id, "file_path": f.file_path, "file_size": f.file_size,
                "capture_time": f.capture_time.isoformat() if f.capture_time else None,
            }
            for f in frames_to_delete[:100]  # Limit preview to 100
        ],
    )


@router.post("/cleanup/run", response_model=CleanupRunResponse)
@limiter.limit("10/minute")
async def run_cleanup_now(request: Request, db: AsyncSession = Depends(get_db)):
    """Manually trigger cleanup."""
    frames_to_delete = await _get_frames_to_cleanup(db)
    allowed_root = str(Path(settings.storage_path).resolve())

    # 1. Validate paths and collect safe ones
    safe_paths: list[str] = []
    for frame in frames_to_delete:
        for path in [frame.file_path, frame.thumbnail_path]:
            if path:
                resolved = str(Path(path).resolve())
                if resolved.startswith(allowed_root):
                    safe_paths.append(resolved)

    # 2. Delete DB records first
    freed = 0
    for frame in frames_to_delete:
        freed += frame.file_size or 0
        await db.delete(frame)
    await db.commit()

    # 3. Delete files after commit, logging failures without raising
    for path in safe_paths:
        try:
            os.remove(path)
        except OSError:
            logger.warning("Failed to remove file during cleanup: %s", path)

    await invalidate("cache:dashboard-stats*")
    return CleanupRunResponse(deleted_frames=len(frames_to_delete), freed_bytes=freed)


async def _get_protected_ids(db: AsyncSession, protect_collections: bool) -> set[str]:
    """Return IDs of frames in collections if protection is enabled."""
    if not protect_collections:
        return set()
    prot = await db.execute(select(CollectionFrame.frame_id))
    return {r[0] for r in prot.all()}


async def _collect_age_deletions(db: AsyncSession, rule, protected_ids: set[str]) -> set[str]:
    """Find frame IDs older than max age that are not protected."""
    cutoff = utcnow() - timedelta(days=rule.value)
    # Bug #10: Select only IDs instead of full objects to avoid OOM
    query = select(GoesFrame.id).where(GoesFrame.created_at < cutoff)
    if rule.satellite:
        query = query.where(GoesFrame.satellite == rule.satellite)
    if protected_ids:
        query = query.where(GoesFrame.id.notin_(protected_ids))
    res = await db.execute(query)
    return {r[0] for r in res.all()}


async def _collect_storage_deletions(db: AsyncSession, rule, protected_ids: set[str]) -> set[str]:
    """Find oldest frame IDs to delete to bring storage under the limit."""
    size_query = select(func.coalesce(func.sum(GoesFrame.file_size), 0))
    if rule.satellite:
        size_query = size_query.where(GoesFrame.satellite == rule.satellite)
    total_result = await db.execute(size_query)
    total_bytes = total_result.scalar() or 0
    max_bytes = rule.value * 1024 * 1024 * 1024

    if total_bytes <= max_bytes:
        return set()

    # Bug #10: Select only ID and file_size columns instead of full objects
    query = select(GoesFrame.id, GoesFrame.file_size).order_by(GoesFrame.created_at.asc())
    if rule.satellite:
        query = query.where(GoesFrame.satellite == rule.satellite)
    if protected_ids:
        query = query.where(GoesFrame.id.notin_(protected_ids))
    res = await db.execute(query)
    excess = total_bytes - max_bytes
    freed = 0
    ids: set[str] = set()
    for frame_id, file_size in res.all():
        if freed >= excess:
            break
        ids.add(frame_id)
        freed += file_size or 0
    return ids


async def _get_frames_to_cleanup(db: AsyncSession) -> list[GoesFrame]:
    """Compute which frames should be cleaned up based on active rules."""
    result = await db.execute(select(CleanupRule).where(CleanupRule.is_active == True))  # noqa: E712
    rules = result.scalars().all()
    if not rules:
        return []

    delete_ids: set[str] = set()

    for rule in rules:
        protected_ids = await _get_protected_ids(db, rule.protect_collections)

        if rule.rule_type == "max_age_days":
            delete_ids |= await _collect_age_deletions(db, rule, protected_ids)
        elif rule.rule_type == "max_storage_gb":
            delete_ids |= await _collect_storage_deletions(db, rule, protected_ids)

    if not delete_ids:
        return []

    result = await db.execute(select(GoesFrame).where(GoesFrame.id.in_(delete_ids)))
    return list(result.scalars().all())
