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

VERSION = "2.1.0"
BUILD_SHA = __import__("os").environ.get("BUILD_SHA", "dev")


@router.get("")
async def health_basic():
    """Basic liveness check."""
    return {"status": "ok"}


@router.get("/version")
async def version_info():
    """Return app version and build info."""
    return {"version": VERSION, "build": BUILD_SHA}


async def _check_database() -> dict:
    """Check database connectivity and latency."""
    try:
        t0 = time.monotonic()
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
        latency = round((time.monotonic() - t0) * 1000, 1)
        return {"status": "ok", "latency_ms": latency}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


async def _check_redis() -> dict:
    """Check Redis connectivity and latency."""
    try:
        t0 = time.monotonic()
        r = aioredis.from_url(settings.redis_url)
        try:
            await r.ping()
            latency = round((time.monotonic() - t0) * 1000, 1)
            return {"status": "ok", "latency_ms": latency}
        finally:
            await r.close()
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


def _check_disk() -> dict:
    """Check available disk space."""
    try:
        usage = shutil.disk_usage(settings.storage_path)
        free_gb = round(usage.free / (1024**3), 1)
        if free_gb < 1.0:
            return {"status": "warning", "free_gb": free_gb}
        return {"status": "ok", "free_gb": free_gb}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


def _check_storage_dirs() -> dict:
    """Check storage directories exist and are writable."""
    try:
        for sub in [settings.upload_dir, settings.output_dir, settings.temp_dir]:
            if sub is None:
                continue
            p = Path(sub)
            if not p.exists() or not p.is_dir():
                return {"status": "error", "error": "Directory missing or not writable"}
            test_file = p / ".health_check_tmp"
            try:
                test_file.write_text("ok")
                test_file.unlink()
            except OSError:
                return {"status": "error", "error": "Directory missing or not writable"}
        return {"status": "ok"}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


def _derive_overall(checks: dict) -> str:
    """Derive overall health status from individual checks."""
    if any(c.get("status") == "error" for c in checks.values()):
        return "unhealthy"
    if any(c.get("status") == "warning" for c in checks.values()):
        return "degraded"
    return "healthy"


@router.get("/detailed")
async def health_detailed():
    """Detailed health check with dependency status."""
    checks = {
        "database": await _check_database(),
        "redis": await _check_redis(),
        "disk": _check_disk(),
        "storage": _check_storage_dirs(),
    }
    return {
        "status": _derive_overall(checks),
        "checks": checks,
        "version": VERSION,
    }
