"""Extended tests for GOES data management endpoints."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.db.models import Collection, CollectionFrame, FrameTag, GoesFrame, Tag


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
class TestFrameFiltering:
    async def test_filter_by_band(self, client, db):
        db.add(_frame(band="C02"))
        db.add(_frame(band="C13"))
        await db.commit()

        resp = await client.get("/api/goes/frames?band=C13")
        assert resp.json()["total"] == 1
        assert resp.json()["items"][0]["band"] == "C13"

    async def test_filter_by_sector(self, client, db):
        db.add(_frame(sector="CONUS"))
        db.add(_frame(sector="FullDisk"))
        await db.commit()

        resp = await client.get("/api/goes/frames?sector=FullDisk")
        assert resp.json()["total"] == 1

    async def test_filter_by_date_range(self, client, db):
        db.add(_frame(capture_time=datetime(2024, 1, 1, tzinfo=UTC)))
        db.add(_frame(capture_time=datetime(2024, 6, 15, tzinfo=UTC)))
        db.add(_frame(capture_time=datetime(2024, 12, 1, tzinfo=UTC)))
        await db.commit()

        resp = await client.get(
            "/api/goes/frames?start_date=2024-06-01T00:00:00&end_date=2024-06-30T00:00:00"
        )
        assert resp.json()["total"] == 1

    async def test_filter_by_collection(self, client, db):
        f1 = _frame()
        f2 = _frame()
        db.add(f1)
        db.add(f2)
        db.add(Collection(id="c1", name="My Collection"))
        await db.commit()
        db.add(CollectionFrame(collection_id="c1", frame_id=f1.id))
        await db.commit()

        resp = await client.get("/api/goes/frames?collection_id=c1")
        assert resp.json()["total"] == 1
        assert resp.json()["items"][0]["id"] == f1.id

    async def test_filter_by_tag(self, client, db):
        f1 = _frame()
        f2 = _frame()
        db.add(f1)
        db.add(f2)
        db.add(Tag(id="t1", name="important", color="#ff0000"))
        await db.commit()
        db.add(FrameTag(frame_id=f1.id, tag_id="t1"))
        await db.commit()

        resp = await client.get("/api/goes/frames?tag=important")
        assert resp.json()["total"] == 1

    async def test_combined_filters(self, client, db):
        db.add(_frame(satellite="GOES-16", band="C02"))
        db.add(_frame(satellite="GOES-16", band="C13"))
        db.add(_frame(satellite="GOES-18", band="C02"))
        await db.commit()

        resp = await client.get("/api/goes/frames?satellite=GOES-16&band=C02")
        assert resp.json()["total"] == 1


@pytest.mark.asyncio
class TestFrameSorting:
    async def test_sort_by_file_size_asc(self, client, db):
        db.add(_frame(file_size=100))
        db.add(_frame(file_size=5000))
        db.add(_frame(file_size=500))
        await db.commit()

        resp = await client.get("/api/goes/frames?sort=file_size&order=asc")
        items = resp.json()["items"]
        sizes = [i["file_size"] for i in items]
        assert sizes == sorted(sizes)

    async def test_sort_by_capture_time_desc(self, client, db):
        db.add(_frame(capture_time=datetime(2024, 1, 1, tzinfo=UTC)))
        db.add(_frame(capture_time=datetime(2024, 12, 1, tzinfo=UTC)))
        await db.commit()

        resp = await client.get("/api/goes/frames?sort=capture_time&order=desc")
        items = resp.json()["items"]
        assert items[0]["capture_time"] > items[1]["capture_time"]

    async def test_sort_by_satellite(self, client, db):
        db.add(_frame(satellite="GOES-18"))
        db.add(_frame(satellite="GOES-16"))
        await db.commit()

        resp = await client.get("/api/goes/frames?sort=satellite&order=asc")
        items = resp.json()["items"]
        assert items[0]["satellite"] == "GOES-16"

    async def test_invalid_sort_field(self, client):
        resp = await client.get("/api/goes/frames?sort=invalid_field")
        assert resp.status_code == 422

    async def test_invalid_order(self, client):
        resp = await client.get("/api/goes/frames?order=sideways")
        assert resp.status_code == 422


@pytest.mark.asyncio
class TestFramePagination:
    async def test_pagination_page_1(self, client, db):
        for i in range(10):
            db.add(_frame(file_size=i * 100))
        await db.commit()

        resp = await client.get("/api/goes/frames?page=1&limit=3")
        data = resp.json()
        assert data["total"] == 10
        assert len(data["items"]) == 3
        assert data["page"] == 1
        assert data["limit"] == 3

    async def test_pagination_beyond_last_page(self, client, db):
        db.add(_frame())
        await db.commit()

        resp = await client.get("/api/goes/frames?page=100&limit=10")
        data = resp.json()
        assert data["total"] == 1
        assert len(data["items"]) == 0

    async def test_pagination_limit_max(self, client):
        resp = await client.get("/api/goes/frames?limit=201")
        assert resp.status_code == 422

    async def test_pagination_page_zero(self, client):
        resp = await client.get("/api/goes/frames?page=0")
        assert resp.status_code == 422


@pytest.mark.asyncio
class TestBulkDeleteFrames:
    async def test_bulk_delete_empty_list_rejected(self, client):
        resp = await client.request("DELETE", "/api/goes/frames", json={"ids": []})
        assert resp.status_code == 422  # min_length=1 validation

    async def test_bulk_delete_nonexistent_ids(self, client):
        resp = await client.request("DELETE", "/api/goes/frames", json={"ids": ["fake1", "fake2"]})
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 0

    async def test_bulk_delete_mixed_valid_invalid(self, client, db):
        f = _frame()
        db.add(f)
        await db.commit()

        resp = await client.request("DELETE", "/api/goes/frames", json={"ids": [f.id, "fake"]})
        assert resp.json()["deleted"] == 1


@pytest.mark.asyncio
class TestBulkTagFrames:
    async def test_bulk_tag_empty_lists_rejected(self, client):
        resp = await client.post("/api/goes/frames/tag", json={
            "frame_ids": [],
            "tag_ids": [],
        })
        assert resp.status_code == 422  # min_length=1 validation

    async def test_bulk_tag_duplicate_ignored(self, client, db):
        f = _frame()
        db.add(f)
        db.add(Tag(id="t1", name="tag1", color="#000"))
        await db.commit()
        db.add(FrameTag(frame_id=f.id, tag_id="t1"))
        await db.commit()

        resp = await client.post("/api/goes/frames/tag", json={
            "frame_ids": [f.id],
            "tag_ids": ["t1"],
        })
        assert resp.status_code == 200

    async def test_bulk_tag_multiple_frames_and_tags(self, client, db):
        f1 = _frame()
        f2 = _frame()
        db.add(f1)
        db.add(f2)
        db.add(Tag(id="t1", name="a", color="#000"))
        db.add(Tag(id="t2", name="b", color="#fff"))
        await db.commit()

        resp = await client.post("/api/goes/frames/tag", json={
            "frame_ids": [f1.id, f2.id],
            "tag_ids": ["t1", "t2"],
        })
        assert resp.status_code == 200
        assert resp.json()["tagged"] == 2


@pytest.mark.asyncio
class TestCollectionsExtended:
    async def test_update_collection_not_found(self, client):
        resp = await client.put("/api/goes/collections/nonexistent", json={"name": "X"})
        assert resp.status_code == 404

    async def test_delete_collection_not_found(self, client):
        resp = await client.delete("/api/goes/collections/nonexistent")
        assert resp.status_code == 404

    async def test_add_frames_to_nonexistent_collection(self, client):
        resp = await client.post("/api/goes/collections/fake/frames", json={"frame_ids": ["a"]})
        assert resp.status_code == 404

    async def test_add_duplicate_frame_to_collection(self, client, db):
        f = _frame()
        db.add(f)
        db.add(Collection(id="c1", name="Col"))
        await db.commit()
        db.add(CollectionFrame(collection_id="c1", frame_id=f.id))
        await db.commit()

        resp = await client.post("/api/goes/collections/c1/frames", json={
            "frame_ids": [f.id]
        })
        assert resp.status_code == 200
        assert resp.json()["added"] == 0

    async def test_remove_frames_from_collection(self, client, db):
        f = _frame()
        db.add(f)
        db.add(Collection(id="c1", name="Col"))
        await db.commit()
        db.add(CollectionFrame(collection_id="c1", frame_id=f.id))
        await db.commit()

        resp = await client.request(
            "DELETE", "/api/goes/collections/c1/frames",
            json={"frame_ids": [f.id]}
        )
        assert resp.status_code == 200

    async def test_collection_frame_count(self, client, db):
        f1 = _frame()
        f2 = _frame()
        db.add(f1)
        db.add(f2)
        db.add(Collection(id="c1", name="Col"))
        await db.commit()
        db.add(CollectionFrame(collection_id="c1", frame_id=f1.id))
        db.add(CollectionFrame(collection_id="c1", frame_id=f2.id))
        await db.commit()

        resp = await client.get("/api/goes/collections")
        data = resp.json()
        items = data.get("items", data) if isinstance(data, dict) and "items" in data else data
        assert items[0]["frame_count"] == 2

    async def test_update_collection_partial(self, client, db):
        db.add(Collection(id="c1", name="Old", description="Old desc"))
        await db.commit()

        resp = await client.put("/api/goes/collections/c1", json={"description": "New desc"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Old"
        assert resp.json()["description"] == "New desc"

    async def test_list_collections_empty(self, client):
        resp = await client.get("/api/goes/collections")
        assert resp.status_code == 200
        data = resp.json()
        items = data.get("items", data) if isinstance(data, dict) else data
        assert items == []


@pytest.mark.asyncio
class TestTagsExtended:
    async def test_delete_tag_not_found(self, client):
        resp = await client.delete("/api/goes/tags/nonexistent")
        assert resp.status_code == 404

    async def test_tags_sorted_by_name(self, client, db):
        db.add(Tag(id="t1", name="zebra", color="#000"))
        db.add(Tag(id="t2", name="alpha", color="#fff"))
        await db.commit()

        resp = await client.get("/api/goes/tags")
        data = resp.json()
        tag_list = data.get("items", data) if isinstance(data, dict) and "items" in data else data
        names = [t["name"] for t in tag_list]
        assert names == ["alpha", "zebra"]

    async def test_create_tag_default_color(self, client):
        resp = await client.post("/api/goes/tags", json={"name": "test"})
        assert resp.status_code == 200
        assert resp.json()["color"] == "#3b82f6"

    async def test_list_tags_empty(self, client):
        resp = await client.get("/api/goes/tags")
        assert resp.status_code == 200
        data = resp.json()
        items = data.get("items", data) if isinstance(data, dict) else data
        assert items == []


@pytest.mark.asyncio
class TestFrameStats:
    async def test_stats_by_satellite(self, client, db):
        db.add(_frame(satellite="GOES-16", file_size=1000))
        db.add(_frame(satellite="GOES-16", file_size=2000))
        db.add(_frame(satellite="GOES-18", file_size=3000))
        await db.commit()

        resp = await client.get("/api/goes/frames/stats")
        data = resp.json()
        assert data["by_satellite"]["GOES-16"]["count"] == 2
        assert data["by_satellite"]["GOES-16"]["size"] == 3000
        assert data["by_satellite"]["GOES-18"]["count"] == 1

    async def test_stats_by_band(self, client, db):
        db.add(_frame(band="C02", file_size=1000))
        db.add(_frame(band="C13", file_size=2000))
        await db.commit()

        resp = await client.get("/api/goes/frames/stats")
        data = resp.json()
        assert "C02" in data["by_band"]
        assert "C13" in data["by_band"]


@pytest.mark.asyncio
class TestProcessFrames:
    async def test_process_no_frames_found(self, client):
        from unittest.mock import patch
        with patch("app.tasks.processing.process_images_task") as mock:
            mock.delay = lambda *a: None
            resp = await client.post("/api/goes/frames/process", json={
                "frame_ids": ["nonexistent"],
                "params": {},
            })
        assert resp.status_code == 404

    async def test_process_frames_success(self, client, db):
        f = _frame()
        db.add(f)
        await db.commit()

        from unittest.mock import patch
        with patch("app.tasks.processing.process_images_task") as mock:
            mock.delay = lambda *a: None
            resp = await client.post("/api/goes/frames/process", json={
                "frame_ids": [f.id],
                "params": {"brightness": 1.2},
            })
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"
        assert resp.json()["frame_count"] == 1
