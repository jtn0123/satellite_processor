"""Job CRUD and processing endpoints - dispatches to Celery workers"""

import asyncio
import logging
import os
import shutil
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..celery_app import celery_app
from ..config import settings
from ..db.database import DbSession
from ..db.models import (
    CollectionFrame,
    GoesFrame,
    Image,
    Job,
    JobLog,
)
from ..errors import APIError, validate_safe_path, validate_uuid
from ..models.job import JobCreate, JobResponse, JobUpdate
from ..models.pagination import PaginatedResponse
from ..rate_limit import limiter
from ..utils import safe_remove, utcnow

logger = logging.getLogger(__name__)

_JOB_NOT_FOUND = "Job not found"
_REVOKE_FAIL_MSG = "Failed to revoke Celery task %s"

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class BulkJobDeleteRequest(BaseModel):
    job_ids: list[str] = []
    delete_files: bool = False


async def _resolve_image_ids(db: AsyncSession, params: dict) -> dict:
    """Resolve image_ids in params to file paths for the task."""
    image_ids = params.get("image_ids")
    if not image_ids:
        return params

    result = await db.execute(select(Image).where(Image.id.in_(image_ids)))
    images = result.scalars().all()

    if len(images) != len(image_ids):
        found = {img.id for img in images}
        missing = [iid for iid in image_ids if iid not in found]
        raise APIError(404, "images_not_found", f"Images not found: {missing}")

    staging_dir = Path(settings.temp_dir) / f"job_staging_{utcnow().strftime('%Y%m%d_%H%M%S_%f')}"
    staging_dir.mkdir(parents=True, exist_ok=True)

    image_paths = []
    for img in images:
        src = Path(img.file_path)
        if src.exists():
            dst = staging_dir / src.name
            try:
                dst.symlink_to(src)
            except OSError:
                shutil.copy2(str(src), str(dst))
            image_paths.append(str(dst))

    updated = {**params, "image_paths": image_paths}
    updated["input_path"] = str(staging_dir)
    return updated


def _get_job_task_id(job: Job) -> str | None:
    """Extract Celery task ID from job (task_id column or legacy status_message)."""
    if job.task_id:
        return job.task_id
    if job.status_message and job.status_message.startswith("celery_task_id:"):
        return job.status_message.split(":", 1)[1]
    return None


def _calc_dir_size(path: str) -> int:
    """Calculate total size of a directory in bytes (sync — call via to_thread)."""
    total = 0
    p = Path(path)
    if p.is_dir():
        for f in p.rglob("*"):
            if f.is_file():
                total += f.stat().st_size
    return total


async def _delete_job_files(db: AsyncSession, job: Job) -> int:
    """Delete all files and DB records associated with a job. Returns bytes freed."""
    bytes_freed = 0

    # Delete output directory (run sync I/O off the event loop)
    output_path = job.output_path or str(Path(settings.output_dir) / job.id)
    if os.path.isdir(output_path):
        bytes_freed += await asyncio.to_thread(_calc_dir_size, output_path)
        await asyncio.to_thread(shutil.rmtree, output_path, True)

    # Also check goes_<job_id> pattern
    goes_dir = str(Path(settings.output_dir) / f"goes_{job.id}")
    if os.path.isdir(goes_dir):
        bytes_freed += await asyncio.to_thread(_calc_dir_size, goes_dir)
        await asyncio.to_thread(shutil.rmtree, goes_dir, True)

    # Delete associated GoesFrame records and their files/thumbnails
    frames_result = await db.execute(select(GoesFrame).where(GoesFrame.source_job_id == job.id))
    frames = frames_result.scalars().all()

    frame_ids = []
    paths_to_remove: list[str] = []
    for frame in frames:
        frame_ids.append(frame.id)
        if frame.thumbnail_path:
            paths_to_remove.append(frame.thumbnail_path)
        if frame.file_path:
            paths_to_remove.append(frame.file_path)

    # Batch file removal off the event loop
    if paths_to_remove:

        def _remove_all() -> int:
            return sum(safe_remove(p) for p in paths_to_remove)

        bytes_freed += await asyncio.to_thread(_remove_all)

    # Bulk delete CollectionFrame join records and frames in chunks
    # to avoid exceeding DB bind-parameter limits on large jobs
    if frame_ids:
        chunk_size = 500
        for i in range(0, len(frame_ids), chunk_size):
            chunk = frame_ids[i : i + chunk_size]
            await db.execute(CollectionFrame.__table__.delete().where(CollectionFrame.frame_id.in_(chunk)))
            await db.execute(GoesFrame.__table__.delete().where(GoesFrame.id.in_(chunk)))

    # Note: Image records don't have source_job_id so we can't easily
    # link them back to jobs. The frame files are already deleted above.

    # Delete job logs
    await db.execute(JobLog.__table__.delete().where(JobLog.job_id == job.id))

    return bytes_freed


