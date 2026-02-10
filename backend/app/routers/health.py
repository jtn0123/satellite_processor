"""Health check endpoints."""

import shutil
import time
from pathlib import Path

import redis.asyncio as aioredis
from fastapi import APIRouter
from sqlalchemy import text

from ..config import settings
from ..db.database import async_session

router = APIRouter(prefix="/api/health", tags=["health"])

VERSION = "2.0.0"


@router.get("")
async def health_basic():
    """Basic liveness check."""
    return {"status": "ok"}


@router.get("/detailed")
async def health_detailed():
    """Detailed health check with dependency status."""
    checks: dict = {}
    overall = "healthy"

    # Database check
    try:
        t0 = time.monotonic()
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
        latency = round((time.monotonic() - t0) * 1000, 1)
        checks["database"] = {"status": "ok", "latency_ms": latency}
    except Exception as exc:
        checks["database"] = {"status": "error", "error": str(exc)}
        overall = "unhealthy"

    # Redis check
    try:
        t0 = time.monotonic()
        r = aioredis.from_url(settings.redis_url)
        try:
            await r.ping()
            latency = round((time.monotonic() - t0) * 1000, 1)
            checks["redis"] = {"status": "ok", "latency_ms": latency}
        finally:
            await r.close()
    except Exception as exc:
        checks["redis"] = {"status": "error", "error": str(exc)}
        overall = "unhealthy"

    # Disk space check
    try:
        usage = shutil.disk_usage(settings.storage_path)
        free_gb = round(usage.free / (1024**3), 1)
        if free_gb < 1.0:
            checks["disk"] = {"status": "warning", "free_gb": free_gb}
            if overall == "healthy":
                overall = "degraded"
        else:
            checks["disk"] = {"status": "ok", "free_gb": free_gb}
    except Exception as exc:
        checks["disk"] = {"status": "error", "error": str(exc)}
        if overall == "healthy":
            overall = "degraded"

    # Storage directories check
    try:
        storage = Path(settings.storage_path)
        dirs_ok = True
        for sub in [settings.upload_dir, settings.output_dir, settings.temp_dir]:
            if sub is None:
                continue
            p = Path(sub)
            if not p.exists() or not p.is_dir():
                dirs_ok = False
                break
            # Test writable
            test_file = p / ".health_check_tmp"
            try:
                test_file.write_text("ok")
                test_file.unlink()
            except OSError:
                dirs_ok = False
                break

        if dirs_ok:
            checks["storage"] = {"status": "ok"}
        else:
            checks["storage"] = {"status": "error", "error": "Directory missing or not writable"}
            overall = "unhealthy"
    except Exception as exc:
        checks["storage"] = {"status": "error", "error": str(exc)}
        overall = "unhealthy"

    return {
        "status": overall,
        "checks": checks,
        "version": VERSION,
    }
