"""Extended tests for GOES API endpoints (goes.py router)."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from app.db.models import Composite, GoesFrame


def _frame(**kw):
    defaults = dict(
        id=str(uuid.uuid4()),
        satellite="GOES-16",
        sector="CONUS",
        band="C02",
        capture_time=datetime(2024, 6, 1, 12, 0, tzinfo=UTC),
        file_path="/tmp/test.nc",
        file_size=1024,
    )
    defaults.update(kw)
    return GoesFrame(**defaults)


@pytest.mark.asyncio
class TestProducts:
    async def test_products_returns_satellites(self, client):
        resp = await client.get("/api/goes/products")
        assert resp.status_code == 200
        data = resp.json()
        assert "satellites" in data
        assert isinstance(data["satellites"], list)
        assert len(data["satellites"]) > 0

    async def test_products_returns_sectors(self, client):
        resp = await client.get("/api/goes/products")
        data = resp.json()
        assert "sectors" in data
        for s in data["sectors"]:
            assert "id" in s
            assert "name" in s
            assert "product" in s

    async def test_products_returns_bands(self, client):
        resp = await client.get("/api/goes/products")
        data = resp.json()
        assert "bands" in data
        for b in data["bands"]:
            assert "id" in b
            assert "description" in b

    async def test_products_band_count(self, client):
        resp = await client.get("/api/goes/products")
        data = resp.json()
        assert len(data["bands"]) == 16  # C01-C16


@pytest.mark.asyncio
class TestLatestFrame:
    async def test_latest_frame_not_found(self, client):
        resp = await client.get("/api/goes/latest?satellite=GOES-16&sector=CONUS&band=C02")
        assert resp.status_code == 404

    async def test_latest_frame_returns_most_recent(self, client, db):
        old = _frame(capture_time=datetime(2024, 1, 1, tzinfo=UTC))
        new = _frame(capture_time=datetime(2024, 6, 1, tzinfo=UTC))
        db.add(old)
        db.add(new)
        await db.commit()

        resp = await client.get("/api/goes/latest?satellite=GOES-16&sector=CONUS&band=C02")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == new.id

    async def test_latest_frame_filters_by_satellite(self, client, db):
        db.add(_frame(satellite="GOES-16"))
        db.add(_frame(satellite="GOES-18"))
        await db.commit()

        resp = await client.get("/api/goes/latest?satellite=GOES-18&sector=CONUS&band=C02")
        assert resp.status_code == 200
        assert resp.json()["satellite"] == "GOES-18"

    async def test_latest_frame_filters_by_band(self, client, db):
        db.add(_frame(band="C02"))
        await db.commit()

        resp = await client.get("/api/goes/latest?satellite=GOES-16&sector=CONUS&band=C13")
        assert resp.status_code == 404

    async def test_latest_frame_response_shape(self, client, db):
        f = _frame(width=5424, height=3000, thumbnail_path="/tmp/thumb.png")
        db.add(f)
        await db.commit()

        resp = await client.get("/api/goes/latest?satellite=GOES-16&sector=CONUS&band=C02")
        data = resp.json()
        assert data["width"] == 5424
        assert data["height"] == 3000
        assert data["thumbnail_path"] == "/tmp/thumb.png"

    async def test_latest_default_params(self, client, db):
        """Default params are GOES-16, CONUS, C02."""
        db.add(_frame())
        await db.commit()
        resp = await client.get("/api/goes/latest")
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestCompositeRecipes:
    async def test_list_recipes(self, client):
        resp = await client.get("/api/goes/composite-recipes")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 6
        names = {r["id"] for r in data}
        assert "true_color" in names
        assert "fire_detection" in names

    async def test_recipe_has_bands(self, client):
        resp = await client.get("/api/goes/composite-recipes")
        for recipe in resp.json():
            assert "bands" in recipe
            assert len(recipe["bands"]) >= 2


@pytest.mark.asyncio
class TestCreateComposite:
    async def test_create_composite_success(self, client, db):
        with patch("app.tasks.goes_tasks.generate_composite") as mock:
            mock.delay = lambda *a: None
            resp = await client.post("/api/goes/composites", json={
                "recipe": "true_color",
                "satellite": "GOES-16",
                "sector": "CONUS",
                "capture_time": "2024-06-01T12:00:00",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"
        assert "id" in data
        assert "job_id" in data

    async def test_create_composite_unknown_recipe(self, client):
        resp = await client.post("/api/goes/composites", json={
            "recipe": "nonexistent",
            "capture_time": "2024-06-01T12:00:00",
        })
        assert resp.status_code == 400

    async def test_create_composite_missing_capture_time(self, client):
        resp = await client.post("/api/goes/composites", json={
            "recipe": "true_color",
        })
        assert resp.status_code == 400


@pytest.mark.asyncio
class TestListComposites:
    async def test_list_composites_empty(self, client):
        resp = await client.get("/api/goes/composites")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    async def test_list_composites_pagination(self, client, db):
        for i in range(5):
            db.add(Composite(
                id=str(uuid.uuid4()),
                name=f"Comp {i}",
                recipe="true_color",
                satellite="GOES-16",
                sector="CONUS",
                capture_time=datetime(2024, 6, 1, i, tzinfo=UTC),
                status="completed",
            ))
        await db.commit()

        resp = await client.get("/api/goes/composites?page=1&limit=2")
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        assert data["page"] == 1

    async def test_list_composites_page_2(self, client, db):
        for i in range(5):
            db.add(Composite(
                id=str(uuid.uuid4()),
                name=f"Comp {i}",
                recipe="true_color",
                satellite="GOES-16",
                sector="CONUS",
                capture_time=datetime(2024, 6, 1, i, tzinfo=UTC),
                status="completed",
            ))
        await db.commit()

        resp = await client.get("/api/goes/composites?page=3&limit=2")
        data = resp.json()
        assert len(data["items"]) == 1  # 5 items, page 3 of 2 = 1 item


@pytest.mark.asyncio
class TestGetComposite:
    async def test_get_composite_not_found(self, client):
        resp = await client.get("/api/goes/composites/nonexistent")
        assert resp.status_code == 404

    async def test_get_composite_success(self, client, db):
        cid = str(uuid.uuid4())
        db.add(Composite(
            id=cid, name="Test", recipe="true_color",
            satellite="GOES-16", sector="CONUS",
            capture_time=datetime(2024, 6, 1, tzinfo=UTC),
            status="completed",
        ))
        await db.commit()

        resp = await client.get(f"/api/goes/composites/{cid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == cid
        assert resp.json()["recipe"] == "true_color"
