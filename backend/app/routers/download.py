"""Download endpoints for job outputs."""

from __future__ import annotations

import io
import os
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db.database import get_db
from ..db.models import Job
from ..errors import APIError
from ..rate_limit import limiter

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}/download")
@limiter.limit("20/minute")
async def download_job_output(request: Request, job_id: str, db: AsyncSession = Depends(get_db)):
    """Download job output as a single file or zip of all outputs."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise APIError(404, "not_found", "Job not found")
    if job.status != "completed":
        raise APIError(400, "job_not_completed", f"Job status is '{job.status}', not completed")

    output_path = job.output_path or str(Path(settings.output_dir) / job_id)
    if not os.path.exists(output_path):
        raise APIError(404, "not_found", "Output not found on disk")

    # Single file
    if os.path.isfile(output_path):
        return FileResponse(output_path, filename=os.path.basename(output_path))

    # Directory — list files
    files = [f for f in sorted(os.listdir(output_path)) if os.path.isfile(os.path.join(output_path, f))]
    if not files:
        raise APIError(404, "not_found", "No output files")

    # Single file in dir
    if len(files) == 1:
        return FileResponse(os.path.join(output_path, files[0]), filename=files[0])

    # Multiple files — zip on the fly
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname in files:
            zf.write(os.path.join(output_path, fname), fname)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="job_{job_id[:8]}_output.zip"'},
    )


@router.post("/bulk-download")
@limiter.limit("5/minute")
async def bulk_download(request: Request, payload: dict, db: AsyncSession = Depends(get_db)):
    """Download outputs from multiple jobs as a single zip."""
    job_ids = payload.get("job_ids", [])
    if not job_ids:
        raise APIError(400, "no_jobs", "No job IDs provided")

    result = await db.execute(select(Job).where(Job.id.in_(job_ids), Job.status == "completed"))
    jobs = result.scalars().all()
    if not jobs:
        raise APIError(404, "not_found", "No completed jobs found")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for job in jobs:
            output_path = job.output_path or str(Path(settings.output_dir) / job.id)
            if not os.path.exists(output_path):
                continue
            prefix = f"job_{job.id[:8]}"
            if os.path.isfile(output_path):
                zf.write(output_path, f"{prefix}/{os.path.basename(output_path)}")
            elif os.path.isdir(output_path):
                for fname in os.listdir(output_path):
                    fpath = os.path.join(output_path, fname)
                    if os.path.isfile(fpath):
                        zf.write(fpath, f"{prefix}/{fname}")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="bulk_output.zip"'},
    )
