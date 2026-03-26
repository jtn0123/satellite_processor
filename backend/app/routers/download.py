"""Download endpoints for job outputs."""

import logging
import os
from collections.abc import Generator
from pathlib import Path

import zipstream
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


def _is_child_of(child: Path, parent: Path) -> bool:
    """Check if *child* is a descendant of *parent* after resolving symlinks."""
    try:
        child_str = str(child.resolve())
        parent_str = str(parent.resolve())
        return child_str.startswith(parent_str + os.sep) or child_str == parent_str
    except OSError:
        return False


router = APIRouter(prefix="/api/jobs", tags=["jobs"])


MAX_ZIP_FILES = 1000


def _zip_stream(files: list[tuple[str, str]]) -> Generator[bytes, None, None]:
    """Stream zip creation for job output downloads.

    Each tuple is (absolute_path, archive_name).
    Uses zipstream-ng for true streaming — files are read and yielded in chunks
    without buffering the entire archive in memory.
    """
    if len(files) > MAX_ZIP_FILES:
        raise APIError(
            400,
            "export_too_large",
            f"Export exceeds maximum of {MAX_ZIP_FILES} files. Requested {len(files)} files.",
        )

    logger = logging.getLogger(__name__)
    zs = zipstream.ZipStream(sized=False)
    for abs_path, arc_name in files:
        try:
            # Verify the file is readable before adding to the stream.
            # add_path only stats the file; actual reads happen during iteration.
            # Pre-opening catches permission errors and confirms readability.
            with open(abs_path, "rb") as f:
                f.read(1)
            zs.add_path(abs_path, arc_name)
        except OSError:
            logger.warning("Skipping missing/unreadable file: %s", abs_path)
    try:
        yield from zs
    except OSError:
        # File disappeared or became unreadable between add and iteration.
        # The zip is already partially written so we can only log and stop.
        logger.error("OSError during zip streaming — archive may be truncated")


def _collect_job_files(job: Job, prefix: str = "") -> list[tuple[str, str]]:
    """Collect files from a job's output path.  Returns list of (abs_path, archive_name)."""
    output_path = job.output_path or str(Path(settings.output_dir) / job.id)

    try:
        safe_path = validate_safe_path(output_path, settings.output_dir)
    except Exception:
        return []

    if not safe_path.exists():
        return []
    if safe_path.is_file():
        arc = f"{prefix}/{safe_path.name}" if prefix else safe_path.name
        return [(str(safe_path), arc)]
    result = []
    for fname in sorted(os.listdir(safe_path)):
        fpath = safe_path / fname
        if not _is_child_of(fpath, safe_path):
            continue
        if fpath.resolve().is_file():
            arc = f"{prefix}/{fname}" if prefix else fname
            result.append((str(fpath.resolve()), arc))
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
    if job.status not in ("completed", "completed_partial"):
        raise APIError(400, "job_not_completed", f"Job status is '{job.status}', not completed")

    output_path = job.output_path or str(Path(settings.output_dir) / job_id)
    safe_output = validate_safe_path(output_path, settings.output_dir)

    if not safe_output.exists():
        raise APIError(404, "not_found", "Output not found on disk")

    # Single file
    if safe_output.is_file():
        return FileResponse(str(safe_output), filename=safe_output.name)

    # Directory — list files, resolving each to guard against symlink escapes
    files = [
        f
        for f in sorted(os.listdir(safe_output))
        if _is_child_of(safe_output / f, safe_output) and (safe_output / f).resolve().is_file()
    ]
    if not files:
        raise APIError(404, "not_found", "No output files")

    # Single file in dir
    if len(files) == 1:
        return FileResponse(str(safe_output / files[0]), filename=files[0])

    # Multiple files — stream zip
    file_pairs = [(str(safe_output / f), f) for f in files]
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

    result = await db.execute(
        select(Job).where(Job.id.in_(job_ids), Job.status.in_(["completed", "completed_partial"]))
    )
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
