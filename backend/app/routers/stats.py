"""Stats endpoint for dashboard widgets."""

import shutil

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db.database import get_db
from ..db.models import GoesFrame, Image, Job
from ..rate_limit import limiter

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("")
@limiter.limit("30/minute")
async def get_stats(request: Request, db: AsyncSession = Depends(get_db)):
    """Return dashboard stats: counts and storage usage."""
    total_images = (await db.execute(select(func.count()).select_from(Image))).scalar_one()
    total_jobs = (await db.execute(select(func.count()).select_from(Job))).scalar_one()
    active_jobs = (
        await db.execute(
            select(func.count()).select_from(Job).where(Job.status.in_(["pending", "processing"]))
        )
    ).scalar_one()

    # Storage usage
    try:
        usage = shutil.disk_usage(settings.storage_path)
        storage = {
            "total": usage.total,
            "used": usage.used,
            "free": usage.free,
        }
    except Exception:
        storage = {"total": 0, "used": 0, "free": 0}

    return {
        "total_images": total_images,
        "total_jobs": total_jobs,
        "active_jobs": active_jobs,
        "storage": storage,
    }


@router.get("/storage/breakdown")
@limiter.limit("30/minute")
async def storage_breakdown(request: Request, db: AsyncSession = Depends(get_db)):
    """Storage breakdown grouped by satellite, band, and age bucket."""
    from datetime import UTC, datetime, timedelta

    now = datetime.now(UTC).replace(tzinfo=None)

    # By satellite
    sat_rows = (await db.execute(
        select(GoesFrame.satellite, func.coalesce(func.sum(GoesFrame.file_size), 0))
        .group_by(GoesFrame.satellite)
    )).all()
    by_satellite = {row[0]: row[1] for row in sat_rows}

    # By band
    band_rows = (await db.execute(
        select(GoesFrame.band, func.coalesce(func.sum(GoesFrame.file_size), 0))
        .group_by(GoesFrame.band)
    )).all()
    by_band = {row[0]: row[1] for row in band_rows}

    # By age bucket (exclusive ranges)
    cutoff_24h = now - timedelta(hours=24)
    cutoff_7d = now - timedelta(days=7)
    cutoff_30d = now - timedelta(days=30)

    total_storage = (await db.execute(
        select(func.coalesce(func.sum(GoesFrame.file_size), 0))
    )).scalar() or 0

    val_24h = (await db.execute(
        select(func.coalesce(func.sum(GoesFrame.file_size), 0))
        .where(GoesFrame.capture_time >= cutoff_24h)
    )).scalar() or 0

    val_7d = (await db.execute(
        select(func.coalesce(func.sum(GoesFrame.file_size), 0))
        .where(GoesFrame.capture_time >= cutoff_7d)
    )).scalar() or 0

    val_30d = (await db.execute(
        select(func.coalesce(func.sum(GoesFrame.file_size), 0))
        .where(GoesFrame.capture_time >= cutoff_30d)
    )).scalar() or 0

    by_age: dict[str, int] = {
        "last_24h": val_24h,
        "last_7d": val_7d - val_24h,
        "last_30d": val_30d - val_7d,
        "older": total_storage - val_30d,
    }

    return {
        "by_satellite": by_satellite,
        "by_band": by_band,
        "by_age": by_age,
        "total_bytes": total_storage,
    }
