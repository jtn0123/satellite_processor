"""Discord webhook notifications for job completion."""

from __future__ import annotations

import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import AppSetting

logger = logging.getLogger(__name__)


async def send_webhook_notification(db: AsyncSession, message: str) -> None:
    """Send a Discord webhook if webhook_url is configured in settings."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.key == "webhook_url")
    )
    row = result.scalars().first()
    if not row or not row.value:
        return
    url = row.value if isinstance(row.value, str) else row.value.get("url", "")
    if not url:
        return

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={"content": message})
            resp.raise_for_status()
    except Exception:
        logger.warning("Failed to send webhook notification", exc_info=True)


async def notify_fetch_complete(
    db: AsyncSession,
    satellite: str,
    sector: str,
    band: str,
    frame_count: int,
) -> None:
    """Send a notification when a GOES fetch job completes."""
    msg = f"✅ GOES fetch: {frame_count} frames of {satellite} {sector} {band}"
    await send_webhook_notification(db, msg)
