"""Job logging, output, status tracking, and cleanup endpoints."""

import logging
import os
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Query
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
from ..utils.path_validation import validate_file_path

logger = logging.getLogger(__name__)

_JOB_NOT_FOUND = "Job not found"

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


@router.get("/{job_id}/output")
async def get_job_output(job_id: str, db: AsyncSession = Depends(get_db)):
    """Download job output"""
    validate_uuid(job_id, "job_id")
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise APIError(404, "not_found", _JOB_NOT_FOUND)
    if job.status != "completed":
        raise APIError(400, "job_not_completed", f"Job is not completed (status: {job.status})")

    # #52: Use stored output_path from job record
    output_path = job.output_path or str(Path(settings.output_dir) / job_id)
    validate_file_path(output_path)
    if not os.path.exists(output_path):
        raise APIError(404, "not_found", "Output not found")

    if os.path.isfile(output_path):
        return FileResponse(output_path, filename=os.path.basename(output_path))

    files = sorted(os.listdir(output_path))
    if not files:
        raise APIError(404, "not_found", "No output files found")

    for ext in [".mp4", ".avi", ".mkv", ".zip"]:
        for f in files:
            if f.endswith(ext):
                file_path = os.path.join(output_path, f)
                validate_file_path(file_path)
                return FileResponse(file_path, filename=f)

    first = files[0]
    first_path = os.path.join(output_path, first)
    validate_file_path(first_path)
    return FileResponse(first_path, filename=first)


@router.post("/cleanup-stale")
async def cleanup_stale_jobs(db: AsyncSession = Depends(get_db)):
    """Mark stale processing and pending jobs as failed."""
    from ..services.stale_jobs import cleanup_all_stale

    result = await cleanup_all_stale(db)
    return result
