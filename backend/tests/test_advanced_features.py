"""Tests for advanced features: latest endpoint and composites."""
from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from app.db.models import Composite, GoesFrame, Job


@pytest.mark.asyncio
class TestLatestEndpoint:
    async def test_latest_no_frames(self, client):
        resp = await client.get("/api/goes/latest", params={
            "satellite": "GOES-16", "sector": "CONUS", "band": "C02",
        })
        assert resp.status_code == 404

    async def test_latest_returns_most_recent(self, client, db):
        base = datetime(2024, 6, 15, 12, 0, 0)
        for i in range(3):
            db.add(GoesFrame(
                id=f"latest-{i}",
                satellite="GOES-16",
                sector="CONUS",
                band="C02",
                capture_time=base + timedelta(hours=i),
                file_path=f"/data/frame_{i}.png",
                file_size=1000 * (i + 1),
            ))
        await db.commit()

        resp = await client.get("/api/goes/latest", params={
            "satellite": "GOES-16", "sector": "CONUS", "band": "C02",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "latest-2"  # Most recent
        assert data["satellite"] == "GOES-16"

    async def test_latest_filters_correctly(self, client, db):
        db.add(GoesFrame(
            id="g16-frame",
            satellite="GOES-16", sector="CONUS", band="C02",
            capture_time=datetime(2024, 6, 15, 12, 0, 0),
            file_path="/data/g16.png", file_size=1000,
        ))
        db.add(GoesFrame(
            id="g18-frame",
            satellite="GOES-18", sector="CONUS", band="C02",
            capture_time=datetime(2024, 6, 15, 13, 0, 0),
            file_path="/data/g18.png", file_size=1000,
        ))
        await db.commit()

        resp = await client.get("/api/goes/latest", params={
            "satellite": "GOES-18", "sector": "CONUS", "band": "C02",
        })
        assert resp.status_code == 200
        assert resp.json()["id"] == "g18-frame"


@pytest.mark.asyncio
class TestCompositeRecipes:
    async def test_list_recipes(self, client):
        resp = await client.get("/api/goes/composite-recipes")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 6
        recipe_ids = [r["id"] for r in data]
        assert "true_color" in recipe_ids
        assert "fire_detection" in recipe_ids


@pytest.mark.asyncio
class TestComposites:
    @patch("app.tasks.goes_tasks.generate_composite.delay")
    async def test_create_composite(self, mock_delay, client):
        resp = await client.post("/api/goes/composites", json={
            "recipe": "true_color",
            "satellite": "GOES-16",
            "sector": "CONUS",
            "capture_time": "2024-06-15T12:00:00",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"
        assert "id" in data
        assert "job_id" in data
        mock_delay.assert_called_once()

    async def test_create_composite_invalid_recipe(self, client):
        resp = await client.post("/api/goes/composites", json={
            "recipe": "nonexistent",
            "satellite": "GOES-16",
            "sector": "CONUS",
            "capture_time": "2024-06-15T12:00:00",
        })
        assert resp.status_code == 400

    async def test_create_composite_missing_time(self, client):
        resp = await client.post("/api/goes/composites", json={
            "recipe": "true_color",
            "satellite": "GOES-16",
            "sector": "CONUS",
        })
        assert resp.status_code == 400

    async def test_list_composites_empty(self, client):
        resp = await client.get("/api/goes/composites")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    async def test_list_composites_with_data(self, client, db):
        job = Job(id="comp-job-1", status="completed", job_type="composite")
        db.add(job)
        db.add(Composite(
            id="comp-1",
            name="True Color",
            recipe="true_color",
            satellite="GOES-16",
            sector="CONUS",
            capture_time=datetime(2024, 6, 15, 12, 0, 0),
            file_path="/data/comp.png",
            file_size=5000,
            status="completed",
            job_id="comp-job-1",
        ))
        await db.commit()

        resp = await client.get("/api/goes/composites")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["recipe"] == "true_color"

    async def test_get_composite(self, client, db):
        job = Job(id="comp-job-2", status="completed", job_type="composite")
        db.add(job)
        db.add(Composite(
            id="comp-2",
            name="Fire Detection",
            recipe="fire_detection",
            satellite="GOES-16",
            sector="CONUS",
            capture_time=datetime(2024, 6, 15, 12, 0, 0),
            status="completed",
            job_id="comp-job-2",
        ))
        await db.commit()

        resp = await client.get("/api/goes/composites/comp-2")
        assert resp.status_code == 200
        assert resp.json()["recipe"] == "fire_detection"

    async def test_get_composite_not_found(self, client):
        resp = await client.get("/api/goes/composites/nonexistent")
        assert resp.status_code == 404
