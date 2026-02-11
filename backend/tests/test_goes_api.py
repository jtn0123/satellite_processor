"""Tests for GOES API endpoints."""
from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
import pytest_asyncio

from app.db.models import Image


@pytest.mark.asyncio
class TestGoesProducts:
    async def test_list_products(self, client):
        resp = await client.get("/api/goes/products")
        assert resp.status_code == 200
        data = resp.json()
        assert "GOES-16" in data["satellites"]
        assert len(data["bands"]) == 16
        assert len(data["sectors"]) == 4


@pytest.mark.asyncio
class TestGoesFetch:
    @patch("app.tasks.goes_tasks.fetch_goes_data.delay")
    async def test_create_fetch_job(self, mock_delay, client):
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-16",
            "sector": "FullDisk",
            "band": "C02",
            "start_time": "2024-03-15T14:00:00",
            "end_time": "2024-03-15T15:00:00",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"
        assert "job_id" in data
        mock_delay.assert_called_once()

    async def test_invalid_satellite(self, client):
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-99",
            "sector": "FullDisk",
            "band": "C02",
            "start_time": "2024-03-15T14:00:00",
            "end_time": "2024-03-15T15:00:00",
        })
        assert resp.status_code == 422

    async def test_invalid_band(self, client):
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-16",
            "sector": "FullDisk",
            "band": "C99",
            "start_time": "2024-03-15T14:00:00",
            "end_time": "2024-03-15T15:00:00",
        })
        assert resp.status_code == 422

    async def test_end_before_start(self, client):
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-16",
            "sector": "FullDisk",
            "band": "C02",
            "start_time": "2024-03-15T15:00:00",
            "end_time": "2024-03-15T14:00:00",
        })
        assert resp.status_code == 422


@pytest.mark.asyncio
class TestGoesGaps:
    async def test_gaps_empty_db(self, client):
        resp = await client.get("/api/goes/gaps")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_frames"] == 0

    async def test_gaps_with_data(self, client, db):
        base = datetime(2024, 3, 15, 12, 0, 0)
        for i in range(5):
            img = Image(
                id=f"gap-test-{i}",
                filename=f"t{i}.png",
                original_name=f"t{i}.png",
                file_path=f"/data/t{i}.png",
                file_size=100,
                satellite="GOES-16",
                channel="C02",
                captured_at=base + timedelta(minutes=10 * i),
            )
            db.add(img)
        # Add one more after a gap
        img = Image(
            id="gap-test-5",
            filename="t5.png",
            original_name="t5.png",
            file_path="/data/t5.png",
            file_size=100,
            satellite="GOES-16",
            channel="C02",
            captured_at=base + timedelta(minutes=100),
        )
        db.add(img)
        await db.commit()

        resp = await client.get("/api/goes/gaps", params={"expected_interval": 10})
        assert resp.status_code == 200
        data = resp.json()
        assert data["gap_count"] == 1


@pytest.mark.asyncio
class TestGoesBackfill:
    @patch("app.tasks.goes_tasks.backfill_gaps.delay")
    async def test_create_backfill_job(self, mock_delay, client):
        resp = await client.post("/api/goes/backfill", json={
            "satellite": "GOES-16",
            "band": "C02",
            "sector": "FullDisk",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"
        mock_delay.assert_called_once()
