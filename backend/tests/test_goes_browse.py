"""Tests for GOES composite browse and management endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from app.db.models import Composite, Job
from app.utils import utcnow


@pytest_asyncio.fixture
async def db_with_composites(db):
    """Populate DB with test composites and jobs."""
    for i in range(3):
        job_id = str(uuid.uuid4())
        comp_id = str(uuid.uuid4())
        db.add(Job(id=job_id, name=f"Composite Job {i}", status="completed", job_type="composite"))
        db.add(
            Composite(
                id=comp_id,
                name="True Color",
                recipe="true_color",
                satellite="GOES-16",
                sector="CONUS",
                capture_time=datetime(2024, 3, 15, 12, 0, 0),
                status="completed",
                file_path=f"/data/composite_{i}.png" if i < 2 else None,
                file_size=1000 * (i + 1),
                job_id=job_id,
                created_at=utcnow(),
            )
        )
    await db.commit()
    return db


class TestListCompositeRecipes:
    @pytest.mark.asyncio
    async def test_returns_recipes(self, client):
        resp = await client.get("/api/satellite/composite-recipes")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 5
        names = [r["id"] for r in data]
        assert "true_color" in names
        assert "fire_detection" in names

    @pytest.mark.asyncio
    async def test_recipe_structure(self, client):
        resp = await client.get("/api/satellite/composite-recipes")
        recipe = resp.json()[0]
        assert "id" in recipe
        assert "name" in recipe
        assert "bands" in recipe
        assert isinstance(recipe["bands"], list)


class TestCreateComposite:
    @pytest.mark.asyncio
    async def test_creates_composite(self, client, db):
        with patch("app.tasks.composite_task.generate_composite") as mock_task:
            mock_task.delay = MagicMock()
            resp = await client.post(
                "/api/satellite/composites",
                json={
                    "recipe": "true_color",
                    "satellite": "GOES-16",
                    "sector": "CONUS",
                    "capture_time": "2024-03-15T12:00:00",
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"
        assert "id" in data
        assert "job_id" in data

    @pytest.mark.asyncio
    async def test_unknown_recipe_rejected(self, client, db):
        resp = await client.post(
            "/api/satellite/composites",
            json={
                "recipe": "nonexistent_recipe",
                "satellite": "GOES-16",
                "sector": "CONUS",
                "capture_time": "2024-03-15T12:00:00",
            },
        )
        assert resp.status_code == 400


class TestListComposites:
    @pytest.mark.asyncio
    async def test_returns_composites(self, client, db_with_composites):
        resp = await client.get("/api/satellite/composites")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert len(data["items"]) == 3

    @pytest.mark.asyncio
    async def test_pagination(self, client, db_with_composites):
        resp = await client.get("/api/satellite/composites", params={"page": 1, "limit": 2})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert len(data["items"]) == 2
        assert data["page"] == 1
        assert data["limit"] == 2

    @pytest.mark.asyncio
    async def test_empty_db(self, client):
        resp = await client.get("/api/satellite/composites")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    @pytest.mark.asyncio
    async def test_image_url_only_when_file_exists(self, client, db_with_composites):
        resp = await client.get("/api/satellite/composites")
        items = resp.json()["items"]
        with_path = [i for i in items if i.get("image_url")]
        without_path = [i for i in items if not i.get("image_url")]
        assert len(with_path) == 2
        assert len(without_path) == 1


class TestGetComposite:
    @pytest.mark.asyncio
    async def test_get_existing(self, client, db_with_composites, db):
        from sqlalchemy import select

        result = await db.execute(select(Composite).limit(1))
        comp = result.scalars().first()

        resp = await client.get(f"/api/satellite/composites/{comp.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == comp.id
        assert data["recipe"] == "true_color"

    @pytest.mark.asyncio
    async def test_404_nonexistent(self, client):
        resp = await client.get(f"/api/satellite/composites/{uuid.uuid4()}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_invalid_uuid(self, client):
        resp = await client.get("/api/satellite/composites/not-a-uuid")
        assert resp.status_code == 404


class TestGetCompositeImage:
    @pytest.mark.asyncio
    async def test_404_no_file_path(self, client, db):
        job_id = str(uuid.uuid4())
        comp_id = str(uuid.uuid4())
        db.add(Job(id=job_id, name="test", status="completed", job_type="composite"))
        db.add(
            Composite(
                id=comp_id,
                name="Test",
                recipe="true_color",
                satellite="GOES-16",
                sector="CONUS",
                capture_time=datetime(2024, 3, 15, 12, 0, 0),
                status="pending",
                file_path=None,
                job_id=job_id,
            )
        )
        await db.commit()

        resp = await client.get(f"/api/satellite/composites/{comp_id}/image")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_404_nonexistent_composite(self, client):
        resp = await client.get(f"/api/satellite/composites/{uuid.uuid4()}/image")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_404_file_missing_on_disk(self, client, db):
        job_id = str(uuid.uuid4())
        comp_id = str(uuid.uuid4())
        db.add(Job(id=job_id, name="test", status="completed", job_type="composite"))
        db.add(
            Composite(
                id=comp_id,
                name="Test",
                recipe="true_color",
                satellite="GOES-16",
                sector="CONUS",
                capture_time=datetime(2024, 3, 15, 12, 0, 0),
                status="completed",
                file_path="/nonexistent/path.png",
                job_id=job_id,
            )
        )
        await db.commit()

        resp = await client.get(f"/api/satellite/composites/{comp_id}/image")
        assert resp.status_code == 404
