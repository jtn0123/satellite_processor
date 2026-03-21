"""Bulk operations for GOES frames: bulk delete, bulk tag, process, export."""

from __future__ import annotations

import csv
import io
import json as json_mod
import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Body, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db.database import get_db
from ..db.models import (
    CollectionFrame,
    FrameTag,
    GoesFrame,
    Job,
)
from ..errors import APIError
from ..models.goes_data import (
    BulkFrameDeleteRequest,
    BulkTagRequest,
    ProcessFramesRequest,
)
from ..rate_limit import limiter
from ..services.cache import invalidate

logger = logging.getLogger(__name__)

MAX_EXPORT_LIMIT = 5000

router = APIRouter(prefix="/api/satellite", tags=["satellite-frames"])


@router.delete("/frames")
@limiter.limit("30/minute")
async def bulk_delete_frames(
    request: Request,
    payload: BulkFrameDeleteRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Bulk delete frames and their files."""
    logger.info("Bulk delete frames requested")
    result = await db.execute(
        select(GoesFrame).where(GoesFrame.id.in_(payload.ids))
    )
    frames = result.scalars().all()

    for frame in frames:
        for path in [frame.file_path, frame.thumbnail_path]:
            if path:
                try:
                    os.remove(path)
                except OSError:
                    pass

    # Bug #17: Delete FK references before deleting frames
    await db.execute(delete(CollectionFrame).where(CollectionFrame.frame_id.in_(payload.ids)))
    await db.execute(delete(FrameTag).where(FrameTag.frame_id.in_(payload.ids)))
    await db.execute(delete(GoesFrame).where(GoesFrame.id.in_(payload.ids)))
    await db.commit()
    await invalidate("cache:dashboard-stats*")
    return {"deleted": len(frames)}


@router.post("/frames/tag")
@limiter.limit("30/minute")
async def bulk_tag_frames(
    request: Request,
    payload: BulkTagRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Bulk tag frames using ON CONFLICT DO NOTHING for performance."""
    logger.info("Bulk tagging frames")
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    values = [
        {"frame_id": frame_id, "tag_id": tag_id}
        for frame_id in payload.frame_ids
        for tag_id in payload.tag_ids
    ]
    if values:
        stmt = pg_insert(FrameTag).values(values).on_conflict_do_nothing()
        await db.execute(stmt)
    await db.commit()
    return {"tagged": len(payload.frame_ids)}


@router.post("/frames/process")
@limiter.limit("30/minute")
async def process_frames(
    request: Request,
    payload: ProcessFramesRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Send selected frames to the processing pipeline."""
    logger.info("Processing frames requested")
    result = await db.execute(
        select(GoesFrame.file_path).where(GoesFrame.id.in_(payload.frame_ids))
    )
    paths = [r[0] for r in result.all()]
    if not paths:
        raise APIError(404, "not_found", "No frames found")

    job_id = str(uuid.uuid4())
    staging_dir = str(Path(settings.output_dir) / f"job_staging_{job_id}")

    job = Job(
        id=job_id,
        status="pending",
        job_type="image_process",
        params={
            **payload.params,
            "image_paths": paths,
            "input_path": staging_dir,
        },
    )
    db.add(job)
    await db.commit()

    from ..tasks.processing import process_images_task

    process_images_task.delay(job_id, job.params)
    return {"job_id": job_id, "status": "pending", "frame_count": len(paths)}


def _frames_to_csv(frames: list[GoesFrame]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "satellite", "sector", "band", "capture_time", "file_size"])
    for f in frames:
        writer.writerow([
            f.id, f.satellite, f.sector, f.band,
            f.capture_time.isoformat() if f.capture_time else "",
            f.file_size,
        ])
    return output.getvalue()


def _frames_to_json_list(frames: list[GoesFrame]) -> list[dict]:
    return [
        {
            "id": f.id,
            "satellite": f.satellite,
            "sector": f.sector,
            "band": f.band,
            "capture_time": f.capture_time.isoformat() if f.capture_time else None,
            "file_size": f.file_size,
        }
        for f in frames
    ]


# Bug #2: /frames/export MUST be registered before /frames/{frame_id}
@router.get("/frames/export")
@limiter.limit("60/minute")
async def export_frames(
    request: Request,
    format: str = Query("json", pattern="^(csv|json)$"),  # noqa: A002
    db: AsyncSession = Depends(get_db),
    limit: int = Query(1000, ge=1),
    offset: int = Query(0, ge=0),
):
    """Export frame metadata as CSV or JSON with pagination."""
    logger.info("Exporting frames")
    if limit > MAX_EXPORT_LIMIT:
        raise APIError(
            400,
            "limit_exceeded",
            f"Export limit must not exceed {MAX_EXPORT_LIMIT}. Requested: {limit}",
        )

    query = (
        select(GoesFrame)
        .order_by(GoesFrame.capture_time.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(query)
    frames = result.scalars().all()

    if format == "csv":
        csv_data = _frames_to_csv(frames)
        return StreamingResponse(
            io.BytesIO(csv_data.encode()),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=goes_frames.csv"},
        )

    items = _frames_to_json_list(frames)

    async def _stream_json():
        yield json_mod.dumps(items)

    return StreamingResponse(
        _stream_json(),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=goes_frames.json"},
    )
