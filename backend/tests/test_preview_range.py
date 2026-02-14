"""Tests for frame preview range endpoint."""

from datetime import UTC, datetime

import pytest
from app.db.models import GoesFrame

from tests.conftest import TestSessionLocal


async def _seed_frames(count: int = 5, satellite: str = "GOES-16",
                       sector: str = "CONUS", band: str = "C02") -> list[str]:
    """Insert test frames and return their IDs."""
    ids = []
    async with TestSessionLocal() as session:
        for i in range(count):
            f = GoesFrame(
                satellite=satellite,
                sector=sector,
                band=band,
                capture_time=datetime(2024, 6, 15, 12, i * 10, tzinfo=UTC),
                file_path=f"/tmp/frame_{i}.nc",
                file_size=1000,
            )
            session.add(f)
            await session.flush()
            ids.append(str(f.id))
        await session.commit()
    return ids


@pytest.mark.asyncio
async def test_preview_range_basic(client, db):
    await _seed_frames(5)

    resp = await client.get("/api/goes/frames/preview-range", params={
        "satellite": "GOES-16",
        "sector": "CONUS",
        "band": "C02",
        "start_time": "2024-06-15T12:00:00Z",
        "end_time": "2024-06-15T13:00:00Z",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_count"] == 5
    assert len(data["frames"]) == 5


@pytest.mark.asyncio
async def test_preview_range_empty(client, db):
    """No frames match → empty result."""
    resp = await client.get("/api/goes/frames/preview-range", params={
        "satellite": "GOES-16",
        "sector": "CONUS",
        "band": "C02",
        "start_time": "2020-01-01T00:00:00Z",
        "end_time": "2020-01-01T01:00:00Z",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_count"] == 0
    assert data["frames"] == []


@pytest.mark.asyncio
async def test_preview_range_filters_satellite(client, db):
    await _seed_frames(3, satellite="GOES-16")
    await _seed_frames(2, satellite="GOES-18")

    resp = await client.get("/api/goes/frames/preview-range", params={
        "satellite": "GOES-18",
        "sector": "CONUS",
        "band": "C02",
        "start_time": "2024-06-15T12:00:00Z",
        "end_time": "2024-06-15T13:00:00Z",
    })
    assert resp.status_code == 200
    assert resp.json()["total_count"] == 2


@pytest.mark.asyncio
async def test_preview_range_filters_band(client, db):
    await _seed_frames(3, band="C02")
    await _seed_frames(2, band="C13")

    resp = await client.get("/api/goes/frames/preview-range", params={
        "satellite": "GOES-16",
        "sector": "CONUS",
        "band": "C13",
        "start_time": "2024-06-15T12:00:00Z",
        "end_time": "2024-06-15T13:00:00Z",
    })
    assert resp.status_code == 200
    assert resp.json()["total_count"] == 2


@pytest.mark.asyncio
async def test_preview_range_invalid_time_format(client, db):
    """Invalid time format → 422."""
    resp = await client.get("/api/goes/frames/preview-range", params={
        "satellite": "GOES-16",
        "sector": "CONUS",
        "band": "C02",
        "start_time": "not-a-date",
        "end_time": "also-not-a-date",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_preview_range_missing_params(client, db):
    """Missing required params → 422."""
    resp = await client.get("/api/goes/frames/preview-range", params={
        "satellite": "GOES-16",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_preview_range_captures_interval(client, db):
    """Verify capture_interval_minutes is computed."""
    await _seed_frames(5)

    resp = await client.get("/api/goes/frames/preview-range", params={
        "satellite": "GOES-16",
        "sector": "CONUS",
        "band": "C02",
        "start_time": "2024-06-15T12:00:00Z",
        "end_time": "2024-06-15T13:00:00Z",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "capture_interval_minutes" in data
    # 5 frames 10 min apart → interval ~10
    assert data["capture_interval_minutes"] == pytest.approx(10, abs=1)
