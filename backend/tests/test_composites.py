"""Tests for GOES composites endpoints."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from app.db.models import Composite, Job


def _make_composite(db, **overrides):
    """Helper to create a composite in the DB."""
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, status="pending", job_type="composite")
    defaults = {
        "id": str(uuid.uuid4()),
        "name": "True Color",
        "recipe": "true_color",
        "satellite": "GOES-16",
        "sector": "CONUS",
        "capture_time": datetime(2024, 3, 15, 14, 0, tzinfo=UTC),
        "status": "completed",
        "job_id": job_id,
        "file_path": "/tmp/composite.png",
        "file_size": 2048,
    }
    defaults.update(overrides)
    composite = Composite(**defaults)
    db.add(job)
    db.add(composite)
    return composite


@pytest.mark.asyncio
class TestCompositeRecipes:
    async def test_list_recipes(self, client):
        resp = await client.get("/api/goes/composite-recipes")
        assert resp.status_code == 200
        recipes = resp.json()
        assert isinstance(recipes, list)
        assert len(recipes) >= 6
        names = [r["id"] for r in recipes]
        assert "true_color" in names
        assert "fire_detection" in names

    async def test_recipe_has_bands(self, client):
        resp = await client.get("/api/goes/composite-recipes")
        for recipe in resp.json():
            assert "bands" in recipe
            assert len(recipe["bands"]) >= 2

    async def test_recipe_has_name(self, client):
        resp = await client.get("/api/goes/composite-recipes")
        for recipe in resp.json():
            assert "name" in recipe
            assert len(recipe["name"]) > 0


@pytest.mark.asyncio
class TestCreateComposite:
    @patch("app.tasks.goes_tasks.generate_composite.delay")
    async def test_create_valid_composite(self, mock_delay, client):
        resp = await client.post("/api/goes/composites", json={
            "recipe": "true_color",
            "satellite": "GOES-16",
            "sector": "CONUS",
            "capture_time": "2024-03-15T14:00:00",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"
        assert "id" in data
        assert "job_id" in data
        mock_delay.assert_called_once()

    async def test_create_invalid_recipe(self, client):
        resp = await client.post("/api/goes/composites", json={
            "recipe": "nonexistent_recipe",
            "satellite": "GOES-16",
            "sector": "CONUS",
            "capture_time": "2024-03-15T14:00:00",
        })
        assert resp.status_code in (400, 422)
        assert "Unknown recipe" in resp.json()["detail"]

    async def test_create_missing_capture_time(self, client):
        resp = await client.post("/api/goes/composites", json={
            "recipe": "true_color",
            "satellite": "GOES-16",
            "sector": "CONUS",
        })
        assert resp.status_code in (400, 422)
        detail = resp.json()["detail"]
        assert any("capture_time" in str(e.get("loc", "")) for e in detail)

    async def test_create_missing_recipe(self, client):
        resp = await client.post("/api/goes/composites", json={
            "satellite": "GOES-16",
            "sector": "CONUS",
            "capture_time": "2024-03-15T14:00:00",
        })
        assert resp.status_code in (400, 422)

    @patch("app.tasks.goes_tasks.generate_composite.delay")
    async def test_create_defaults_satellite(self, mock_delay, client):
        resp = await client.post("/api/goes/composites", json={
            "recipe": "natural_color",
            "capture_time": "2024-03-15T14:00:00",
        })
        assert resp.status_code == 200

    @patch("app.tasks.goes_tasks.generate_composite.delay")
    async def test_create_all_recipes(self, mock_delay, client):
        recipes = ["true_color", "natural_color", "fire_detection", "dust_ash", "day_cloud_phase", "airmass"]
        for recipe in recipes:
            resp = await client.post("/api/goes/composites", json={
                "recipe": recipe,
                "capture_time": "2024-03-15T14:00:00",
            })
            assert resp.status_code == 200, f"Failed for recipe: {recipe}"


@pytest.mark.asyncio
class TestListComposites:
    async def test_list_empty(self, client):
        resp = await client.get("/api/goes/composites")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    async def test_list_with_data(self, client, db):
        _make_composite(db)
        await db.commit()
        resp = await client.get("/api/goes/composites")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["recipe"] == "true_color"

    async def test_list_pagination(self, client, db):
        for _i in range(5):
            _make_composite(db, id=str(uuid.uuid4()))
        await db.commit()
        resp = await client.get("/api/goes/composites?page=1&limit=2")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        assert data["page"] == 1
        assert data["limit"] == 2

    async def test_list_pagination_page2(self, client, db):
        for _i in range(5):
            _make_composite(db, id=str(uuid.uuid4()))
        await db.commit()
        resp = await client.get("/api/goes/composites?page=2&limit=2")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 2

    async def test_list_pagination_beyond_last(self, client, db):
        _make_composite(db)
        await db.commit()
        resp = await client.get("/api/goes/composites?page=100&limit=20")
        assert resp.status_code == 200
        assert resp.json()["items"] == []

    async def test_list_multiple_recipes(self, client, db):
        _make_composite(db, id=str(uuid.uuid4()), recipe="true_color", name="True Color")
        _make_composite(db, id=str(uuid.uuid4()), recipe="fire_detection", name="Fire Detection")
        await db.commit()
        resp = await client.get("/api/goes/composites")
        recipes = {c["recipe"] for c in resp.json()["items"]}
        assert "true_color" in recipes
        assert "fire_detection" in recipes


@pytest.mark.asyncio
class TestGetComposite:
    async def test_get_found(self, client, db):
        comp = _make_composite(db)
        await db.commit()
        resp = await client.get(f"/api/goes/composites/{comp.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == comp.id
        assert data["recipe"] == "true_color"
        assert data["satellite"] == "GOES-16"

    async def test_get_not_found(self, client):
        resp = await client.get("/api/goes/composites/nonexistent")
        assert resp.status_code == 404

    async def test_get_returns_all_fields(self, client, db):
        comp = _make_composite(db, file_size=4096)
        await db.commit()
        resp = await client.get(f"/api/goes/composites/{comp.id}")
        data = resp.json()
        for field in ("id", "name", "recipe", "satellite", "sector", "status", "file_size"):
            assert field in data
        assert data["file_size"] == 4096

    async def test_get_with_error_status(self, client, db):
        comp = _make_composite(db, status="failed", error="Band data not found")
        await db.commit()
        resp = await client.get(f"/api/goes/composites/{comp.id}")
        data = resp.json()
        assert data["status"] == "failed"
        assert data["error"] == "Band data not found"
