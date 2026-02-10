"""Job CRUD and processing endpoints — dispatches to Celery workers"""

import os
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..db.database import get_db
from ..db.models import Job
from ..models.job import JobCreate, JobResponse
from ..services.storage import storage_service
from ..celery_app import celery_app
from ..config import settings

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("", response_model=JobResponse)
async def create_job(job_in: JobCreate, db: AsyncSession = Depends(get_db)):
    """Create a processing job and dispatch to Celery"""
    output_dir = str(Path(settings.output_dir))

    db_job = Job(
        job_type=job_in.job_type,
        params=job_in.params,
        input_path=job_in.input_path,
    )
    db.add(db_job)
    await db.commit()
    await db.refresh(db_job)

    # Ensure output dir for this job
    job_output = str(Path(output_dir) / db_job.id)
    Path(job_output).mkdir(parents=True, exist_ok=True)

    # Build params with paths
    task_params = {**job_in.params, "input_path": job_in.input_path, "output_path": job_output}

    # Dispatch to Celery
    if job_in.job_type == "video_create":
        task = celery_app.send_task("create_video", args=[db_job.id, task_params])
    else:
        task = celery_app.send_task("process_images", args=[db_job.id, task_params])

    # Store celery task id for revocation
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
        raise HTTPException(404, "Job not found")
    return job


@router.delete("/{job_id}")
async def delete_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Cancel/delete a job — revokes the Celery task"""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")

    # Revoke Celery task if we stored the task id
    if job.status_message and job.status_message.startswith("celery_task_id:"):
        celery_task_id = job.status_message.split(":", 1)[1]
        celery_app.control.revoke(celery_task_id, terminate=True, signal="SIGTERM")

    job.status = "cancelled"
    job.completed_at = datetime.utcnow()
    await db.commit()

    # Publish cancellation to WebSocket listeners
    import json
    import redis as sync_redis
    r = sync_redis.Redis.from_url(settings.redis_url)
    r.publish(f"job:{job_id}", json.dumps({
        "job_id": job_id, "progress": 0, "message": "Job cancelled", "status": "cancelled"
    }))
    r.close()

    return {"deleted": True}


@router.get("/{job_id}/output")
async def get_job_output(job_id: str, db: AsyncSession = Depends(get_db)):
    """Download job output — returns the first output file or a directory listing"""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "completed":
        raise HTTPException(400, f"Job is not completed (status: {job.status})")

    output_path = job.output_path or str(Path(settings.output_dir) / job_id)
    if not os.path.exists(output_path):
        raise HTTPException(404, "Output not found")

    # If it's a file, return it directly
    if os.path.isfile(output_path):
        return FileResponse(output_path, filename=os.path.basename(output_path))

    # If it's a directory, list files or return first video/zip
    files = sorted(os.listdir(output_path))
    if not files:
        raise HTTPException(404, "No output files found")

    # Prefer video files, then images
    for ext in [".mp4", ".avi", ".mkv", ".zip"]:
        for f in files:
            if f.endswith(ext):
                return FileResponse(os.path.join(output_path, f), filename=f)

    # Return first file
    first = files[0]
    return FileResponse(os.path.join(output_path, first), filename=first)
