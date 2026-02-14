"""Tests for GOES data management endpoints (frames, collections, tags)."""
from __future__ import annotations

from datetime import UTC, datetime

import pytest
from app.db.models import Collection, CollectionFrame, GoesFrame, Tag


def _make_frame(**overrides):
    defaults = {
        "id": None,
        "satellite": "GOES-16",
        "sector": "FullDisk",
        "band": "C02",
        "capture_time": datetime(2024, 3, 15, 14, 0, tzinfo=UTC),
        "file_path": "/tmp/test.nc",
        "file_size": 1024,
    }
    defaults.update(overrides)
    if defaults["id"] is None:
        import uuid
        defaults["id"] = str(uuid.uuid4())
    return GoesFrame(**defaults)


@pytest.mark.asyncio
class TestFrames:
    async def test_list_frames_empty(self, client):
        resp = await client.get("/api/goes/frames")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    async def test_list_frames_with_data(self, client, db):
        frame = _make_frame()
        db.add(frame)
        await db.commit()

        resp = await client.get("/api/goes/frames")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["satellite"] == "GOES-16"

    async def test_filter_by_satellite(self, client, db):
        db.add(_make_frame(satellite="GOES-16"))
        db.add(_make_frame(satellite="GOES-18"))
        await db.commit()

        resp = await client.get("/api/goes/frames?satellite=GOES-18")
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    async def test_get_frame_detail(self, client, db):
        frame = _make_frame()
        db.add(frame)
        await db.commit()

        resp = await client.get(f"/api/goes/frames/{frame.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == frame.id

    async def test_get_frame_not_found(self, client):
        resp = await client.get("/api/goes/frames/nonexistent")
        assert resp.status_code == 404

    async def test_bulk_delete_frames(self, client, db):
        f1 = _make_frame()
        f2 = _make_frame()
        db.add(f1)
        db.add(f2)
        await db.commit()

        resp = await client.request(
            "DELETE", "/api/goes/frames", json={"ids": [f1.id, f2.id]}
        )
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 2

    async def test_frame_stats_empty(self, client):
        resp = await client.get("/api/goes/frames/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_frames"] == 0

    async def test_frame_stats_with_data(self, client, db):
        db.add(_make_frame(file_size=1000))
        db.add(_make_frame(satellite="GOES-18", file_size=2000))
        await db.commit()

        resp = await client.get("/api/goes/frames/stats")
        data = resp.json()
        assert data["total_frames"] == 2
        assert data["total_size_bytes"] == 3000


@pytest.mark.asyncio
class TestCollections:
    async def test_create_collection(self, client):
        resp = await client.post("/api/goes/collections", json={
            "name": "Test Collection",
            "description": "A test",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Test Collection"
        assert data["frame_count"] == 0

    async def test_list_collections(self, client, db):
        db.add(Collection(id="c1", name="Col1"))
        await db.commit()

        resp = await client.get("/api/goes/collections")
        assert resp.status_code == 200
        data = resp.json()
        items = data.get("items", data) if isinstance(data, dict) else data
        assert len(items) == 1

    async def test_update_collection(self, client, db):
        db.add(Collection(id="c1", name="Old"))
        await db.commit()

        resp = await client.put("/api/goes/collections/c1", json={"name": "New"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New"

    async def test_delete_collection(self, client, db):
        db.add(Collection(id="c1", name="Del"))
        await db.commit()

        resp = await client.delete("/api/goes/collections/c1")
        assert resp.status_code == 200

    async def test_add_frames_to_collection(self, client, db):
        db.add(Collection(id="c1", name="Col"))
        frame = _make_frame()
        db.add(frame)
        await db.commit()

        resp = await client.post("/api/goes/collections/c1/frames", json={
            "frame_ids": [frame.id]
        })
        assert resp.status_code == 200
        assert resp.json()["added"] == 1

    async def test_remove_frames_from_collection(self, client, db):
        frame = _make_frame()
        db.add(Collection(id="c1", name="Col"))
        db.add(frame)
        await db.commit()
        db.add(CollectionFrame(collection_id="c1", frame_id=frame.id))
        await db.commit()

        resp = await client.request(
            "DELETE", "/api/goes/collections/c1/frames", json={"frame_ids": [frame.id]}
        )
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestTags:
    async def test_create_tag(self, client):
        resp = await client.post("/api/goes/tags", json={
            "name": "favorite",
            "color": "#ff0000",
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "favorite"

    async def test_create_duplicate_tag(self, client, db):
        db.add(Tag(id="t1", name="dup", color="#000000"))
        await db.commit()

        resp = await client.post("/api/goes/tags", json={"name": "dup"})
        assert resp.status_code == 409

    async def test_list_tags(self, client, db):
        db.add(Tag(id="t1", name="a", color="#000"))
        db.add(Tag(id="t2", name="b", color="#fff"))
        await db.commit()

        resp = await client.get("/api/goes/tags")
        assert resp.status_code == 200
        data = resp.json()
        items = data.get("items", data) if isinstance(data, dict) else data
        assert len(items) == 2

    async def test_delete_tag(self, client, db):
        db.add(Tag(id="t1", name="del", color="#000"))
        await db.commit()

        resp = await client.delete("/api/goes/tags/t1")
        assert resp.status_code == 200

    async def test_bulk_tag_frames(self, client, db):
        frame = _make_frame()
        db.add(frame)
        db.add(Tag(id="t1", name="tag1", color="#000"))
        await db.commit()

        resp = await client.post("/api/goes/frames/tag", json={
            "frame_ids": [frame.id],
            "tag_ids": ["t1"],
        })
        assert resp.status_code == 200
        assert resp.json()["tagged"] == 1
