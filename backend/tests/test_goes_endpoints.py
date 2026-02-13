"""Tests for GOES satellite endpoints (products, fetch, gaps, latest, preview)."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from app.db.models import GoesFrame


def _make_frame(db, **overrides):
    defaults = {
        "id": str(uuid.uuid4()),
        "satellite": "GOES-19",
        "sector": "CONUS",
        "band": "C02",
        "capture_time": datetime(2024, 3, 15, 14, 0, tzinfo=UTC),
        "file_path": "/tmp/test.nc",
        "file_size": 1024,
    }
    defaults.update(overrides)
    frame = GoesFrame(**defaults)
    db.add(frame)
    return frame


@pytest.mark.asyncio
class TestProducts:
    async def test_returns_satellites(self, client):
        resp = await client.get("/api/goes/products")
        assert resp.status_code == 200
        data = resp.json()
        assert "satellites" in data
        assert "GOES-16" in data["satellites"]
        assert "GOES-18" in data["satellites"]

    async def test_returns_sectors(self, client):
        resp = await client.get("/api/goes/products")
        data = resp.json()
        assert "sectors" in data
        assert len(data["sectors"]) > 0
        sector_ids = [s["id"] for s in data["sectors"]]
        assert "FullDisk" in sector_ids
        assert "CONUS" in sector_ids

    async def test_returns_bands(self, client):
        resp = await client.get("/api/goes/products")
        data = resp.json()
        assert "bands" in data
        assert len(data["bands"]) == 16
        band_ids = [b["id"] for b in data["bands"]]
        assert "C01" in band_ids
        assert "C16" in band_ids

    async def test_bands_have_descriptions(self, client):
        resp = await client.get("/api/goes/products")
        for band in resp.json()["bands"]:
            assert "description" in band
            assert len(band["description"]) > 0

    async def test_sectors_have_product(self, client):
        resp = await client.get("/api/goes/products")
        for sector in resp.json()["sectors"]:
            assert "product" in sector


@pytest.mark.asyncio
class TestFetchGoes:
    @patch("app.tasks.goes_tasks.fetch_goes_data.delay")
    async def test_valid_fetch(self, mock_delay, client):
        now = datetime.now(UTC)
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-19",
            "sector": "CONUS",
            "band": "C02",
            "start_time": (now - timedelta(hours=1)).isoformat(),
            "end_time": now.isoformat(),
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"
        assert "job_id" in data
        mock_delay.assert_called_once()

    async def test_invalid_satellite(self, client):
        now = datetime.now(UTC)
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-99",
            "sector": "CONUS",
            "band": "C02",
            "start_time": (now - timedelta(hours=1)).isoformat(),
            "end_time": now.isoformat(),
        })
        assert resp.status_code == 422

    async def test_invalid_band(self, client):
        now = datetime.now(UTC)
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-19",
            "sector": "CONUS",
            "band": "C99",
            "start_time": (now - timedelta(hours=1)).isoformat(),
            "end_time": now.isoformat(),
        })
        assert resp.status_code == 422

    async def test_invalid_sector(self, client):
        now = datetime.now(UTC)
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-19",
            "sector": "INVALID",
            "band": "C02",
            "start_time": (now - timedelta(hours=1)).isoformat(),
            "end_time": now.isoformat(),
        })
        assert resp.status_code == 422

    async def test_time_range_exceeds_24h(self, client):
        now = datetime.now(UTC)
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-19",
            "sector": "CONUS",
            "band": "C02",
            "start_time": (now - timedelta(hours=25)).isoformat(),
            "end_time": now.isoformat(),
        })
        assert resp.status_code == 422

    async def test_end_before_start(self, client):
        now = datetime.now(UTC)
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-19",
            "sector": "CONUS",
            "band": "C02",
            "start_time": now.isoformat(),
            "end_time": (now - timedelta(hours=1)).isoformat(),
        })
        assert resp.status_code == 422

    async def test_missing_fields(self, client):
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-19",
        })
        assert resp.status_code == 422

    @patch("app.tasks.goes_tasks.fetch_goes_data.delay")
    async def test_fetch_goes18(self, mock_delay, client):
        now = datetime.now(UTC)
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-18",
            "sector": "CONUS",
            "band": "C02",
            "start_time": (now - timedelta(hours=1)).isoformat(),
            "end_time": now.isoformat(),
        })
        assert resp.status_code == 200

    @patch("app.tasks.goes_tasks.fetch_goes_data.delay")
    async def test_fetch_fulldisk(self, mock_delay, client):
        now = datetime.now(UTC)
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-19",
            "sector": "FullDisk",
            "band": "C02",
            "start_time": (now - timedelta(hours=1)).isoformat(),
            "end_time": now.isoformat(),
        })
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestGaps:
    async def test_gaps_empty_db(self, client):
        resp = await client.get("/api/goes/gaps")
        assert resp.status_code == 200

    async def test_gaps_with_satellite_filter(self, client, db):
        _make_frame(db)
        await db.commit()
        resp = await client.get("/api/goes/gaps?satellite=GOES-16")
        assert resp.status_code == 200

    async def test_gaps_with_band_filter(self, client, db):
        _make_frame(db)
        await db.commit()
        resp = await client.get("/api/goes/gaps?band=C02")
        assert resp.status_code == 200

    async def test_gaps_with_both_filters(self, client, db):
        _make_frame(db)
        await db.commit()
        resp = await client.get("/api/goes/gaps?satellite=GOES-16&band=C02")
        assert resp.status_code == 200

    async def test_gaps_custom_interval(self, client):
        resp = await client.get("/api/goes/gaps?expected_interval=15.0")
        assert resp.status_code == 200

    async def test_gaps_invalid_interval_too_low(self, client):
        resp = await client.get("/api/goes/gaps?expected_interval=0.1")
        assert resp.status_code == 422

    async def test_gaps_invalid_interval_too_high(self, client):
        resp = await client.get("/api/goes/gaps?expected_interval=100")
        assert resp.status_code == 422


@pytest.mark.asyncio
class TestLatest:
    async def test_latest_with_data(self, client, db):
        _make_frame(db, satellite="GOES-16", sector="CONUS", band="C02")
        await db.commit()
        resp = await client.get("/api/goes/latest?satellite=GOES-16&sector=CONUS&band=C02")
        assert resp.status_code == 200
        data = resp.json()
        assert data["satellite"] == "GOES-16"
        assert data["band"] == "C02"

    async def test_latest_no_frames(self, client):
        resp = await client.get("/api/goes/latest?satellite=GOES-16&sector=CONUS&band=C02")
        assert resp.status_code == 404

    async def test_latest_returns_most_recent(self, client, db):
        _make_frame(db, capture_time=datetime(2024, 1, 1, tzinfo=UTC))
        _make_frame(db, capture_time=datetime(2024, 6, 1, tzinfo=UTC))
        await db.commit()
        resp = await client.get("/api/goes/latest?satellite=GOES-16&sector=CONUS&band=C02")
        assert resp.status_code == 200
        # Should return the most recent one
        data = resp.json()
        assert "2024-06" in data["capture_time"]

    async def test_latest_defaults(self, client, db):
        _make_frame(db, satellite="GOES-16", sector="CONUS", band="C02")
        await db.commit()
        # Defaults: satellite=GOES-16, sector=CONUS, band=C02
        resp = await client.get("/api/goes/latest")
        assert resp.status_code == 200

    async def test_latest_wrong_satellite(self, client, db):
        _make_frame(db, satellite="GOES-16")
        await db.commit()
        resp = await client.get("/api/goes/latest?satellite=GOES-18&sector=CONUS&band=C02")
        assert resp.status_code == 404

    async def test_latest_response_fields(self, client, db):
        _make_frame(db, width=5424, height=5424, thumbnail_path="/tmp/thumb.png")
        await db.commit()
        resp = await client.get("/api/goes/latest?satellite=GOES-16&sector=CONUS&band=C02")
        data = resp.json()
        assert data["width"] == 5424
        assert data["height"] == 5424
        assert data["thumbnail_path"] == "/tmp/thumb.png"


@pytest.mark.asyncio
class TestBackfill:
    @patch("app.tasks.goes_tasks.backfill_gaps.delay")
    async def test_backfill_valid(self, mock_delay, client):
        resp = await client.post("/api/goes/backfill", json={
            "satellite": "GOES-19",
            "band": "C02",
            "sector": "CONUS",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"
        mock_delay.assert_called_once()

    # Rate-limited endpoint (2/min), keep test count minimal
