"""Job logging, output, status tracking, and cleanup endpoints."""

import logging
import os
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db.database import get_db
from ..db.models import (
    Job,
    JobLog,
)
from ..errors import APIError, validate_uuid
from ..rate_limit import limiter

logger = logging.getLogger(__name__)

_JOB_NOT_FOUND = "Job not found"
_PATH_OUTSIDE_ALLOWED = "Path outside allowed directory"

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}/logs")
async def get_job_logs(
    job_id: str,
    level: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    db: AsyncSession = Depends(get_db),
):
    """Return logs for a job ordered by timestamp."""
    validate_uuid(job_id, "job_id")
    query = select(JobLog).where(JobLog.job_id == job_id)
    if level:
        query = query.where(JobLog.level == level)
    query = query.order_by(JobLog.timestamp.asc()).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()
    return [
        {
            "id": log.id,
            "level": log.level,
            "message": log.message,
            "timestamp": log.timestamp.isoformat(),
        }
        for log in logs
    ]


def _find_output_file(output_path: str, allowed_root: Path) -> tuple[str, str]:
    """Find the best output file in a directory, preferring video/archive formats.

    Returns (file_path, filename) or raises APIError.
    """
    # Path-injection guard: resolve and confine to allowed root
    resolved_output = Path(output_path).resolve()
    try:
        resolved_output.relative_to(allowed_root)
    except ValueError:
        raise APIError(403, "forbidden", _PATH_OUTSIDE_ALLOWED)

    resolved_str = str(resolved_output)
    entries = sorted(os.listdir(resolved_str))
    # Filter to actual files only — directories would break FileResponse
    files = [f for f in entries if os.path.isfile(os.path.join(resolved_str, f))]
    if not files:
        raise APIError(404, "not_found", "No output files found")

    for ext in [".mp4", ".avi", ".mkv", ".zip"]:
        for f in files:
            if f.endswith(ext):
                file_path = Path(resolved_str, f).resolve()
                try:
                    file_path.relative_to(allowed_root)
                except ValueError:
                    continue
                return str(file_path), f

    first = files[0]
    first_path = Path(resolved_str, first).resolve()
    try:
        first_path.relative_to(allowed_root)
    except ValueError:
        raise APIError(403, "forbidden", _PATH_OUTSIDE_ALLOWED)
    return str(first_path), first


@router.get("/{job_id}/output")
async def get_job_output(job_id: str, db: AsyncSession = Depends(get_db)):
    """Download job output"""
    validate_uuid(job_id, "job_id")
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise APIError(404, "not_found", _JOB_NOT_FOUND)
    if job.status not in ("completed", "completed_partial"):
        raise APIError(400, "job_not_completed", f"Job is not completed (status: {job.status})")

    raw_path = job.output_path or str(Path(settings.output_dir) / job_id)
    allowed_root = Path(settings.output_dir).resolve()
    output_path = Path(raw_path).resolve()
    try:
        output_path.relative_to(allowed_root)
    except ValueError:
        raise APIError(403, "forbidden", _PATH_OUTSIDE_ALLOWED)

    output_str = str(output_path)
    if not os.path.exists(output_str):
        raise APIError(404, "not_found", "Output not found")
    if os.path.isfile(output_str):
        return FileResponse(output_str, filename=os.path.basename(output_str))

    file_path, filename = _find_output_file(output_str, allowed_root)
    return FileResponse(file_path, filename=filename)


@router.post("/cleanup-stale")
@limiter.limit("10/minute")
async def cleanup_stale_jobs(request: Request, db: AsyncSession = Depends(get_db)):
    """Mark stale processing and pending jobs as failed."""
    from ..services.stale_jobs import cleanup_all_stale

    result = await cleanup_all_stale(db)
    return result
