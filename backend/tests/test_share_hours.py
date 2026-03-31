"""Tests for share link hours parameter validation."""

from __future__ import annotations

import pytest
from app.db.models import GoesFrame
from app.utils import utcnow


@pytest.mark.asyncio
async def test_share_link_default_hours(client, db):
    """Creating a share link with default hours should succeed."""
    frame = GoesFrame(
        id="share-test-1",
        satellite="GOES-16",
        sector="CONUS",
        band="02",
        capture_time=utcnow(),
        file_path="./data/test.png",
        file_size=1024,
        width=800,
        height=600,
    )
    db.add(frame)
    await db.commit()

    resp = await client.post("/api/satellite/frames/share-test-1/share")
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert "expires_at" in data


@pytest.mark.asyncio
async def test_share_link_custom_hours(client, db):
    """Creating a share link with custom valid hours."""
    frame = GoesFrame(
        id="share-test-2",
        satellite="GOES-16",
        sector="CONUS",
        band="02",
        capture_time=utcnow(),
        file_path="./data/test.png",
        file_size=1024,
        width=800,
        height=600,
    )
    db.add(frame)
    await db.commit()

    resp = await client.post("/api/satellite/frames/share-test-2/share?hours=24")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_share_link_hours_too_high(client, db):
    """Hours exceeding 8760 (1 year) should be rejected."""
    frame = GoesFrame(
        id="share-test-3",
        satellite="GOES-16",
        sector="CONUS",
        band="02",
        capture_time=utcnow(),
        file_path="./data/test.png",
        file_size=1024,
        width=800,
        height=600,
    )
    db.add(frame)
    await db.commit()

    resp = await client.post("/api/satellite/frames/share-test-3/share?hours=9999")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_share_link_hours_zero(client, db):
    """Hours of 0 should be rejected (ge=1)."""
    frame = GoesFrame(
        id="share-test-4",
        satellite="GOES-16",
        sector="CONUS",
        band="02",
        capture_time=utcnow(),
        file_path="./data/test.png",
        file_size=1024,
        width=800,
        height=600,
    )
    db.add(frame)
    await db.commit()

    resp = await client.post("/api/satellite/frames/share-test-4/share?hours=0")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_share_link_hours_negative(client, db):
    """Negative hours should be rejected."""
    frame = GoesFrame(
        id="share-test-5",
        satellite="GOES-16",
        sector="CONUS",
        band="02",
        capture_time=utcnow(),
        file_path="./data/test.png",
        file_size=1024,
        width=800,
        height=600,
    )
    db.add(frame)
    await db.commit()

    resp = await client.post("/api/satellite/frames/share-test-5/share?hours=-1")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_share_link_max_hours(client, db):
    """Hours exactly at 8760 (1 year) should be accepted."""
    frame = GoesFrame(
        id="share-test-6",
        satellite="GOES-16",
        sector="CONUS",
        band="02",
        capture_time=utcnow(),
        file_path="./data/test.png",
        file_size=1024,
        width=800,
        height=600,
    )
    db.add(frame)
    await db.commit()

    resp = await client.post("/api/satellite/frames/share-test-6/share?hours=8760")
    assert resp.status_code == 200
