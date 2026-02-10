"""Job CRUD and processing endpoints - dispatches to Celery workers"""

import os
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..celery_app import celery_app
from ..config import settings
from ..db.database import get_db
from ..db.models import Image, Job
from ..errors import APIError
from ..models.job import JobCreate, JobResponse
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

    staging_dir = Path(settings.temp_dir) / f"job_staging_{datetime.utcnow().strftime('%Y%m%d_%H%M%S_%f')}"
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


@router.get("", response_model=list[JobResponse])
async def list_jobs(db: AsyncSession = Depends(get_db)):
    """List all jobs"""
    result = await db.execute(select(Job).order_by(Job.created_at.desc()))
    return result.scalars().all()


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Get job details"""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise APIError(404, "not_found", "Job not found")
    return job


@router.delete("/{job_id}")
@limiter.limit("10/minute")
async def delete_job(request: Request, job_id: str, db: AsyncSession = Depends(get_db)):
    """Cancel/delete a job - revokes the Celery task"""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise APIError(404, "not_found", "Job not found")

    if job.status_message and job.status_message.startswith("celery_task_id:"):
        celery_task_id = job.status_message.split(":", 1)[1]
        celery_app.control.revoke(celery_task_id, terminate=True, signal="SIGTERM")

    job.status = "cancelled"
    job.completed_at = datetime.utcnow()
    await db.commit()

    import json

    import redis.asyncio as aioredis
    r = aioredis.from_url(settings.redis_url)
    await r.publish(f"job:{job_id}", json.dumps({
        "job_id": job_id, "progress": 0, "message": "Job cancelled", "status": "cancelled"
    }))
    await r.close()

    return {"deleted": True}


@router.get("/{job_id}/output")
async def get_job_output(job_id: str, db: AsyncSession = Depends(get_db)):
    """Download job output"""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise APIError(404, "not_found", "Job not found")
    if job.status != "completed":
        raise APIError(400, "job_not_completed", f"Job is not completed (status: {job.status})")

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
