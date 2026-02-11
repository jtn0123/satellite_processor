"""Stats endpoint for dashboard widgets."""

from __future__ import annotations

import shutil

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db.database import get_db
from ..db.models import Image, Job
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
