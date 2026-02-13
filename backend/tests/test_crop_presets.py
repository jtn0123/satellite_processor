"""Tests for crop preset and animation creation edge cases."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from app.db.models import CropPreset, GoesFrame


def _make_frame(db, **overrides):
    defaults = {
        "id": str(uuid.uuid4()),
        "satellite": "GOES-16",
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
class TestCropPresets:
    async def test_create_preset(self, client):
        resp = await client.post("/api/goes/crop-presets", json={
            "name": "Northeast US",
            "x": 100, "y": 200, "width": 500, "height": 400,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Northeast US"
        assert data["x"] == 100

    async def test_create_duplicate_name(self, client, db):
        preset = CropPreset(id=str(uuid.uuid4()), name="Dupe", x=0, y=0, width=100, height=100)
        db.add(preset)
        await db.commit()
        resp = await client.post("/api/goes/crop-presets", json={
            "name": "Dupe", "x": 0, "y": 0, "width": 100, "height": 100,
        })
        assert resp.status_code == 409

    async def test_create_zero_width(self, client):
        resp = await client.post("/api/goes/crop-presets", json={
            "name": "Zero W", "x": 0, "y": 0, "width": 0, "height": 100,
        })
        assert resp.status_code == 422

    async def test_create_negative_x(self, client):
        resp = await client.post("/api/goes/crop-presets", json={
            "name": "Neg X", "x": -1, "y": 0, "width": 100, "height": 100,
        })
        assert resp.status_code == 422

    async def test_list_empty(self, client):
        resp = await client.get("/api/goes/crop-presets")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_with_data(self, client, db):
        db.add(CropPreset(id=str(uuid.uuid4()), name="A", x=0, y=0, width=100, height=100))
        db.add(CropPreset(id=str(uuid.uuid4()), name="B", x=0, y=0, width=200, height=200))
        await db.commit()
        resp = await client.get("/api/goes/crop-presets")
        assert len(resp.json()) == 2

    async def test_update_preset(self, client, db):
        p = CropPreset(id=str(uuid.uuid4()), name="Old", x=0, y=0, width=100, height=100)
        db.add(p)
        await db.commit()
        resp = await client.put(f"/api/goes/crop-presets/{p.id}", json={"name": "New"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New"

    async def test_update_nonexistent(self, client):
        resp = await client.put("/api/goes/crop-presets/fake", json={"name": "X"})
        assert resp.status_code == 404

    async def test_delete_preset(self, client, db):
        p = CropPreset(id=str(uuid.uuid4()), name="Del", x=0, y=0, width=100, height=100)
        db.add(p)
        await db.commit()
        resp = await client.delete(f"/api/goes/crop-presets/{p.id}")
        assert resp.status_code == 200

    async def test_delete_nonexistent(self, client):
        resp = await client.delete("/api/goes/crop-presets/fake")
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestAnimationCreation:
    @patch("app.tasks.animation_tasks.generate_animation.delay")
    async def test_create_with_frame_ids(self, mock_delay, client, db):
        f1 = _make_frame(db)
        f2 = _make_frame(db)
        await db.commit()
        resp = await client.post("/api/goes/animations", json={
            "name": "Test Anim",
            "frame_ids": [f1.id, f2.id],
        })
        assert resp.status_code == 200
        assert resp.json()["frame_count"] == 2

    async def test_create_empty_frame_ids(self, client):
        resp = await client.post("/api/goes/animations", json={
            "name": "Empty",
            "frame_ids": [],
        })
        # Empty list with no filter matches → 400
        assert resp.status_code == 400

    @patch("app.tasks.animation_tasks.generate_animation.delay")
    async def test_create_with_filters(self, mock_delay, client, db):
        _make_frame(db, satellite="GOES-16", band="C02")
        await db.commit()
        resp = await client.post("/api/goes/animations", json={
            "name": "Filtered",
            "satellite": "GOES-16",
            "band": "C02",
        })
        assert resp.status_code == 200

    async def test_create_no_matching_frames(self, client):
        resp = await client.post("/api/goes/animations", json={
            "name": "No Match",
            "satellite": "GOES-99",
        })
        assert resp.status_code == 400

    async def test_create_invalid_fps(self, client, db):
        f = _make_frame(db)
        await db.commit()
        resp = await client.post("/api/goes/animations", json={
            "name": "Bad FPS",
            "frame_ids": [f.id],
            "fps": 0,
        })
        assert resp.status_code == 422

    async def test_create_invalid_format(self, client, db):
        f = _make_frame(db)
        await db.commit()
        resp = await client.post("/api/goes/animations", json={
            "name": "Bad Format",
            "frame_ids": [f.id],
            "format": "avi",
        })
        assert resp.status_code == 422

    async def test_get_nonexistent_animation(self, client):
        resp = await client.get("/api/goes/animations/fake-id")
        assert resp.status_code == 404

    async def test_delete_nonexistent_animation(self, client):
        resp = await client.delete("/api/goes/animations/fake-id")
        assert resp.status_code == 404

    async def test_list_animations_empty(self, client):
        resp = await client.get("/api/goes/animations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []
