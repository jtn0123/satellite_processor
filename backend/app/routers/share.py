"""Public share link endpoints for GOES frames."""

from __future__ import annotations

import os
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..config import settings
from ..db.database import get_db
from ..db.models import GoesFrame, ShareLink
from ..utils import utcnow

router = APIRouter(tags=["share"])


class ShareLinkResponse(BaseModel):
    token: str
    url: str
    expires_at: str


class SharedFrameResponse(BaseModel):
    id: str
    satellite: str
    sector: str
    band: str
    capture_time: str
    width: int | None
    height: int | None
    file_size: int


@router.post("/api/goes/frames/{frame_id}/share", response_model=ShareLinkResponse)
async def create_share_link(
    frame_id: str,
    hours: int = 72,
    db: AsyncSession = Depends(get_db),
):
    """Create a public share link for a frame (expires in N hours, default 72)."""
    result = await db.execute(select(GoesFrame).where(GoesFrame.id == frame_id))
    frame = result.scalar_one_or_none()
    if not frame:
        raise HTTPException(status_code=404, detail="Frame not found")

    token = secrets.token_urlsafe(32)
    expires = utcnow() + timedelta(hours=hours)

    link = ShareLink(token=token, frame_id=frame_id, expires_at=expires)
    db.add(link)
    await db.commit()

    return ShareLinkResponse(
        token=token,
        url=f"/shared/{token}",
        expires_at=expires.isoformat(),
    )


@router.get("/api/shared/{token}", response_model=SharedFrameResponse)
async def get_shared_frame(token: str, db: AsyncSession = Depends(get_db)):
    """Public endpoint — retrieve frame info by share token."""
    link = await _get_valid_link(token, db)
    frame = link.frame
    return SharedFrameResponse(
        id=frame.id,
        satellite=frame.satellite,
        sector=frame.sector,
        band=frame.band,
        capture_time=frame.capture_time.isoformat(),
        width=frame.width,
        height=frame.height,
        file_size=frame.file_size,
    )


@router.get("/api/shared/{token}/image")
async def get_shared_image(token: str, db: AsyncSession = Depends(get_db)):
    """Public endpoint — serve the actual image for a share token."""
    link = await _get_valid_link(token, db)
    frame = link.frame
    path = os.path.realpath(frame.file_path)
    storage_root = os.path.realpath(settings.storage_path)
    if not path.startswith(storage_root + os.sep):
        raise HTTPException(status_code=403, detail="Access denied")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Image file not found on disk")
    return FileResponse(path, media_type="image/png")


async def _get_valid_link(token: str, db: AsyncSession) -> ShareLink:
    result = await db.execute(
        select(ShareLink)
        .options(selectinload(ShareLink.frame))
        .where(ShareLink.token == token)
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")
    if link.expires_at < utcnow():
        raise HTTPException(status_code=410, detail="Share link has expired")
    return link
