"""Image upload and listing endpoints"""

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image as PILImage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db.models import Image
from ..services.storage import storage_service

router = APIRouter(prefix="/api/images", tags=["images"])

UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MB


@router.post("/upload")
async def upload_image(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Upload a satellite image using chunked streaming to avoid OOM on large files."""
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    # Prepare destination path via storage service
    import uuid, re
    from datetime import datetime as dt

    file_id = str(uuid.uuid4())
    safe_name = f"{file_id}_{file.filename}"
    dest = Path(storage_service.upload_dir) / safe_name

    # Stream chunks to disk
    file_size = 0
    with open(dest, "wb") as f:
        while True:
            chunk = await file.read(UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            f.write(chunk)
            file_size += len(chunk)

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
        filename=safe_name,
        original_name=file.filename,
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


@router.get("")
async def list_images(db: AsyncSession = Depends(get_db)):
    """List all uploaded images"""
    result = await db.execute(select(Image).order_by(Image.uploaded_at.desc()))
    images = result.scalars().all()
    return [
        {
            "id": img.id,
            "filename": img.original_name,
            "original_name": img.original_name,
            "size": img.file_size,
            "file_size": img.file_size,
            "width": img.width,
            "height": img.height,
            "satellite": img.satellite,
            "captured_at": str(img.captured_at) if img.captured_at else None,
            "uploaded_at": str(img.uploaded_at),
        }
        for img in images
    ]


@router.delete("/{image_id}")
async def delete_image(image_id: str, db: AsyncSession = Depends(get_db)):
    """Delete an uploaded image"""
    result = await db.execute(select(Image).where(Image.id == image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(404, "Image not found")

    storage_service.delete_file(image.file_path)
    await db.delete(image)
    await db.commit()
    return {"deleted": True}


@router.get("/{image_id}/thumbnail")
async def get_thumbnail(image_id: str, db: AsyncSession = Depends(get_db)):
    """Return a ~200px thumbnail of the image as JPEG, with disk caching"""
    from ..config import settings as app_settings

    result = await db.execute(select(Image).where(Image.id == image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(404, "Image not found")
    fp = Path(image.file_path)
    if not fp.exists():
        raise HTTPException(404, "File not found on disk")

    # Check thumbnail cache
    cache_dir = Path(app_settings.storage_path) / "thumbnails"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / f"{image_id}.jpg"

    if cache_path.exists():
        return FileResponse(
            str(cache_path),
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    try:
        img = PILImage.open(fp)
        img.thumbnail((200, 200))
        img.convert("RGB").save(str(cache_path), format="JPEG", quality=80)
        return FileResponse(
            str(cache_path),
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"},
        )
    except Exception:
        raise HTTPException(500, "Could not generate thumbnail")


@router.get("/{image_id}/full")
async def get_full_image(image_id: str, db: AsyncSession = Depends(get_db)):
    """Return the original image file"""
    result = await db.execute(select(Image).where(Image.id == image_id))
    image = result.scalar_one_or_none()
    if not image:
        raise HTTPException(404, "Image not found")
    fp = Path(image.file_path)
    if not fp.exists():
        raise HTTPException(404, "File not found on disk")
    return FileResponse(str(fp), filename=image.original_name)
