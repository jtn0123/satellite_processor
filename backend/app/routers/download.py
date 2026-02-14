"""Download endpoints for job outputs."""

import os
import zipfile
from collections.abc import Generator
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db.database import get_db
from ..db.models import Job
from ..errors import APIError, validate_safe_path, validate_uuid
from ..models.bulk import BulkDeleteRequest
from ..rate_limit import limiter

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


MAX_ZIP_FILES = 1000


def _zip_stream(files: list[tuple[str, str]]) -> Generator[bytes, None, None]:
    """Stream zip creation without buffering entire archive in memory.

    Each tuple is (absolute_path, archive_name).
    Uses ZIP_STORED (no compression) so bytes can be yielded incrementally.
    """
    import io

    if len(files) > MAX_ZIP_FILES:
        raise APIError(
            400,
            "export_too_large",
            f"Export exceeds maximum of {MAX_ZIP_FILES} files. "
            f"Requested {len(files)} files.",
        )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        for abs_path, arc_name in files:
            zf.write(abs_path, arc_name)
            # Yield bytes written so far and reset buffer
            data = buf.getvalue()
            if data:
                yield data
            buf.seek(0)
            buf.truncate(0)
    # Final central directory bytes
    remaining = buf.getvalue()
    if remaining:
        yield remaining


def _collect_job_files(job: Job, prefix: str = "") -> list[tuple[str, str]]:
    """Collect files from a job's output path.  Returns list of (abs_path, archive_name)."""
    output_path = job.output_path or str(Path(settings.output_dir) / job.id)
    if not os.path.exists(output_path):
        return []
    if os.path.isfile(output_path):
        arc = f"{prefix}/{os.path.basename(output_path)}" if prefix else os.path.basename(output_path)
        return [(output_path, arc)]
    result = []
    for fname in sorted(os.listdir(output_path)):
        fpath = os.path.join(output_path, fname)
        if os.path.isfile(fpath):
            arc = f"{prefix}/{fname}" if prefix else fname
            result.append((fpath, arc))
    return result


@router.get("/{job_id}/download")
@limiter.limit("20/minute")
async def download_job_output(request: Request, job_id: str, db: AsyncSession = Depends(get_db)):
    """Download job output as a single file or zip of all outputs."""
    validate_uuid(job_id, "job_id")
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise APIError(404, "not_found", "Job not found")
    if job.status != "completed":
        raise APIError(400, "job_not_completed", f"Job status is '{job.status}', not completed")

    output_path = job.output_path or str(Path(settings.output_dir) / job_id)
    # Prevent path traversal — ensure output stays within storage
    validate_safe_path(output_path, settings.storage_path)
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

    # Multiple files — stream zip
    file_pairs = [(os.path.join(output_path, f), f) for f in files]
    return StreamingResponse(
        _zip_stream(file_pairs),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="job_{job_id[:8]}_output.zip"'},
    )


@router.post("/bulk-download")
@limiter.limit("5/minute")
async def bulk_download(request: Request, payload: BulkDeleteRequest, db: AsyncSession = Depends(get_db)):
    """Download outputs from multiple jobs as a single zip.

    #155: Uses BulkDeleteRequest (renamed concept — reuses ids list Pydantic model)
    for proper validation instead of raw dict.
    """
    job_ids = payload.ids
    if not job_ids:
        raise APIError(400, "no_jobs", "No job IDs provided")
    for jid in job_ids:
        validate_uuid(jid, "job_id")

    result = await db.execute(select(Job).where(Job.id.in_(job_ids), Job.status == "completed"))
    jobs = result.scalars().all()
    if not jobs:
        raise APIError(404, "not_found", "No completed jobs found")

    file_pairs: list[tuple[str, str]] = []
    for job in jobs:
        prefix = f"job_{job.id[:8]}"
        file_pairs.extend(_collect_job_files(job, prefix))

    if not file_pairs:
        raise APIError(404, "not_found", "No output files found")

    return StreamingResponse(
        _zip_stream(file_pairs),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="bulk_output.zip"'},
    )
