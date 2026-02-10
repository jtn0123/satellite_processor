"""System status endpoint"""

import asyncio

import psutil
from fastapi import APIRouter

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/status")
async def system_status():
    """Get system resource usage"""
    # #28: cpu_percent(interval=0.1) blocks — run in thread
    cpu = await asyncio.to_thread(psutil.cpu_percent, interval=0.1)

    # #29: Call virtual_memory() once and reuse
    mem = psutil.virtual_memory()

    return {
        "cpu_percent": cpu,
        "memory": {
            "total": mem.total,
            "available": mem.available,
            "percent": mem.percent,
        },
        "disk": {
            "total": psutil.disk_usage("/").total,
            "free": psutil.disk_usage("/").free,
            "percent": psutil.disk_usage("/").percent,
        },
    }
