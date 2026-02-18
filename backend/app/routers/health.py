"""Health check endpoints."""

import os
import re
import shutil
import time
from pathlib import Path

from fastapi import APIRouter
from sqlalchemy import text

from ..config import settings
from ..db.database import async_session
from ..redis_pool import get_redis_client

router = APIRouter(prefix="/api/health", tags=["health"])


def _read_version() -> str:
    """Read version from VERSION file or env, fallback to 0.0.0."""
    env_ver = os.environ.get("BUILD_VERSION", "")
    if env_ver:
        return env_ver
    parents = Path(__file__).resolve().parents
    repo_root = parents[min(4, len(parents) - 1)]
    for candidate in [repo_root / "VERSION", Path("VERSION")]:
        if candidate.is_file():
            return candidate.read_text().strip()
    return "0.0.0"


VERSION = _read_version()

# --- Changelog parsing (cached) ---

_changelog_cache: list | None = None


def _find_changelog() -> Path | None:
    """Locate CHANGELOG.md by searching parent directories."""
    # Search upward from this file
    current = Path(__file__).resolve().parent
    while current != current.parent:
        candidate = current / "CHANGELOG.md"
        if candidate.is_file():
            return candidate
        current = current.parent
    # Also check CWD and /app (Docker default)
    for fallback in [Path("CHANGELOG.md"), Path("/app/CHANGELOG.md")]:
        if fallback.is_file():
            return fallback
    return None


def _strip_links(text: str) -> str:
    """Strip markdown links from change messages, keeping link text."""
    # Remove ([#123](url)) and ([hash](url)) patterns
    text = re.sub(r'\s*\(\[([^\]]*)\]\([^)]*\)\)', '', text)
    # Remove closes references
    text = re.sub(r',?\s*closes\s+\S+', '', text)
    return text.strip()


def _try_append_release(
    current: dict | None, releases: list, limit: int
) -> bool:
    """Append current release to list. Return True if limit reached."""
    if current:
        releases.append(current)
        return len(releases) >= limit
    return False


def _parse_changelog(limit: int = 5) -> list:
    """Parse CHANGELOG.md into structured releases."""
    global _changelog_cache  # noqa: PLW0603
    if _changelog_cache is not None:
        return _changelog_cache

    path = _find_changelog()
    if path is None:
        _changelog_cache = []
        return _changelog_cache

    releases: list = []
    current: dict | None = None

    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(
            r'^##?\s+\[?(\d+\.\d+\.\d+)\]?(?:\([^)]*\))?\s+\((\d{4}-\d{2}-\d{2})\)',
            line,
        )
        if m:
            if _try_append_release(current, releases, limit):
                break
            current = {"version": m.group(1), "date": m.group(2), "changes": []}
            continue
        if current and line.startswith('* '):
            msg = _strip_links(line[2:])
            if msg:
                current["changes"].append(msg)

    if current and len(releases) < limit:
        releases.append(current)

    _changelog_cache = releases
    return _changelog_cache
BUILD_COMMIT = os.environ.get("BUILD_COMMIT", "dev")
BUILD_DATE = os.environ.get("BUILD_DATE", "")


@router.get("")
async def health_basic():
    """Basic liveness check with dependency awareness.

    Returns 'ok' if core services are reachable, 'degraded' if DB or Redis
    is down but the app is still running.
    """
    db_check = await _check_database()
    redis_check = await _check_redis()

    if db_check["status"] == "error":
        return {
            "status": "degraded",
            "database": db_check["status"],
            "redis": redis_check["status"],
        }
    # Redis is optional (used for real-time progress only)
    if redis_check["status"] == "error":
        return {"status": "ok", "redis": "unavailable"}
    return {"status": "ok"}


@router.get("/version")
async def version_info():
    """Return app version and build info."""
    return {
        "version": VERSION,
        "commit": BUILD_COMMIT,
        "build_date": BUILD_DATE,
        "build": BUILD_COMMIT,
    }


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
    """Check Redis connectivity and latency using shared pool."""
    try:
        t0 = time.monotonic()
        r = get_redis_client()
        await r.ping()
        latency = round((time.monotonic() - t0) * 1000, 1)
        return {"status": "ok", "latency_ms": latency}
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


@router.get("/changelog")
async def changelog():
    """Return parsed CHANGELOG.md as structured JSON."""
    global _changelog_cache  # noqa: PLW0603
    # Clear cache to allow detecting newly available CHANGELOG.md
    if _changelog_cache is not None and len(_changelog_cache) == 0:
        _changelog_cache = None
    return _parse_changelog()


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
        "commit": BUILD_COMMIT,
    }
