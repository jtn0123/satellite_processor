"""Tests for animation studio endpoints (crop presets + animations)."""
from __future__ import annotations

from datetime import UTC, datetime

import pytest
from app.db.models import Animation, GoesFrame


def _make_frame(**overrides):
    import uuid
    defaults = {
        "id": str(uuid.uuid4()),
        "satellite": "GOES-16",
        "sector": "FullDisk",
        "band": "C02",
        "capture_time": datetime(2024, 3, 15, 14, 0, tzinfo=UTC),
        "file_path": "/tmp/test.nc",
        "file_size": 1024,
    }
    defaults.update(overrides)
    return GoesFrame(**defaults)


# ── Crop Presets ──────────────────────────────────────────


@pytest.mark.asyncio
class TestCropPresets:
    async def test_create_crop_preset(self, client):
        resp = await client.post("/api/goes/crop-presets", json={
            "name": "San Diego", "x": 100, "y": 200, "width": 500, "height": 400,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "San Diego"
        assert data["x"] == 100
        assert data["width"] == 500

    async def test_list_crop_presets(self, client):
        await client.post("/api/goes/crop-presets", json={
            "name": "A", "x": 0, "y": 0, "width": 100, "height": 100,
        })
        await client.post("/api/goes/crop-presets", json={
            "name": "B", "x": 10, "y": 10, "width": 200, "height": 200,
        })
        resp = await client.get("/api/goes/crop-presets")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    async def test_update_crop_preset(self, client):
        create = await client.post("/api/goes/crop-presets", json={
            "name": "Test", "x": 0, "y": 0, "width": 100, "height": 100,
        })
        pid = create.json()["id"]
        resp = await client.put(f"/api/goes/crop-presets/{pid}", json={"name": "Updated"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated"

    async def test_delete_crop_preset(self, client):
        create = await client.post("/api/goes/crop-presets", json={
            "name": "ToDelete", "x": 0, "y": 0, "width": 100, "height": 100,
        })
        pid = create.json()["id"]
        resp = await client.delete(f"/api/goes/crop-presets/{pid}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] == pid

    async def test_delete_nonexistent(self, client):
        resp = await client.delete("/api/goes/crop-presets/nonexistent")
        assert resp.status_code == 404

    async def test_duplicate_name(self, client):
        await client.post("/api/goes/crop-presets", json={
            "name": "Dupe", "x": 0, "y": 0, "width": 100, "height": 100,
        })
        resp = await client.post("/api/goes/crop-presets", json={
            "name": "Dupe", "x": 10, "y": 10, "width": 200, "height": 200,
        })
        assert resp.status_code == 409

    async def test_update_nonexistent(self, client):
        resp = await client.put("/api/goes/crop-presets/nope", json={"name": "X"})
        assert resp.status_code == 404


# ── Animations ──────────────────────────────────────────


@pytest.mark.asyncio
class TestAnimations:
    async def test_list_animations_empty(self, client):
        resp = await client.get("/api/goes/animations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    async def test_get_animation_not_found(self, client):
        resp = await client.get("/api/goes/animations/nonexistent")
        assert resp.status_code == 404

    async def test_delete_animation_not_found(self, client):
        resp = await client.delete("/api/goes/animations/nonexistent")
        assert resp.status_code == 404

    async def test_create_animation_no_frames(self, client):
        resp = await client.post("/api/goes/animations", json={
            "name": "Test Anim", "frame_ids": [],
            "fps": 10, "format": "mp4", "quality": "medium",
        })
        # Empty frame_ids should fail validation (pydantic won't allow None→empty)
        # or the endpoint returns 400
        assert resp.status_code in (400, 422)

    async def test_create_animation_with_filters_no_match(self, client):
        resp = await client.post("/api/goes/animations", json={
            "name": "Test", "satellite": "GOES-99",
            "fps": 10, "format": "mp4", "quality": "medium",
        })
        assert resp.status_code == 400

    async def test_list_animations_with_data(self, client, db):
        import uuid
        anim = Animation(
            id=str(uuid.uuid4()),
            name="Test Animation",
            status="completed",
            frame_count=10,
            fps=10,
            format="mp4",
            quality="medium",
        )
        db.add(anim)
        await db.commit()

        resp = await client.get("/api/goes/animations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["name"] == "Test Animation"

    async def test_get_animation_detail(self, client, db):
        import uuid
        aid = str(uuid.uuid4())
        anim = Animation(
            id=aid, name="Detail Test", status="completed",
            frame_count=5, fps=15, format="gif", quality="high",
        )
        db.add(anim)
        await db.commit()

        resp = await client.get(f"/api/goes/animations/{aid}")
        assert resp.status_code == 200
        assert resp.json()["fps"] == 15
        assert resp.json()["format"] == "gif"

    async def test_delete_animation(self, client, db):
        import uuid
        aid = str(uuid.uuid4())
        anim = Animation(
            id=aid, name="Delete Test", status="completed",
            frame_count=5, fps=10, format="mp4", quality="medium",
        )
        db.add(anim)
        await db.commit()

        resp = await client.delete(f"/api/goes/animations/{aid}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] == aid
