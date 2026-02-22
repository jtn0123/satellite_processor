"""Tests for shared frame path validation and API key startup warning."""

import logging
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from app.db.models import GoesFrame, ShareLink
from app.utils import utcnow
from sqlalchemy import update

from tests.conftest import TestSessionLocal


@pytest_asyncio.fixture
async def share_setup(db):
    """Create a frame and share link for testing."""
    frame = GoesFrame(
        id="test-frame-1",
        satellite="GOES-16",
        sector="CONUS",
        band="02",
        capture_time=utcnow(),
        file_path="./data/test-image.png",
        file_size=1024,
        width=800,
        height=600,
    )
    db.add(frame)
    await db.flush()

    link = ShareLink(
        token="valid-token",
        frame_id="test-frame-1",
        expires_at=utcnow() + timedelta(hours=72),
    )
    db.add(link)
    await db.commit()
    return frame, link


@pytest.mark.asyncio
async def test_shared_image_valid_path(client, share_setup, tmp_path):
    """Valid path within storage directory serves file."""
    img = tmp_path / "test-image.png"
    img.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)

    with patch("app.routers.share.settings") as mock_settings:
        mock_settings.storage_path = str(tmp_path)
        # Update the frame's file_path to point to our temp file
        async with TestSessionLocal() as db:
            await db.execute(
                update(GoesFrame)
                .where(GoesFrame.id == "test-frame-1")
                .values(file_path=str(img))
            )
            await db.commit()

        resp = await client.get("/api/shared/valid-token/image")
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_shared_image_path_traversal_returns_404(client, share_setup):
    """Path traversal attempt returns 404."""
    async with TestSessionLocal() as db:
        await db.execute(
            update(GoesFrame)
            .where(GoesFrame.id == "test-frame-1")
            .values(file_path="/etc/passwd")
        )
        await db.commit()

    with patch("app.routers.share.settings") as mock_settings:
        mock_settings.storage_path = "/app/data"
        resp = await client.get("/api/shared/valid-token/image")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_api_key_warning_logged_when_empty(caplog):
    """Startup logs warning when API key is not set."""
    with patch("app.main.app_settings") as mock_settings, \
         patch("app.main.init_db", new_callable=AsyncMock), \
         patch("app.main.close_redis_pool", new_callable=AsyncMock), \
         patch("app.main.setup_logging"), \
         patch("app.main._stale_job_checker", new_callable=AsyncMock):
        mock_settings.api_key = ""
        mock_settings.debug = False

        from app.main import lifespan

        mock_app = AsyncMock()
        with caplog.at_level(logging.WARNING, logger="app.main"):
            async with lifespan(mock_app):
                pass

        assert any(
            "API key is not set" in record.message
            for record in caplog.records
        ), f"Expected API key warning, got: {[r.message for r in caplog.records]}"
