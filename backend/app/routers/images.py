"""Image upload and listing endpoints"""

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import cv2

from ..db.database import get_db
from ..db.models import Image
from ..services.storage import storage_service

router = APIRouter(prefix="/api/images", tags=["images"])


@router.post("/upload")
async def upload_image(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Upload a satellite image"""
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    content = await file.read()
    meta = storage_service.save_upload(file.filename, content)

    # Try to get image dimensions
    import numpy as np
    nparr = np.frombuffer(content, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    width = img.shape[1] if img is not None else None
    height = img.shape[0] if img is not None else None

    db_image = Image(
        id=meta["id"],
        filename=meta["filename"],
        original_name=meta["original_name"],
        file_path=meta["file_path"],
        file_size=meta["file_size"],
        width=width,
        height=height,
        satellite=meta.get("satellite"),
        captured_at=meta.get("captured_at"),
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
            "size": img.file_size,
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