@router.post("", response_model=JobResponse)
@limiter.limit("5/minute")
async def create_job(request: Request, job_in: JobCreate, db: DbSession):
    """Create a processing job and dispatch to Celery"""
    output_dir = str(Path(settings.output_dir))
    resolved_params = await _resolve_image_ids(db, job_in.params)

    db_job = Job(
        job_type=job_in.job_type,
        params=resolved_params,
        input_path=resolved_params.get("input_path", job_in.input_path),
    )
    db.add(db_job)
    await db.commit()
    await db.refresh(db_job)

    job_output = str(Path(output_dir) / db_job.id)
    Path(job_output).mkdir(parents=True, exist_ok=True)

    task_params = {
        **resolved_params,
        "input_path": db_job.input_path,
        "output_path": job_output,
    }

    if job_in.job_type == "video_create":
        task = celery_app.send_task("create_video", args=[db_job.id, task_params])
    else:
        task = celery_app.send_task("process_images", args=[db_job.id, task_params])

    db_job.task_id = task.id
    db_job.status_message = f"celery_task_id:{task.id}"
    await db.commit()
    await db.refresh(db_job)

    return db_job


@router.get("", response_model=PaginatedResponse[JobResponse])
async def list_jobs(
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    """List jobs with pagination"""
    count_result = await db.execute(select(func.count()).select_from(Job))
    total = count_result.scalar_one()

    offset = (page - 1) * limit
    result = await db.execute(select(Job).order_by(Job.created_at.desc()).offset(offset).limit(limit))
    jobs = result.scalars().all()

    return PaginatedResponse[JobResponse](
        items=[JobResponse.model_validate(j) for j in jobs],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, db: DbSession):
    """Get job details"""
    validate_uuid(job_id, "job_id")
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise APIError(404, "not_found", _JOB_NOT_FOUND)
    return job


@router.patch("/{job_id}", response_model=JobResponse)
async def update_job(job_id: str, job_in: JobUpdate, db: DbSession):
    """Partially update a job record"""
    validate_uuid(job_id, "job_id")
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise APIError(404, "not_found", _JOB_NOT_FOUND)

    update_data = job_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(job, field, value)

    await db.commit()
    await db.refresh(job)
    return job


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str, db: DbSession):
    """Cancel a running job — revokes the Celery task and cleans up partial files."""
    validate_uuid(job_id, "job_id")
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise APIError(404, "not_found", _JOB_NOT_FOUND)

    if job.status not in ("pending", "processing"):
        raise APIError(400, "not_cancellable", f"Job is already {job.status}")

    # Atomic status transition — prevents TOCTOU race where a concurrent
    # worker could complete the job between our SELECT and this UPDATE.
    now = utcnow()
    upd = await db.execute(
        update(Job)
        .where(Job.id == job_id, Job.status.in_(("pending", "processing")))
        .values(status="cancelled", completed_at=now, status_message="Cancelled by user")
    )
    if upd.rowcount == 0:
        await db.refresh(job)
        raise APIError(409, "conflict", f"Job status changed concurrently to {job.status}")

    await db.commit()

    # Side effects only after successful atomic transition
    task_id = _get_job_task_id(job)
    if task_id:
        try:
            celery_app.control.revoke(task_id, terminate=True, signal="SIGTERM")
        except Exception:
            logger.warning(_REVOKE_FAIL_MSG, task_id)

    output_path = job.output_path or str(Path(settings.output_dir) / f"goes_{job.id}")
    if os.path.isdir(output_path):
        shutil.rmtree(output_path, ignore_errors=True)

    return {"cancelled": True, "job_id": job.id}


