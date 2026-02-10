"""Job CRUD and processing endpoints"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..db.database import get_db
from ..db.models import Job
from ..models.job import JobCreate, JobResponse
from ..services.processor import processor_service
from ..services.storage import storage_service

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("", response_model=JobResponse)
async def create_job(job_in: JobCreate, db: AsyncSession = Depends(get_db)):
    """Create and launch a processing job"""
    db_job = Job(
        job_type=job_in.job_type,
        params=job_in.params,
        input_path=job_in.input_path,
    )
    db.add(db_job)
    await db.commit()
    await db.refresh(db_job)

    # Setup output directory
    output_dir = storage_service.get_job_output_dir(db_job.id)

    # Define DB update callbacks
    async def _update_job(**kwargs):
        async with db.begin():
            for k, v in kwargs.items():
                setattr(db_job, k, v)

    # Launch in background thread
    def on_progress(job_id, operation, pct):
        # We can't easily do async updates from a thread, so we just log for now
        # Phase 2 will use Redis pub/sub for this
        pass

    def on_complete(job_id):
        pass

    def on_error(job_id, error):
        pass

    processor_service.run_job(
        job_id=db_job.id,
        input_path=job_in.input_path,
        output_path=str(output_dir),
        params=job_in.params,
        on_progress=on_progress,
        on_complete=on_complete,
        on_error=on_error,
    )

    # Update status to processing
    db_job.status = "processing"
    db_job.started_at = datetime.utcnow()
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
    """Cancel/delete a job"""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")

    processor_service.cancel_job(job_id)
    job.status = "cancelled"
    await db.commit()
    return {"deleted": True}
