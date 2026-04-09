"""Public share link endpoints for GOES frames."""

from __future__ import annotations

import logging
import secrets
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Body, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..config import settings
from ..db.database import DbSession
from ..db.models import GoesFrame, ShareLink
from ..errors import APIError, validate_safe_path
from ..utils import sanitize_log, utcnow

logger = logging.getLogger(__name__)

router = APIRouter(tags=["share"])

# Bounds on share-link lifetime. 1 hour minimum to avoid links that expire
# before they can be copy-pasted; 30 days maximum so callers can't mint
# effectively-permanent links (JTN-473 Issue A).
_SHARE_MIN_HOURS = 1
_SHARE_MAX_HOURS = 24 * 30  # 30 days
_SHARE_DEFAULT_HOURS = 72


class ShareLinkRequest(BaseModel):
    """Optional body for ``POST /api/satellite/frames/{frame_id}/share``.

    Previously this endpoint only honored a ``?hours=`` query parameter; a
    body field named ``expires_in_hours`` was accepted (because Pydantic
    ignored it) but silently dropped. Both names are now accepted in the
    body and validated with the same bounds as the query param.
    """

    expires_in_hours: int | None = Field(None, ge=_SHARE_MIN_HOURS, le=_SHARE_MAX_HOURS)
    hours: int | None = Field(None, ge=_SHARE_MIN_HOURS, le=_SHARE_MAX_HOURS)


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
    expires_at: str


@router.post("/api/satellite/frames/{frame_id}/share", response_model=ShareLinkResponse)
async def create_share_link(
    frame_id: str,
    db: DbSession,
    hours: Annotated[int, Query(ge=_SHARE_MIN_HOURS, le=_SHARE_MAX_HOURS)] = _SHARE_DEFAULT_HOURS,
    payload: Annotated[ShareLinkRequest | None, Body()] = None,
) -> ShareLinkResponse:
    """Create a public share link for a frame.

    The expiration window can be set three ways (body takes precedence over
    query so frontends can POST a single JSON payload):

    1. ``POST .../share`` body ``{"expires_in_hours": 24}``
    2. ``POST .../share`` body ``{"hours": 24}`` (legacy alias)
    3. ``POST .../share?hours=24`` (legacy query parameter)

    Defaults to 72 hours. Valid range: 1 hour .. 30 days.
    """
    # Resolve the effective expiration window, preferring the body over
    # the query parameter when both are set.
    effective_hours: int = hours
    if payload is not None:
        if payload.expires_in_hours is not None:
            effective_hours = payload.expires_in_hours
        elif payload.hours is not None:
            effective_hours = payload.hours

    logger.info("Creating share link: frame_id=%s, hours=%d", sanitize_log(frame_id), effective_hours)
    result = await db.execute(select(GoesFrame).where(GoesFrame.id == frame_id))
    frame = result.scalar_one_or_none()
    if not frame:
        raise APIError(404, "share_error", "Frame not found")

    token = secrets.token_urlsafe(32)
    expires = utcnow() + timedelta(hours=effective_hours)

    link = ShareLink(token=token, frame_id=frame_id, expires_at=expires)
    db.add(link)
    await db.commit()

    return ShareLinkResponse(
        token=token,
        url=f"/shared/{token}",
        expires_at=expires.isoformat(),
    )


@router.get("/api/shared/{token}", response_model=SharedFrameResponse)
async def get_shared_frame(token: str, db: DbSession) -> SharedFrameResponse:
    """Public endpoint — retrieve frame info by share token."""
    logger.info("Shared frame requested: token=%s...", sanitize_log(token[:8]))
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
        expires_at=link.expires_at.isoformat(),
    )


@router.get("/api/shared/{token}/image")
async def get_shared_image(token: str, db: DbSession) -> FileResponse:
    """Public endpoint — serve the actual image for a share token."""
    logger.info("Shared image requested: token=%s...", sanitize_log(token[:8]))
    link = await _get_valid_link(token, db)
    frame = link.frame
    try:
        path = validate_safe_path(frame.file_path, settings.storage_path)
    except APIError:
        raise APIError(404, "share_error", "Image file not found on disk")
    if not path.is_file():
        raise APIError(404, "share_error", "Image file not found on disk")
    return FileResponse(str(path), media_type="image/png")


async def _get_valid_link(token: str, db: AsyncSession) -> ShareLink:
    result = await db.execute(select(ShareLink).options(selectinload(ShareLink.frame)).where(ShareLink.token == token))
    link = result.scalar_one_or_none()
    if not link:
        raise APIError(404, "share_error", "Share link not found")
    if link.expires_at < utcnow():
        raise APIError(410, "share_error", "Share link has expired")
    return link
