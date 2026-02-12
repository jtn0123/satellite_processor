"""Job CRUD and processing endpoints - dispatches to Celery workers"""

import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy import func, select

_JOB_NOT_FOUND = "Job not found"
from sqlalchemy.ext.asyncio import AsyncSession

from ..celery_app import celery_app
from ..config import settings
from ..db.database import get_db
from ..db.models import Image, Job
from ..errors import APIError
from ..models.bulk import BulkDeleteRequest
from ..models.job import JobCreate, JobResponse, JobUpdate
from ..models.pagination import PaginatedResponse
from ..rate_limit import limiter

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


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

    staging_dir = Path(settings.temp_dir) / f"job_staging_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S_%f')}"
    staging_dir.mkdir(parents=True, exist_ok=True)

    image_paths = []
    for img in images:
        src = Path(img.file_path)
        if src.exists():
            dst = staging_dir / src.name
            try:
                dst.symlink_to(src)
            except OSError:
                import shutil
                shutil.copy2(str(src), str(dst))
            image_paths.append(str(dst))

    updated = {**params, "image_paths": image_paths}
    updated["input_path"] = str(staging_dir)
    return updated


@router.post("", response_model=JobResponse)
@limiter.limit("5/minute")
async def create_job(request: Request, job_in: JobCreate, db: AsyncSession = Depends(get_db)):
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

    db_job.status_message = f"celery_task_id:{task.id}"
    await db.commit()
    await db.refresh(db_job)

    return db_job


@router.get("", response_model=PaginatedResponse[JobResponse])
async def list_jobs(
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    db: AsyncSession = Depends(get_db),
):
    """List jobs with pagination"""
    count_result = await db.execute(select(func.count()).select_from(Job))
    total = count_result.scalar_one()

    offset = (page - 1) * limit
    result = await db.execute(
        select(Job).order_by(Job.created_at.desc()).offset(offset).limit(limit)
    )
    jobs = result.scalars().all()

    return PaginatedResponse[JobResponse](
        items=[JobResponse.model_validate(j) for j in jobs],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Get job details"""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise APIError(404, "not_found", _JOB_NOT_FOUND)
    return job


@router.patch("/{job_id}", response_model=JobResponse)
async def update_job(job_id: str, job_in: JobUpdate, db: AsyncSession = Depends(get_db)):
    """Partially update a job record"""
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


@router.delete("/bulk")
async def bulk_delete_jobs(
    payload: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Bulk delete/cancel jobs by IDs."""
    ids = payload.ids

    result = await db.execute(select(Job).where(Job.id.in_(ids)))
    jobs = result.scalars().all()

    deleted_ids = []
    for job in jobs:
        if job.status_message and job.status_message.startswith("celery_task_id:"):
            celery_task_id = job.status_message.split(":", 1)[1]
            try:
                celery_app.control.revoke(celery_task_id, terminate=True, signal="SIGTERM")
            except Exception:
                pass
        await db.delete(job)
        deleted_ids.append(job.id)

    await db.commit()
    return {"deleted": deleted_ids, "count": len(deleted_ids)}


@router.delete("/{job_id}")
@limiter.limit("10/minute")
async def delete_job(request: Request, job_id: str, db: AsyncSession = Depends(get_db)):
    """Cancel/delete a job - revokes the Celery task"""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise APIError(404, "not_found", _JOB_NOT_FOUND)

    if job.status_message and job.status_message.startswith("celery_task_id:"):
        celery_task_id = job.status_message.split(":", 1)[1]
        try:
            celery_app.control.revoke(celery_task_id, terminate=True, signal="SIGTERM")
        except Exception:
            pass

    await db.delete(job)
    await db.commit()

    return {"deleted": True}


@router.get("/{job_id}/output")
async def get_job_output(job_id: str, db: AsyncSession = Depends(get_db)):
    """Download job output"""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise APIError(404, "not_found", _JOB_NOT_FOUND)
    if job.status != "completed":
        raise APIError(400, "job_not_completed", f"Job is not completed (status: {job.status})")

    # #52: Use stored output_path from job record
    output_path = job.output_path or str(Path(settings.output_dir) / job_id)
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
                return FileResponse(os.path.join(output_path, f), filename=f)

    first = files[0]
    return FileResponse(os.path.join(output_path, first), filename=first)
