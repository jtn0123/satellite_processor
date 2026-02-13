"""Extended tests for animation studio endpoints."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from app.db.models import Animation, Collection, CollectionFrame, CropPreset, GoesFrame, Job


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
class TestCropPresetsExtended:
    async def test_create_crop_preset(self, client):
        resp = await client.post("/api/goes/crop-presets", json={
            "name": "Region A",
            "x": 100, "y": 200, "width": 500, "height": 400,
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "Region A"

    async def test_create_duplicate_crop_preset(self, client, db):
        db.add(CropPreset(id=str(uuid.uuid4()), name="Dup", x=0, y=0, width=100, height=100))
        await db.commit()

        resp = await client.post("/api/goes/crop-presets", json={
            "name": "Dup", "x": 0, "y": 0, "width": 100, "height": 100,
        })
        assert resp.status_code == 409

    async def test_list_crop_presets_empty(self, client):
        resp = await client.get("/api/goes/crop-presets")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_crop_presets_sorted_by_name(self, client, db):
        db.add(CropPreset(id=str(uuid.uuid4()), name="Zebra", x=0, y=0, width=100, height=100))
        db.add(CropPreset(id=str(uuid.uuid4()), name="Alpha", x=0, y=0, width=100, height=100))
        await db.commit()

        resp = await client.get("/api/goes/crop-presets")
        names = [p["name"] for p in resp.json()]
        assert names == ["Alpha", "Zebra"]

    async def test_update_crop_preset_not_found(self, client):
        resp = await client.put("/api/goes/crop-presets/fake", json={"name": "X"})
        assert resp.status_code == 404

    async def test_update_crop_preset_partial(self, client, db):
        cp = CropPreset(id=str(uuid.uuid4()), name="Test", x=10, y=20, width=300, height=400)
        db.add(cp)
        await db.commit()

        resp = await client.put(f"/api/goes/crop-presets/{cp.id}", json={"width": 500})
        assert resp.status_code == 200
        assert resp.json()["width"] == 500
        assert resp.json()["x"] == 10  # unchanged

    async def test_delete_crop_preset_not_found(self, client):
        resp = await client.delete("/api/goes/crop-presets/fake")
        assert resp.status_code == 404

    async def test_delete_crop_preset_success(self, client, db):
        cp = CropPreset(id=str(uuid.uuid4()), name="Del", x=0, y=0, width=100, height=100)
        db.add(cp)
        await db.commit()

        resp = await client.delete(f"/api/goes/crop-presets/{cp.id}")
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestAnimationsExtended:
    async def test_create_animation_no_frames(self, client):
        with patch("app.tasks.animation_tasks.generate_animation") as mock:
            mock.delay = lambda *a: None
            resp = await client.post("/api/goes/animations", json={
                "name": "Test Anim",
                "frame_ids": [],
                "satellite": "GOES-16",
                "band": "C99",
            })
        assert resp.status_code == 400

    async def test_create_animation_with_frame_ids(self, client, db):
        f1 = _frame()
        f2 = _frame(capture_time=datetime(2024, 6, 1, 13, tzinfo=UTC))
        db.add(f1)
        db.add(f2)
        await db.commit()

        with patch("app.tasks.animation_tasks.generate_animation") as mock:
            mock.delay = lambda *a: None
            resp = await client.post("/api/goes/animations", json={
                "name": "My Animation",
                "frame_ids": [f1.id, f2.id],
                "fps": 10,
                "format": "mp4",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "My Animation"
        assert data["frame_count"] == 2
        assert data["status"] == "pending"

    async def test_create_animation_with_filters(self, client, db):
        f = _frame(satellite="GOES-16", band="C02")
        db.add(f)
        await db.commit()

        with patch("app.tasks.animation_tasks.generate_animation") as mock:
            mock.delay = lambda *a: None
            resp = await client.post("/api/goes/animations", json={
                "name": "Filtered",
                "satellite": "GOES-16",
                "band": "C02",
            })
        assert resp.status_code == 200
        assert resp.json()["frame_count"] == 1

    async def test_create_animation_with_collection_filter(self, client, db):
        f = _frame()
        db.add(f)
        db.add(Collection(id="c1", name="Col"))
        await db.commit()
        db.add(CollectionFrame(collection_id="c1", frame_id=f.id))
        await db.commit()

        with patch("app.tasks.animation_tasks.generate_animation") as mock:
            mock.delay = lambda *a: None
            resp = await client.post("/api/goes/animations", json={
                "name": "Col Anim",
                "collection_id": "c1",
            })
        assert resp.status_code == 200
        assert resp.json()["frame_count"] == 1

    async def test_list_animations_empty(self, client):
        resp = await client.get("/api/goes/animations")
        assert resp.status_code == 200
        assert resp.json()["items"] == []
        assert resp.json()["total"] == 0

    async def test_list_animations_pagination(self, client, db):
        for i in range(5):
            db.add(Animation(
                id=str(uuid.uuid4()), name=f"Anim {i}",
                status="completed", frame_count=10, fps=10,
            ))
        await db.commit()

        resp = await client.get("/api/goes/animations?page=1&limit=2")
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2

    async def test_get_animation_not_found(self, client):
        resp = await client.get("/api/goes/animations/fake")
        assert resp.status_code == 404

    async def test_get_animation_success(self, client, db):
        aid = str(uuid.uuid4())
        db.add(Animation(id=aid, name="Test", status="completed", frame_count=5, fps=10))
        await db.commit()

        resp = await client.get(f"/api/goes/animations/{aid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == aid

    async def test_delete_animation_not_found(self, client):
        resp = await client.delete("/api/goes/animations/fake")
        assert resp.status_code == 404

    async def test_delete_animation_success(self, client, db):
        aid = str(uuid.uuid4())
        db.add(Animation(id=aid, name="Del", status="completed", frame_count=5, fps=10))
        await db.commit()

        resp = await client.delete(f"/api/goes/animations/{aid}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] == aid

    async def test_animation_response_shape(self, client, db):
        aid = str(uuid.uuid4())
        db.add(Animation(
            id=aid, name="Full", status="completed", frame_count=10,
            fps=24, format="mp4", quality="high", scale="50%",
            false_color=1, file_size=1000000, duration_seconds=30,
        ))
        await db.commit()

        resp = await client.get(f"/api/goes/animations/{aid}")
        data = resp.json()
        assert data["fps"] == 24
        assert data["format"] == "mp4"
        assert data["quality"] == "high"
        assert data["false_color"] is True
        assert data["scale"] == "50%"
        assert data["file_size"] == 1000000
        assert data["duration_seconds"] == 30
