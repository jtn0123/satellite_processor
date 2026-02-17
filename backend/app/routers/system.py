"""System status endpoint"""

import asyncio
import platform
import sys
import time

import psutil
from fastapi import APIRouter

router = APIRouter(prefix="/api/system", tags=["system"])

_start_time = time.time()


@router.get("/status")
async def system_status():
    """Get system resource usage"""
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


@router.get("/info")
async def system_info():
    """Get system information: Python version, uptime, disk, memory, worker status."""
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
    except Exception:
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
    except Exception:
        worker_status = "offline"

    uptime_seconds = time.time() - _start_time

    return {
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
