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


_system_info_cache: dict = {"data": None, "expires": 0.0}


@router.get("/info")
async def system_info():
    """Get system information: Python version, uptime, disk, memory, worker status."""
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
