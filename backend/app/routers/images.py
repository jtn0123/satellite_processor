"""Image upload and listing endpoints"""

import os
import re
import uuid
from datetime import datetime as dt
from pathlib import Path
from typing import Annotated

import aiofiles
from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image as PILImage
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db.models import Image
from ..errors import APIError
from ..models.bulk import BulkDeleteRequest
from ..models.image import ImageResponse
from ..models.pagination import PaginatedResponse
from ..rate_limit import limiter
from ..services.storage import storage_service

_IMAGE_NOT_FOUND = "Image not found"

router = APIRouter(prefix="/api/images", tags=["images"])


def _validate_file_path(file_path: str) -> Path:
    """#23: Validate that a file path is within the configured storage directory."""
    from ..config import settings as app_settings
    storage_root = Path(app_settings.storage_path).resolve()
    resolved = Path(file_path).resolve()
    if not str(resolved).startswith(str(storage_root)):
        raise APIError(403, "forbidden", "File path outside storage directory")
    return resolved

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff"}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB
UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MB

# TODO (#31): Pre-generate thumbnails in background after upload to avoid
# on-demand thumbnail generation latency. Could use a Celery task or
# asyncio.create_task to generate thumbnails immediately after upload completes.


@router.post("/upload")
@limiter.limit("10/minute")
async def upload_image(request: Request, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Upload a satellite image using chunked streaming to avoid OOM on large files."""
    if not file.filename:
        raise APIError(400, "invalid_filename", "No filename provided")

    safe_basename = os.path.basename(file.filename)
    if len(safe_basename) > 200:
        name, ext = os.path.splitext(safe_basename)
        safe_basename = name[:200 - len(ext)] + ext
    ext = os.path.splitext(safe_basename)[1].lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise APIError(400, "invalid_file_type",
            f"File type {ext} not allowed. Accepted: {sorted(ALLOWED_EXTENSIONS)}")

    file_id = str(uuid.uuid4())
    dest_name = f"{file_id}_{safe_basename}"
    dest = Path(storage_service.upload_dir) / dest_name

    file_size = 0
    async with aiofiles.open(dest, "wb") as f:
        while True:
            chunk = await file.read(UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            file_size += len(chunk)
            if file_size > MAX_FILE_SIZE:
                dest.unlink(missing_ok=True)
                raise APIError(413, "file_too_large", "File exceeds 500MB limit")
            await f.write(chunk)

    width = height = None
    try:
        with PILImage.open(dest) as img:
            width, height = img.size
    except Exception:
        pass

    satellite = None
    captured_at = None
    match = re.search(r"(\d{8}T\d{6}Z)", file.filename)
    if match:
        captured_at = dt.strptime(match.group(1), "%Y%m%dT%H%M%SZ")
    upper = file.filename.upper()
    if "GOES-16" in upper:
        satellite = "GOES-16"
    elif "GOES-18" in upper:
        satellite = "GOES-18"

    db_image = Image(
        id=file_id,
        filename=dest_name,
        original_name=safe_basename,
        file_path=str(dest),
        file_size=file_size,
        width=width,
        height=height,
        satellite=satellite,
        captured_at=captured_at,
    )
    db.add(db_image)
    await db.commit()
    await db.refresh(db_image)
    return {"id": db_image.id, "filename": db_image.original_name, "size": db_image.file_size}


@router.get("", response_model=PaginatedResponse[ImageResponse])
async def list_images(
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    db: AsyncSession = Depends(get_db),
):
    """List uploaded images with pagination"""
    count_result = await db.execute(select(func.count()).select_from(Image))
    total = count_result.scalar_one()

    offset = (page - 1) * limit
    result = await db.execute(
        select(Image).order_by(Image.uploaded_at.desc()).offset(offset).limit(limit)
    )
    images = result.scalars().all()

    return PaginatedResponse[ImageResponse](
        items=[ImageResponse.model_validate(img) for img in images],
        total=total,
        page=page,
        limit=limit,
    )


@router.delete("/bulk")
async def bulk_delete_images(
    payload: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Bulk delete images by IDs."""
    ids = payload.ids

    result = await db.execute(select(Image).where(Image.id.in_(ids)))
    images = result.scalars().all()

    deleted_ids = []
    for image in images:
        storage_service.delete_file(image.file_path)
        await db.delete(image)
        deleted_ids.append(image.id)

    await db.commit()
    return {"deleted": deleted_ids, "count": len(deleted_ids)}


@router.delete("/{image_id}")
@limiter.limit("10/minute")
async def delete_image(request: Request, image_id: str, db: AsyncSession = Depends(get_db)):
    """Delete an uploaded image"""
    result = await db.execute(select(Image).where(Image.id == image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise APIError(404, "not_found", _IMAGE_NOT_FOUND)
    storage_service.delete_file(image.file_path)
    await db.delete(image)
    await db.commit()
    return {"deleted": True}


@router.get("/{image_id}/thumbnail")
async def get_thumbnail(image_id: str, db: AsyncSession = Depends(get_db)):
    """Return a ~256px thumbnail"""
    from ..config import settings as app_settings
    result = await db.execute(select(Image).where(Image.id == image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise APIError(404, "not_found", _IMAGE_NOT_FOUND)
    fp = _validate_file_path(image.file_path)
    if not fp.exists():
        raise APIError(404, "not_found", "File not found on disk")
    cache_dir = Path(app_settings.storage_path) / "thumbnails"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / f"{image_id}.jpg"
    if cache_path.exists():
        return FileResponse(str(cache_path), media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"})
    # #204: Run PIL thumbnail generation in a thread to avoid blocking the event loop
    import asyncio

    def _generate_thumbnail():
        with PILImage.open(fp) as img:
            img.thumbnail((256, 256))
            img.convert("RGB").save(str(cache_path), format="JPEG", quality=80)

    try:
        await asyncio.to_thread(_generate_thumbnail)
        return FileResponse(str(cache_path), media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"})
    except Exception:
        raise APIError(500, "thumbnail_error", "Could not generate thumbnail")


@router.get("/{image_id}/full")
async def get_full_image(image_id: str, db: AsyncSession = Depends(get_db)):
    """Return the original image file"""
    result = await db.execute(select(Image).where(Image.id == image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise APIError(404, "not_found", _IMAGE_NOT_FOUND)
    fp = _validate_file_path(image.file_path)
    if not fp.exists():
        raise APIError(404, "not_found", "File not found on disk")
    return FileResponse(str(fp), filename=image.original_name)
