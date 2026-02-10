"""Image upload and listing endpoints"""

import os
import re
import uuid
from datetime import datetime as dt
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image as PILImage
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db.models import Image
from ..errors import APIError
from ..models.image import ImageResponse
from ..models.pagination import PaginatedResponse
from ..rate_limit import limiter
from ..services.storage import storage_service

router = APIRouter(prefix="/api/images", tags=["images"])

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

    # Sanitize filename
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

    # Stream chunks to disk, enforce size limit
    file_size = 0
    with open(dest, "wb") as f:
        while True:
            chunk = await file.read(UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            file_size += len(chunk)
            if file_size > MAX_FILE_SIZE:
                f.close()
                dest.unlink(missing_ok=True)
                raise APIError(413, "file_too_large", "File exceeds 500MB limit")
            f.write(chunk)

    # Get dimensions from the saved file (reads only header, not full load)
    width = height = None
    try:
        with PILImage.open(dest) as img:
            width, height = img.size
    except Exception:
        pass

    # Parse satellite metadata from filename
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
    # Total count
    count_result = await db.execute(select(func.count()).select_from(Image))
    total = count_result.scalar_one()

    # Paginated query
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
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """Bulk delete images by IDs. Accepts {"ids": [...]}"""
    ids = payload.get("ids", [])
    if not ids or not isinstance(ids, list):
        raise APIError(400, "invalid_payload", "Must provide a non-empty 'ids' list")

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
async def delete_image(image_id: str, db: AsyncSession = Depends(get_db)):
    """Delete an uploaded image"""
    result = await db.execute(select(Image).where(Image.id == image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise APIError(404, "not_found", "Image not found")
    storage_service.delete_file(image.file_path)
    await db.delete(image)
    await db.commit()
    return {"deleted": True}


@router.get("/{image_id}/thumbnail")
async def get_thumbnail(image_id: str, db: AsyncSession = Depends(get_db)):
    """Return a ~200px thumbnail"""
    from ..config import settings as app_settings
    result = await db.execute(select(Image).where(Image.id == image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise APIError(404, "not_found", "Image not found")
    fp = Path(image.file_path)
    if not fp.exists():
        raise APIError(404, "not_found", "File not found on disk")
    cache_dir = Path(app_settings.storage_path) / "thumbnails"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / f"{image_id}.jpg"
    if cache_path.exists():
        return FileResponse(str(cache_path), media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"})
    try:
        img = PILImage.open(fp)
        img.thumbnail((200, 200))
        img.convert("RGB").save(str(cache_path), format="JPEG", quality=80)
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
        raise APIError(404, "not_found", "Image not found")
    fp = Path(image.file_path)
    if not fp.exists():
        raise APIError(404, "not_found", "File not found on disk")
    return FileResponse(str(fp), filename=image.original_name)