@router.delete("/bulk")
@limiter.limit("5/minute")
async def bulk_delete_jobs(
    request: Request,
    payload: BulkJobDeleteRequest,
    db: DbSession,
    delete_files: Annotated[bool, Query()] = False,
    all_jobs: Annotated[bool, Query(alias="all")] = False,
):
    """Bulk delete jobs by IDs or all jobs."""
    use_delete_files = payload.delete_files or delete_files

    if all_jobs:
        result = await db.execute(select(Job))
    elif payload.job_ids:
        result = await db.execute(select(Job).where(Job.id.in_(payload.job_ids)))
    else:
        return {"deleted": [], "count": 0, "bytes_freed": 0}

    jobs = result.scalars().all()

    deleted_ids = []
    total_bytes_freed = 0

    for job in jobs:
        # Revoke any running tasks
        task_id = _get_job_task_id(job)
        if task_id and job.status in ("pending", "processing"):
            try:
                celery_app.control.revoke(task_id, terminate=True, signal="SIGTERM")
            except Exception:
                logger.warning(_REVOKE_FAIL_MSG, task_id)

        if use_delete_files:
            total_bytes_freed += await _delete_job_files(db, job)

        await db.delete(job)
        deleted_ids.append(job.id)

    await db.commit()
    return {
        "deleted": deleted_ids,
        "count": len(deleted_ids),
        "bytes_freed": total_bytes_freed,
    }


@router.delete("/{job_id}")
@limiter.limit("10/minute")
async def delete_job(
    request: Request,
    job_id: str,
    db: DbSession,
    delete_files: Annotated[bool, Query()] = False,
):
    """Delete a job — optionally delete associated files and DB records."""
    validate_uuid(job_id, "job_id")
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise APIError(404, "not_found", _JOB_NOT_FOUND)

    # Revoke Celery task if still running
    task_id = _get_job_task_id(job)
    if task_id and job.status in ("pending", "processing"):
        try:
            celery_app.control.revoke(task_id, terminate=True, signal="SIGTERM")
        except Exception:
            logger.warning(_REVOKE_FAIL_MSG, task_id)

    bytes_freed = 0
    if delete_files:
        bytes_freed = await _delete_job_files(db, job)

    await db.delete(job)
    await db.commit()

    return {"deleted": True, "bytes_freed": bytes_freed}


@router.get("/{job_id}/logs")
async def get_job_logs(
    job_id: str,
    db: DbSession,
    level: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
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
async def get_job_output(job_id: str, db: DbSession):
    """Download job output"""
    validate_uuid(job_id, "job_id")
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise APIError(404, "not_found", _JOB_NOT_FOUND)
    if job.status not in ("completed", "completed_partial"):
        raise APIError(400, "job_not_completed", f"Job is not completed (status: {job.status})")

    # #52: Use stored output_path from job record
    output_path = job.output_path or str(Path(settings.output_dir) / job_id)

    safe_output = validate_safe_path(output_path, settings.output_dir)

    if not safe_output.exists():
        raise APIError(404, "not_found", "Output not found")

    if safe_output.is_file():
        return FileResponse(str(safe_output), filename=safe_output.name)

    files = [f for f in sorted(os.listdir(safe_output)) if (safe_output / f).is_file()]
    if not files:
        raise APIError(404, "not_found", "No output files found")

    for ext in [".mp4", ".avi", ".mkv", ".zip"]:
        for f in files:
            if f.endswith(ext):
                return FileResponse(str(safe_output / f), filename=f)

    first = files[0]
    return FileResponse(str(safe_output / first), filename=first)


@router.post("/cleanup-stale")
async def cleanup_stale_jobs(db: DbSession):
    """Mark stale processing and pending jobs as failed."""
    from ..services.stale_jobs import cleanup_all_stale

    return await cleanup_all_stale(db)
