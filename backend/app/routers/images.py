"""Image upload and listing endpoints"""

import logging
import os
import re
import uuid
from datetime import datetime as dt
from pathlib import Path
from typing import Annotated

import aiofiles
from fastapi import APIRouter, File, Query, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image as PILImage
from sqlalchemy import func, select

from ..db.database import DbSession
from ..db.models import Image
from ..errors import APIError, validate_safe_path, validate_uuid
from ..models.bulk import BulkDeleteRequest
from ..models.image import ImageResponse
from ..models.pagination import PaginatedResponse
from ..rate_limit import limiter
from ..services.storage import storage_service
from ..utils import sanitize_log

logger = logging.getLogger(__name__)

_IMAGE_NOT_FOUND = "Image not found"

router = APIRouter(prefix="/api/images", tags=["images"])


ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff"}
ALLOWED_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/tiff",
    "image/x-tiff",
}
# JTN-473 Issue B: previously 500 MB. The only thing a legitimate user
# uploads here is a satellite frame (a few MB). A 50 MB cap keeps
# headroom for enhanced-resolution exports without letting a single
# request fill the disk.
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MB

# Background thumbnail pre-generation deferred — see GitHub issue #31


@router.post("/upload")
@limiter.limit("10/minute")
async def upload_image(request: Request, file: Annotated[UploadFile, File()], db: DbSession):
    """Upload a satellite image using chunked streaming to avoid OOM on large files.

    JTN-473 Issue B: now enforces a content-type allowlist in addition to
    the extension allowlist, caps the body at 50 MB, and verifies the
    bytes actually decode as an image via ``PIL.Image.verify()`` before
    committing the row. Non-image files are rejected with 415.
    """
    logger.info("Image upload started: filename=%s", sanitize_log(file.filename or ""))
    if not file.filename:
        raise APIError(400, "invalid_filename", "No filename provided")

    safe_basename = os.path.basename(file.filename)
    if len(safe_basename) > 200:
        name, ext = os.path.splitext(safe_basename)
        safe_basename = name[: 200 - len(ext)] + ext
    ext = os.path.splitext(safe_basename)[1].lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise APIError(400, "invalid_file_type", f"File type {ext} not allowed. Accepted: {sorted(ALLOWED_EXTENSIONS)}")

    # Content-Type allowlist — we never want to accept ``application/octet-stream``
    # or ``text/plain`` with a .png extension. None/empty means the client
    # didn't declare one, which is also rejected.
    declared_type = (file.content_type or "").lower().split(";")[0].strip()
    if declared_type and declared_type not in ALLOWED_CONTENT_TYPES:
        raise APIError(
            415,
            "invalid_content_type",
            f"Content-Type {declared_type!r} is not allowed. Accepted: {sorted(ALLOWED_CONTENT_TYPES)}",
        )

    # Reject on Content-Length header before streaming anything, so truly
    # huge bodies never touch the disk.
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_FILE_SIZE:
        raise APIError(
            413,
            "file_too_large",
            f"File exceeds {MAX_FILE_SIZE // (1024 * 1024)} MB limit",
        )

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
                raise APIError(
                    413,
                    "file_too_large",
                    f"File exceeds {MAX_FILE_SIZE // (1024 * 1024)} MB limit",
                )
            await f.write(chunk)

    # JTN-473 Issue B: don't trust the extension — make PIL actually
    # decode the bytes. ``verify()`` closes the file after checking, so
    # we immediately reopen to pull width/height.
    width = height = None
    try:
        with PILImage.open(dest) as img:
            img.verify()
        with PILImage.open(dest) as img:
            width, height = img.size
    except Exception:
        dest.unlink(missing_ok=True)
        raise APIError(
            415,
            "invalid_image",
            "Uploaded file could not be decoded as an image",
        )

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
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    """List uploaded images with pagination"""
    logger.debug("Listing images: page=%d, limit=%d", page, limit)
    count_result = await db.execute(select(func.count()).select_from(Image))
    total = count_result.scalar_one()

    offset = (page - 1) * limit
    result = await db.execute(select(Image).order_by(Image.uploaded_at.desc()).offset(offset).limit(limit))
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
    db: DbSession,
):
    """Bulk delete images by IDs."""
    logger.info("Bulk delete requested: count=%d", len(payload.ids))
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
async def delete_image(request: Request, image_id: str, db: DbSession):
    """Delete an uploaded image"""
    logger.info("Deleting image: id=%s", sanitize_log(image_id))
    validate_uuid(image_id, "image_id")
    result = await db.execute(select(Image).where(Image.id == image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise APIError(404, "not_found", _IMAGE_NOT_FOUND)
    storage_service.delete_file(image.file_path)
    await db.delete(image)
    await db.commit()
    return {"deleted": True}


@router.get("/{image_id}/thumbnail")
async def get_thumbnail(image_id: str, db: DbSession):
    """Return a ~256px thumbnail"""
    logger.debug("Thumbnail requested: image_id=%s", sanitize_log(image_id))
    validate_uuid(image_id, "image_id")
    from ..config import settings as app_settings

    result = await db.execute(select(Image).where(Image.id == image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise APIError(404, "not_found", _IMAGE_NOT_FOUND)
    fp = validate_safe_path(image.file_path, app_settings.storage_path)

    if not fp.exists():
        raise APIError(404, "not_found", "File not found on disk")
    cache_dir = Path(app_settings.storage_path) / "thumbnails"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / f"{image_id}.jpg"
    if cache_path.exists():
        return FileResponse(
            str(cache_path), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"}
        )
    # #204: Run PIL thumbnail generation in a thread to avoid blocking the event loop
    import asyncio

    def _generate_thumbnail():
        with PILImage.open(fp) as img:
            img.thumbnail((256, 256))
            img.convert("RGB").save(str(cache_path), format="JPEG", quality=80)

    try:
        await asyncio.to_thread(_generate_thumbnail)
        return FileResponse(
            str(cache_path), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"}
        )
    except (OSError, ValueError):
        raise APIError(500, "thumbnail_error", "Could not generate thumbnail")


@router.get("/{image_id}/full")
async def get_full_image(image_id: str, db: DbSession):
    """Return the original image file"""
    logger.debug("Full image requested: image_id=%s", sanitize_log(image_id))
    validate_uuid(image_id, "image_id")
    result = await db.execute(select(Image).where(Image.id == image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise APIError(404, "not_found", _IMAGE_NOT_FOUND)
    from ..config import settings as app_settings_full

    fp = validate_safe_path(image.file_path, app_settings_full.storage_path)

    if not fp.exists():
        raise APIError(404, "not_found", "File not found on disk")
    return FileResponse(str(fp), filename=image.original_name)
