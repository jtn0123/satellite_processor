"""System status endpoint"""

import asyncio
import logging
import platform
import sys
import time
from typing import Annotated

import psutil
from fastapi import APIRouter, Query
from kombu.exceptions import OperationalError as KombuOperationalError
from sqlalchemy import func, select

from ..db.database import DbSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/system", tags=["system"])

_start_time = time.time()


@router.get("/status")
async def system_status():
    """Get system resource usage"""
    logger.debug("System status requested")
    # #28: cpu_percent(interval=0.1) blocks — run in thread
    cpu = await asyncio.to_thread(psutil.cpu_percent, interval=0.1)

    # #29: Call virtual_memory() once and reuse
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    return {
        "cpu_percent": cpu,
        "memory": {
            "total": mem.total,
            "available": mem.available,
            "percent": mem.percent,
        },
        "disk": {
            "total": disk.total,
            "free": disk.free,
            "percent": disk.percent,
        },
    }


_system_info_cache: dict = {"data": None, "expires": 0.0}


@router.get("/info")
async def system_info():
    """Get system information: Python version, uptime, disk, memory, worker status."""
    logger.debug("System info requested")
    now = time.time()
    if _system_info_cache["data"] is not None and now < _system_info_cache["expires"]:
        return _system_info_cache["data"]

    from ..config import settings

    mem = psutil.virtual_memory()
    try:
        disk = psutil.disk_usage(settings.storage_path)
        disk_info = {
            "total": disk.total,
            "free": disk.free,
            "used": disk.used,
            "percent": disk.percent,
        }
    except OSError:
        disk_info = {"error": "unable to read disk usage"}

    # Check celery worker status
    worker_status = "unknown"
    try:
        from ..celery_app import celery_app

        def _check_celery():
            inspector = celery_app.control.inspect(timeout=2)
            return inspector.active()

        active = await asyncio.to_thread(_check_celery)
        worker_status = "online" if active else "offline"
    except (ConnectionError, TimeoutError, OSError, KombuOperationalError):
        worker_status = "offline"

    uptime_seconds = time.time() - _start_time

    result = {
        "python_version": sys.version,
        "platform": platform.platform(),
        "uptime_seconds": round(uptime_seconds, 1),
        "memory": {
            "total": mem.total,
            "available": mem.available,
            "percent": mem.percent,
        },
        "disk": disk_info,
        "worker_status": worker_status,
    }

    _system_info_cache["data"] = result
    _system_info_cache["expires"] = time.time() + 30  # 30s TTL
    return result


@router.get("/failed-jobs")
async def list_failed_jobs(
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    task_name: Annotated[str | None, Query()] = None,
):
    """List failed Celery tasks from the dead-letter table (paginated)."""
    from ..models.failed_job import FailedJob

    query = select(FailedJob).order_by(FailedJob.failed_at.desc())
    count_query = select(func.count()).select_from(FailedJob)

    if task_name:
        query = query.where(FailedJob.task_name == task_name)
        count_query = count_query.where(FailedJob.task_name == task_name)

    total = (await db.execute(count_query)).scalar_one()
    offset = (page - 1) * limit
    rows = (await db.execute(query.offset(offset).limit(limit))).scalars().all()

    return {
        "items": [
            {
                "id": r.id,
                "task_name": r.task_name,
                "task_id": r.task_id,
                "args": r.args,
                "kwargs": r.kwargs,
                "exception": r.exception,
                "traceback": r.traceback,
                "failed_at": r.failed_at.isoformat() if r.failed_at else None,
                "retried_count": r.retried_count,
            }
            for r in rows
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }
