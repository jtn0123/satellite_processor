"""Comprehensive integration tests for backend routers.

Tests real FastAPI endpoints with real SQLite DB, minimal mocking.
Only external services (Redis, Celery, S3, filesystem) are mocked.
"""

import uuid
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from app.db.models import (
    Animation,
    AnimationPreset,
    CleanupRule,
    Collection,
    CollectionFrame,
    Composite,
    CropPreset,
    FetchPreset,
    FetchSchedule,
    GoesFrame,
    Job,
    JobLog,
    Preset,
    Tag,
)

pytestmark = pytest.mark.usefixtures("mock_redis", "mock_celery")

# ── Factory helpers ──────────────────────────────────────────

def make_id():
    return str(uuid.uuid4())


def make_frame(db, **kw):
    defaults = dict(
        id=make_id(),
        satellite="GOES-16",
        sector="CONUS",
        band="C02",
        capture_time=datetime(2025, 1, 15, 12, 0, tzinfo=None),
        file_path="/data/frames/test.nc",
        file_size=1024,
        width=5424,
        height=3240,
    )
    defaults.update(kw)
    f = GoesFrame(**defaults)
    db.add(f)
    return f


def make_job(db, **kw):
    defaults = dict(
        id=make_id(),
        status="completed",
        job_type="goes_fetch",
        params={},
        progress=100,
    )
    defaults.update(kw)
    j = Job(**defaults)
    db.add(j)
    return j


def make_collection(db, **kw):
    defaults = dict(id=make_id(), name="Test Collection", description="desc")
    defaults.update(kw)
    c = Collection(**defaults)
    db.add(c)
    return c


def make_tag(db, **kw):
    defaults = dict(id=make_id(), name=f"tag-{uuid.uuid4().hex[:6]}", color="#ff0000")
    defaults.update(kw)
    t = Tag(**defaults)
    db.add(t)
    return t


def make_composite(db, **kw):
    defaults = dict(
        id=make_id(),
        name="True Color",
        recipe="true_color",
        satellite="GOES-16",
        sector="CONUS",
        capture_time=datetime(2025, 1, 15, 12, 0),
        status="completed",
    )
    defaults.update(kw)
    c = Composite(**defaults)
    db.add(c)
    return c


def make_crop_preset(db, **kw):
    defaults = dict(id=make_id(), name=f"preset-{uuid.uuid4().hex[:6]}", x=0, y=0, width=100, height=100)
    defaults.update(kw)
    p = CropPreset(**defaults)
    db.add(p)
    return p


def make_animation(db, **kw):
    defaults = dict(
        id=make_id(),
        name="Test Animation",
        status="pending",
        frame_count=10,
        fps=10,
        format="mp4",
        quality="medium",
    )
    defaults.update(kw)
    a = Animation(**defaults)
    db.add(a)
    return a


def make_fetch_preset(db, **kw):
    defaults = dict(
        id=make_id(),
        name=f"preset-{uuid.uuid4().hex[:6]}",
        satellite="GOES-16",
        sector="CONUS",
        band="C02",
        description="test",
    )
    defaults.update(kw)
    p = FetchPreset(**defaults)
    db.add(p)
    return p


def make_cleanup_rule(db, **kw):
    defaults = dict(
        id=make_id(),
        name="Test Rule",
        rule_type="max_age_days",
        value=30.0,
        protect_collections=True,
        is_active=True,
    )
    defaults.update(kw)
    r = CleanupRule(**defaults)
    db.add(r)
    return r


def make_animation_preset(db, **kw):
    defaults = dict(
        id=make_id(),
        name=f"apreset-{uuid.uuid4().hex[:6]}",
        satellite="GOES-16",
        sector="CONUS",
        band="C02",
        fps=10,
        format="mp4",
        quality="medium",
        resolution="full",
        loop_style="forward",
    )
    defaults.update(kw)
    p = AnimationPreset(**defaults)
    db.add(p)
    return p


# ════════════════════════════════════════════════════════════
# GOES Router Tests (/api/goes/...)
# ════════════════════════════════════════════════════════════


class TestGoesProducts:
    @pytest.mark.asyncio
    async def test_list_products(self, client):
        resp = await client.get("/api/goes/products")
        assert resp.status_code == 200
        data = resp.json()
        assert "satellites" in data
        assert "GOES-16" in data["satellites"]
        assert "bands" in data
        assert len(data["bands"]) == 16

    @pytest.mark.asyncio
    async def test_products_has_metadata(self, client):
        resp = await client.get("/api/goes/products")
        data = resp.json()
        assert "sectors" in data
        assert data["default_satellite"] == "GOES-19"
        band = data["bands"][0]
        assert "wavelength_um" in band


class TestGoesCompositeRecipes:
    @pytest.mark.asyncio
    async def test_list_composite_recipes(self, client):
        resp = await client.get("/api/goes/composite-recipes")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 2
        names = [r["id"] for r in data]
        assert "true_color" in names
        assert "natural_color" in names


class TestGoesFetch:
    @pytest.mark.asyncio
    async def test_fetch_goes_creates_job(self, client, db):
        with patch("app.tasks.goes_tasks.fetch_goes_data") as mock_task:
            mock_task.delay.return_value = MagicMock(id="task-123")
            resp = await client.post("/api/goes/fetch", json={
                "satellite": "GOES-16",
                "sector": "CONUS",
                "band": "C02",
                "start_time": "2024-06-01T00:00:00",
                "end_time": "2024-06-01T01:00:00",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"
        assert "job_id" in data

    @pytest.mark.asyncio
    async def test_fetch_goes_invalid_satellite(self, client):
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-99",
            "sector": "CONUS",
            "band": "C02",
            "start_time": "2024-06-01T00:00:00",
            "end_time": "2024-06-01T01:00:00",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_fetch_goes_invalid_band(self, client):
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-16",
            "sector": "CONUS",
            "band": "C99",
            "start_time": "2024-06-01T00:00:00",
            "end_time": "2024-06-01T01:00:00",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_fetch_goes_end_before_start(self, client):
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-16",
            "sector": "CONUS",
            "band": "C02",
            "start_time": "2024-06-01T02:00:00",
            "end_time": "2024-06-01T01:00:00",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_fetch_goes_range_exceeds_24h(self, client):
        resp = await client.post("/api/goes/fetch", json={
            "satellite": "GOES-16",
            "sector": "CONUS",
            "band": "C02",
            "start_time": "2024-06-01T00:00:00",
            "end_time": "2024-06-03T00:00:00",
        })
        assert resp.status_code == 422


class TestGoesFetchComposite:
    @pytest.mark.asyncio
    async def test_fetch_composite_creates_job(self, client, db):
        with patch("app.tasks.goes_tasks.fetch_composite_data") as mock_task:
            mock_task.delay.return_value = MagicMock(id="task-456")
            resp = await client.post("/api/goes/fetch-composite", json={
                "satellite": "GOES-16",
                "sector": "CONUS",
                "recipe": "true_color",
                "start_time": "2024-06-01T00:00:00",
                "end_time": "2024-06-01T01:00:00",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"

    @pytest.mark.asyncio
    async def test_fetch_composite_invalid_recipe(self, client):
        resp = await client.post("/api/goes/fetch-composite", json={
            "satellite": "GOES-16",
            "sector": "CONUS",
            "recipe": "nonexistent_recipe",
            "start_time": "2024-06-01T00:00:00",
            "end_time": "2024-06-01T01:00:00",
        })
        assert resp.status_code == 422


class TestGoesBackfill:
    @pytest.mark.asyncio
    async def test_backfill_creates_job(self, client, db):
        with patch("app.tasks.goes_tasks.backfill_gaps") as mock_task:
            mock_task.delay.return_value = MagicMock(id="task-789")
            resp = await client.post("/api/goes/backfill", json={
                "satellite": "GOES-16",
                "sector": "CONUS",
                "band": "C02",
                "expected_interval": 10.0,
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"


class TestGoesLatest:
    @pytest.mark.asyncio
    async def test_latest_returns_frame(self, client, db):
        make_frame(db, satellite="GOES-16", sector="CONUS", band="C02")
        await db.commit()

        resp = await client.get("/api/goes/latest?satellite=GOES-16&sector=CONUS&band=C02")
        assert resp.status_code == 200
        data = resp.json()
        assert data["satellite"] == "GOES-16"

    @pytest.mark.asyncio
    async def test_latest_not_found(self, client):
        resp = await client.get("/api/goes/latest?satellite=GOES-16&sector=CONUS&band=C16")
        assert resp.status_code == 404


class TestGoesBandAvailability:
    @pytest.mark.asyncio
    async def test_band_availability(self, client, db):
        make_frame(db, satellite="GOES-16", sector="CONUS", band="C02")
        make_frame(db, satellite="GOES-16", sector="CONUS", band="C02")
        make_frame(db, satellite="GOES-16", sector="CONUS", band="C13")
        await db.commit()

        resp = await client.get("/api/goes/band-availability?satellite=GOES-16&sector=CONUS")
        assert resp.status_code == 200
        data = resp.json()
        assert data["counts"]["C02"] == 2
        assert data["counts"]["C13"] == 1


class TestGoesCompositesCRUD:
    @pytest.mark.asyncio
    async def test_create_composite(self, client, db):
        with patch("app.tasks.goes_tasks.generate_composite") as mock_task:
            mock_task.delay.return_value = MagicMock(id="task-comp")
            resp = await client.post("/api/goes/composites", json={
                "recipe": "true_color",
                "satellite": "GOES-16",
                "sector": "CONUS",
                "capture_time": "2024-06-01T12:00:00",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"

    @pytest.mark.asyncio
    async def test_create_composite_invalid_recipe(self, client):
        resp = await client.post("/api/goes/composites", json={
            "recipe": "fake_recipe",
            "satellite": "GOES-16",
            "sector": "CONUS",
            "capture_time": "2024-06-01T12:00:00",
        })
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_list_composites(self, client, db):
        make_composite(db)
        make_composite(db, name="Natural Color", recipe="natural_color")
        await db.commit()

        resp = await client.get("/api/goes/composites")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2

    @pytest.mark.asyncio
    async def test_get_composite(self, client, db):
        c = make_composite(db)
        await db.commit()

        resp = await client.get(f"/api/goes/composites/{c.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == c.id

    @pytest.mark.asyncio
    async def test_get_composite_not_found(self, client):
        resp = await client.get(f"/api/goes/composites/{make_id()}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_composite_invalid_id(self, client):
        resp = await client.get("/api/goes/composites/not-a-uuid")
        assert resp.status_code == 404


class TestGoesBandSamples:
    @pytest.mark.asyncio
    async def test_band_sample_thumbnails(self, client, db):
        make_frame(db, band="C02", thumbnail_path="/data/thumb.png")
        await db.commit()
        resp = await client.get("/api/goes/preview/band-samples?satellite=GOES-16&sector=CONUS")
        assert resp.status_code == 200
        data = resp.json()
        assert "thumbnails" in data
        assert data["thumbnails"]["C02"] is not None


class TestGoesGaps:
    @pytest.mark.asyncio
    async def test_detect_gaps_empty(self, client, db):
        resp = await client.get("/api/goes/gaps?expected_interval=10")
        assert resp.status_code == 200


# ════════════════════════════════════════════════════════════
# GOES Data Router Tests (/api/goes/frames, collections, tags)
# ════════════════════════════════════════════════════════════


class TestGoesFrames:
    @pytest.mark.asyncio
    async def test_list_frames_empty(self, client):
        resp = await client.get("/api/goes/frames")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    @pytest.mark.asyncio
    async def test_list_frames_with_data(self, client, db):
        make_frame(db, satellite="GOES-16", band="C02")
        make_frame(db, satellite="GOES-18", band="C13")
        await db.commit()

        resp = await client.get("/api/goes/frames")
        assert resp.status_code == 200
        assert resp.json()["total"] == 2

    @pytest.mark.asyncio
    async def test_list_frames_filter_satellite(self, client, db):
        make_frame(db, satellite="GOES-16")
        make_frame(db, satellite="GOES-18")
        await db.commit()

        resp = await client.get("/api/goes/frames?satellite=GOES-16")
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    @pytest.mark.asyncio
    async def test_list_frames_filter_band(self, client, db):
        make_frame(db, band="C02")
        make_frame(db, band="C13")
        await db.commit()

        resp = await client.get("/api/goes/frames?band=C02")
        assert resp.json()["total"] == 1

    @pytest.mark.asyncio
    async def test_list_frames_filter_sector(self, client, db):
        make_frame(db, sector="CONUS")
        make_frame(db, sector="FullDisk")
        await db.commit()

        resp = await client.get("/api/goes/frames?sector=CONUS")
        assert resp.json()["total"] == 1

    @pytest.mark.asyncio
    async def test_list_frames_pagination(self, client, db):
        for _ in range(5):
            make_frame(db)
        await db.commit()

        resp = await client.get("/api/goes/frames?page=1&limit=2")
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2

        resp2 = await client.get("/api/goes/frames?page=3&limit=2")
        assert len(resp2.json()["items"]) == 1

    @pytest.mark.asyncio
    async def test_list_frames_sort_asc(self, client, db):
        make_frame(db, file_size=100)
        make_frame(db, file_size=500)
        await db.commit()

        resp = await client.get("/api/goes/frames?sort=file_size&order=asc")
        items = resp.json()["items"]
        assert items[0]["file_size"] <= items[1]["file_size"]

    @pytest.mark.asyncio
    async def test_list_frames_filter_date_range(self, client, db):
        make_frame(db, capture_time=datetime(2025, 1, 10))
        make_frame(db, capture_time=datetime(2025, 1, 20))
        await db.commit()

        resp = await client.get("/api/goes/frames?start_date=2025-01-15T00:00:00")
        assert resp.json()["total"] == 1

    @pytest.mark.asyncio
    async def test_get_frame(self, client, db):
        f = make_frame(db)
        await db.commit()

        resp = await client.get(f"/api/goes/frames/{f.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == f.id

    @pytest.mark.asyncio
    async def test_get_frame_not_found(self, client):
        resp = await client.get(f"/api/goes/frames/{make_id()}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_frame_invalid_uuid(self, client):
        resp = await client.get("/api/goes/frames/not-valid")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_bulk_delete_frames(self, client, db):
        f1 = make_frame(db)
        f2 = make_frame(db)
        await db.commit()

        resp = await client.request("DELETE", "/api/goes/frames", json={"ids": [f1.id, f2.id]})
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 2

    @pytest.mark.asyncio
    async def test_frame_stats(self, client, db):
        make_frame(db, satellite="GOES-16", band="C02", file_size=1000)
        make_frame(db, satellite="GOES-16", band="C13", file_size=2000)
        await db.commit()

        resp = await client.get("/api/goes/frames/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_frames"] == 2
        assert data["total_size_bytes"] == 3000


class TestGoesFrameExport:
    """Note: /api/goes/frames/export is shadowed by /api/goes/frames/{frame_id}
    due to route ordering. 'export' gets matched as frame_id and fails UUID validation.
    These tests document the current (broken) behavior.
    TODO: Fix route ordering — place /api/goes/frames/export before /{frame_id} in the router."""

    @pytest.mark.asyncio
    async def test_export_shadowed_by_frame_id_route(self, client, db):
        """The export route is unreachable due to {frame_id} route taking priority."""
        make_frame(db)
        await db.commit()
        resp = await client.get("/api/goes/frames/export?format=json")
        # This returns 404 because 'export' is treated as an invalid frame_id
        assert resp.status_code == 404


class TestGoesCollections:
    @pytest.mark.asyncio
    async def test_create_collection(self, client):
        resp = await client.post("/api/goes/collections", json={
            "name": "My Collection",
            "description": "Test description",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "My Collection"
        assert data["frame_count"] == 0

    @pytest.mark.asyncio
    async def test_list_collections(self, client, db):
        make_collection(db, name="Col A")
        make_collection(db, name="Col B")
        await db.commit()

        resp = await client.get("/api/goes/collections")
        assert resp.status_code == 200
        assert resp.json()["total"] == 2

    @pytest.mark.asyncio
    async def test_update_collection(self, client, db):
        c = make_collection(db)
        await db.commit()

        resp = await client.put(f"/api/goes/collections/{c.id}", json={"name": "Updated"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated"

    @pytest.mark.asyncio
    async def test_update_collection_not_found(self, client):
        resp = await client.put(f"/api/goes/collections/{make_id()}", json={"name": "X"})
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_collection(self, client, db):
        c = make_collection(db)
        await db.commit()

        resp = await client.delete(f"/api/goes/collections/{c.id}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] == c.id

    @pytest.mark.asyncio
    async def test_delete_collection_not_found(self, client):
        resp = await client.delete(f"/api/goes/collections/{make_id()}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_add_frames_to_collection(self, client, db):
        c = make_collection(db)
        f = make_frame(db)
        await db.commit()

        resp = await client.post(f"/api/goes/collections/{c.id}/frames", json={"frame_ids": [f.id]})
        assert resp.status_code == 200
        assert resp.json()["added"] == 1

    @pytest.mark.asyncio
    async def test_add_frames_collection_not_found(self, client, db):
        f = make_frame(db)
        await db.commit()

        resp = await client.post(f"/api/goes/collections/{make_id()}/frames", json={"frame_ids": [f.id]})
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_list_collection_frames(self, client, db):
        c = make_collection(db)
        f = make_frame(db)
        await db.commit()
        db.add(CollectionFrame(collection_id=c.id, frame_id=f.id))
        await db.commit()

        resp = await client.get(f"/api/goes/collections/{c.id}/frames")
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    @pytest.mark.asyncio
    async def test_list_collection_frames_not_found(self, client):
        resp = await client.get(f"/api/goes/collections/{make_id()}/frames")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_remove_frames_from_collection(self, client, db):
        c = make_collection(db)
        f = make_frame(db)
        await db.commit()
        db.add(CollectionFrame(collection_id=c.id, frame_id=f.id))
        await db.commit()

        resp = await client.request("DELETE", f"/api/goes/collections/{c.id}/frames", json={"frame_ids": [f.id]})
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_export_collection_json(self, client, db):
        c = make_collection(db)
        f = make_frame(db)
        await db.commit()
        db.add(CollectionFrame(collection_id=c.id, frame_id=f.id))
        await db.commit()

        resp = await client.get(f"/api/goes/collections/{c.id}/export?format=json")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_export_collection_csv(self, client, db):
        c = make_collection(db)
        await db.commit()

        resp = await client.get(f"/api/goes/collections/{c.id}/export?format=csv")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_export_collection_not_found(self, client):
        resp = await client.get(f"/api/goes/collections/{make_id()}/export")
        assert resp.status_code == 404


class TestGoesTags:
    @pytest.mark.asyncio
    async def test_create_tag(self, client):
        resp = await client.post("/api/goes/tags", json={"name": "hurricane", "color": "#ff0000"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "hurricane"

    @pytest.mark.asyncio
    async def test_create_duplicate_tag(self, client, db):
        make_tag(db, name="dupe")
        await db.commit()

        resp = await client.post("/api/goes/tags", json={"name": "dupe"})
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_list_tags(self, client, db):
        make_tag(db, name="a-tag")
        make_tag(db, name="b-tag")
        await db.commit()

        resp = await client.get("/api/goes/tags")
        assert resp.status_code == 200
        assert resp.json()["total"] == 2

    @pytest.mark.asyncio
    async def test_delete_tag(self, client, db):
        t = make_tag(db)
        await db.commit()

        resp = await client.delete(f"/api/goes/tags/{t.id}")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_delete_tag_not_found(self, client):
        resp = await client.delete(f"/api/goes/tags/{make_id()}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_bulk_tag_frames(self, client, db):
        f = make_frame(db)
        t = make_tag(db)
        await db.commit()

        resp = await client.post("/api/goes/frames/tag", json={
            "frame_ids": [f.id],
            "tag_ids": [t.id],
        })
        assert resp.status_code == 200
        assert resp.json()["tagged"] == 1


class TestDashboardStats:
    @pytest.mark.asyncio
    async def test_dashboard_stats(self, client, db):
        make_frame(db)
        make_job(db, job_type="goes_fetch", status="completed")
        await db.commit()

        resp = await client.get("/api/goes/dashboard-stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_frames"] == 1

    @pytest.mark.asyncio
    async def test_quick_fetch_options(self, client):
        resp = await client.get("/api/goes/quick-fetch-options")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 4
        assert data[0]["label"] == "Last Hour"


class TestGoesProcessFrames:
    @pytest.mark.asyncio
    async def test_process_frames(self, client, db):
        f = make_frame(db)
        await db.commit()

        with patch("app.tasks.processing.process_images_task") as mock_task:
            mock_task.delay.return_value = MagicMock(id="ptask")
            resp = await client.post("/api/goes/frames/process", json={
                "frame_ids": [f.id],
                "params": {},
            })
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"

    @pytest.mark.asyncio
    async def test_process_frames_not_found(self, client):
        resp = await client.post("/api/goes/frames/process", json={
            "frame_ids": [make_id()],
            "params": {},
        })
        assert resp.status_code == 404


# ════════════════════════════════════════════════════════════
# Jobs Router Tests (/api/jobs/...)
# ════════════════════════════════════════════════════════════


class TestJobs:
    @pytest.mark.asyncio
    async def test_list_jobs_empty(self, client):
        resp = await client.get("/api/jobs")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_list_jobs_pagination(self, client, db):
        for _ in range(5):
            make_job(db)
        await db.commit()

        resp = await client.get("/api/jobs?page=1&limit=2")
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2

    @pytest.mark.asyncio
    async def test_get_job(self, client, db):
        j = make_job(db)
        await db.commit()

        resp = await client.get(f"/api/jobs/{j.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == j.id

    @pytest.mark.asyncio
    async def test_get_job_not_found(self, client):
        resp = await client.get(f"/api/jobs/{make_id()}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_job_invalid_uuid(self, client):
        resp = await client.get("/api/jobs/bad-id")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_update_job(self, client, db):
        j = make_job(db, status="pending")
        await db.commit()

        resp = await client.patch(f"/api/jobs/{j.id}", json={"status": "processing", "progress": 50})
        assert resp.status_code == 200
        assert resp.json()["status"] == "processing"
        assert resp.json()["progress"] == 50

    @pytest.mark.asyncio
    async def test_update_job_not_found(self, client):
        resp = await client.patch(f"/api/jobs/{make_id()}", json={"status": "failed"})
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cancel_job(self, client, db):
        j = make_job(db, status="processing", task_id="celery-task-1")
        await db.commit()

        resp = await client.post(f"/api/jobs/{j.id}/cancel")
        assert resp.status_code == 200
        assert resp.json()["cancelled"] is True

    @pytest.mark.asyncio
    async def test_cancel_completed_job(self, client, db):
        j = make_job(db, status="completed")
        await db.commit()

        resp = await client.post(f"/api/jobs/{j.id}/cancel")
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_cancel_job_not_found(self, client):
        resp = await client.post(f"/api/jobs/{make_id()}/cancel")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_job(self, client, db):
        j = make_job(db)
        await db.commit()

        resp = await client.delete(f"/api/jobs/{j.id}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True

    @pytest.mark.asyncio
    async def test_delete_job_not_found(self, client):
        resp = await client.delete(f"/api/jobs/{make_id()}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_bulk_delete_jobs(self, client, db):
        j1 = make_job(db)
        j2 = make_job(db)
        await db.commit()

        resp = await client.request("DELETE", "/api/jobs/bulk", json={"job_ids": [j1.id, j2.id]})
        assert resp.status_code == 200
        assert resp.json()["count"] == 2

    @pytest.mark.asyncio
    async def test_bulk_delete_all_jobs(self, client, db):
        make_job(db)
        make_job(db)
        await db.commit()

        resp = await client.request("DELETE", "/api/jobs/bulk?all=true", json={"job_ids": []})
        assert resp.status_code == 200
        assert resp.json()["count"] == 2

    @pytest.mark.asyncio
    async def test_bulk_delete_empty(self, client):
        resp = await client.request("DELETE", "/api/jobs/bulk", json={"job_ids": []})
        assert resp.status_code == 200
        assert resp.json()["count"] == 0

    @pytest.mark.asyncio
    async def test_get_job_logs(self, client, db):
        j = make_job(db)
        await db.commit()
        db.add(JobLog(job_id=j.id, level="info", message="Started"))
        db.add(JobLog(job_id=j.id, level="error", message="Something failed"))
        await db.commit()

        resp = await client.get(f"/api/jobs/{j.id}/logs")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    @pytest.mark.asyncio
    async def test_get_job_logs_filter_level(self, client, db):
        j = make_job(db)
        await db.commit()
        db.add(JobLog(job_id=j.id, level="info", message="Info"))
        db.add(JobLog(job_id=j.id, level="error", message="Error"))
        await db.commit()

        resp = await client.get(f"/api/jobs/{j.id}/logs?level=error")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    @pytest.mark.asyncio
    async def test_get_job_output_not_completed(self, client, db):
        j = make_job(db, status="processing")
        await db.commit()

        resp = await client.get(f"/api/jobs/{j.id}/output")
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_get_job_output_not_found(self, client):
        resp = await client.get(f"/api/jobs/{make_id()}/output")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cleanup_stale_jobs(self, client, db):
        make_job(db, status="processing")
        await db.commit()

        resp = await client.post("/api/jobs/cleanup-stale")
        assert resp.status_code == 200


class TestJobCreate:
    @pytest.mark.asyncio
    async def test_create_job(self, client, db):
        resp = await client.post("/api/jobs", json={
            "job_type": "image_process",
            "params": {},
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"
        assert data["job_type"] == "image_process"

    @pytest.mark.asyncio
    async def test_create_video_job(self, client, db):
        resp = await client.post("/api/jobs", json={
            "job_type": "video_create",
            "params": {},
        })
        assert resp.status_code == 200
        assert resp.json()["job_type"] == "video_create"


# ════════════════════════════════════════════════════════════
# Settings Router Tests (/api/settings)
# ════════════════════════════════════════════════════════════


class TestSettings:
    @pytest.mark.asyncio
    async def test_get_settings_defaults(self, client):
        resp = await client.get("/api/settings")
        assert resp.status_code == 200
        data = resp.json()
        assert "video_fps" in data

    @pytest.mark.asyncio
    async def test_update_settings(self, client):
        resp = await client.put("/api/settings", json={"video_fps": 30})
        assert resp.status_code == 200
        assert resp.json()["video_fps"] == 30

    @pytest.mark.asyncio
    async def test_update_settings_crop(self, client):
        resp = await client.put("/api/settings", json={
            "default_crop": {"x": 100, "y": 200, "w": 800, "h": 600},
        })
        assert resp.status_code == 200
        crop = resp.json()["default_crop"]
        assert crop["x"] == 100

    @pytest.mark.asyncio
    async def test_update_settings_invalid_fps(self, client):
        resp = await client.put("/api/settings", json={"video_fps": -1})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_settings_persistence(self, client):
        await client.put("/api/settings", json={"video_fps": 60})
        resp = await client.get("/api/settings")
        assert resp.json()["video_fps"] == 60


# ════════════════════════════════════════════════════════════
# Stats Router Tests (/api/stats)
# ════════════════════════════════════════════════════════════


class TestStats:
    @pytest.mark.asyncio
    async def test_get_stats(self, client, db):
        make_job(db, status="pending")
        make_job(db, status="completed")
        await db.commit()

        resp = await client.get("/api/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_jobs"] == 2
        assert data["active_jobs"] == 1

    @pytest.mark.asyncio
    async def test_storage_breakdown(self, client, db):
        make_frame(db, satellite="GOES-16", band="C02", file_size=5000,
                   capture_time=datetime(2025, 1, 15))
        await db.commit()

        resp = await client.get("/api/stats/storage/breakdown")
        assert resp.status_code == 200
        data = resp.json()
        assert "by_satellite" in data
        assert "by_band" in data
        assert data["total_bytes"] == 5000


# ════════════════════════════════════════════════════════════
# Scheduling Router Tests (fetch presets, schedules, cleanup)
# ════════════════════════════════════════════════════════════


class TestFetchPresets:
    @pytest.mark.asyncio
    async def test_create_fetch_preset(self, client):
        resp = await client.post("/api/goes/fetch-presets", json={
            "name": "My Preset",
            "satellite": "GOES-16",
            "sector": "CONUS",
            "band": "C02",
            "description": "Test preset",
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "My Preset"

    @pytest.mark.asyncio
    async def test_list_fetch_presets(self, client, db):
        make_fetch_preset(db)
        make_fetch_preset(db)
        await db.commit()

        resp = await client.get("/api/goes/fetch-presets")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    @pytest.mark.asyncio
    async def test_update_fetch_preset(self, client, db):
        p = make_fetch_preset(db)
        await db.commit()

        resp = await client.put(f"/api/goes/fetch-presets/{p.id}", json={"name": "Updated"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated"

    @pytest.mark.asyncio
    async def test_update_fetch_preset_not_found(self, client):
        resp = await client.put(f"/api/goes/fetch-presets/{make_id()}", json={"name": "X"})
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_fetch_preset(self, client, db):
        p = make_fetch_preset(db)
        await db.commit()

        resp = await client.delete(f"/api/goes/fetch-presets/{p.id}")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_delete_fetch_preset_not_found(self, client):
        resp = await client.delete(f"/api/goes/fetch-presets/{make_id()}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_run_fetch_preset(self, client, db):
        p = make_fetch_preset(db)
        await db.commit()

        with patch("app.tasks.goes_tasks.fetch_goes_data") as mock_task:
            mock_task.delay.return_value = MagicMock(id="t1")
            resp = await client.post(f"/api/goes/fetch-presets/{p.id}/run")
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"

    @pytest.mark.asyncio
    async def test_run_fetch_preset_not_found(self, client):
        resp = await client.post(f"/api/goes/fetch-presets/{make_id()}/run")
        assert resp.status_code == 404


class TestSchedules:
    @pytest.mark.asyncio
    async def test_create_schedule(self, client, db):
        p = make_fetch_preset(db)
        await db.commit()

        resp = await client.post("/api/goes/schedules", json={
            "name": "Hourly CONUS",
            "preset_id": p.id,
            "interval_minutes": 60,
            "is_active": True,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_active"] is True
        assert data["next_run_at"] is not None

    @pytest.mark.asyncio
    async def test_create_schedule_invalid_preset(self, client):
        resp = await client.post("/api/goes/schedules", json={
            "name": "Bad Schedule",
            "preset_id": make_id(),
            "interval_minutes": 60,
        })
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_list_schedules(self, client, db):
        p = make_fetch_preset(db)
        await db.commit()
        s = FetchSchedule(id=make_id(), name="S1", preset_id=p.id, interval_minutes=30)
        db.add(s)
        await db.commit()

        resp = await client.get("/api/goes/schedules")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    @pytest.mark.asyncio
    async def test_update_schedule(self, client, db):
        p = make_fetch_preset(db)
        await db.commit()
        s = FetchSchedule(id=make_id(), name="S1", preset_id=p.id, interval_minutes=30)
        db.add(s)
        await db.commit()

        resp = await client.put(f"/api/goes/schedules/{s.id}", json={"name": "Updated Schedule"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Schedule"

    @pytest.mark.asyncio
    async def test_update_schedule_not_found(self, client):
        resp = await client.put(f"/api/goes/schedules/{make_id()}", json={"name": "X"})
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_schedule(self, client, db):
        p = make_fetch_preset(db)
        await db.commit()
        s = FetchSchedule(id=make_id(), name="S1", preset_id=p.id, interval_minutes=30)
        db.add(s)
        await db.commit()

        resp = await client.delete(f"/api/goes/schedules/{s.id}")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_delete_schedule_not_found(self, client):
        resp = await client.delete(f"/api/goes/schedules/{make_id()}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_toggle_schedule(self, client, db):
        p = make_fetch_preset(db)
        await db.commit()
        s = FetchSchedule(id=make_id(), name="S1", preset_id=p.id, interval_minutes=30, is_active=False)
        db.add(s)
        await db.commit()

        resp = await client.post(f"/api/goes/schedules/{s.id}/toggle")
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True

    @pytest.mark.asyncio
    async def test_toggle_schedule_not_found(self, client):
        resp = await client.post(f"/api/goes/schedules/{make_id()}/toggle")
        assert resp.status_code == 404


class TestCleanupRules:
    @pytest.mark.asyncio
    async def test_create_cleanup_rule(self, client):
        resp = await client.post("/api/goes/cleanup-rules", json={
            "name": "Delete old frames",
            "rule_type": "max_age_days",
            "value": 30,
        })
        assert resp.status_code == 200
        assert resp.json()["rule_type"] == "max_age_days"

    @pytest.mark.asyncio
    async def test_create_cleanup_rule_storage(self, client):
        resp = await client.post("/api/goes/cleanup-rules", json={
            "name": "Max 10GB",
            "rule_type": "max_storage_gb",
            "value": 10.0,
        })
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_create_cleanup_rule_invalid_type(self, client):
        resp = await client.post("/api/goes/cleanup-rules", json={
            "name": "Bad",
            "rule_type": "invalid_type",
            "value": 10,
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_list_cleanup_rules(self, client, db):
        make_cleanup_rule(db)
        await db.commit()

        resp = await client.get("/api/goes/cleanup-rules")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    @pytest.mark.asyncio
    async def test_update_cleanup_rule(self, client, db):
        r = make_cleanup_rule(db)
        await db.commit()

        resp = await client.put(f"/api/goes/cleanup-rules/{r.id}", json={"value": 60})
        assert resp.status_code == 200
        assert resp.json()["value"] == 60

    @pytest.mark.asyncio
    async def test_update_cleanup_rule_not_found(self, client):
        resp = await client.put(f"/api/goes/cleanup-rules/{make_id()}", json={"value": 5})
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_cleanup_rule(self, client, db):
        r = make_cleanup_rule(db)
        await db.commit()

        resp = await client.delete(f"/api/goes/cleanup-rules/{r.id}")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_delete_cleanup_rule_not_found(self, client):
        resp = await client.delete(f"/api/goes/cleanup-rules/{make_id()}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_preview_cleanup_empty(self, client):
        resp = await client.get("/api/goes/cleanup/preview")
        assert resp.status_code == 200
        assert resp.json()["frame_count"] == 0

    @pytest.mark.asyncio
    async def test_preview_cleanup_with_rule(self, client, db):
        make_cleanup_rule(db, rule_type="max_age_days", value=1, is_active=True)
        make_frame(db, created_at=datetime(2020, 1, 1))
        await db.commit()

        resp = await client.get("/api/goes/cleanup/preview")
        assert resp.status_code == 200
        assert resp.json()["frame_count"] >= 1

    @pytest.mark.asyncio
    async def test_run_cleanup(self, client, db):
        resp = await client.post("/api/goes/cleanup/run")
        assert resp.status_code == 200
        assert resp.json()["deleted_frames"] == 0


# ════════════════════════════════════════════════════════════
# Animation Router Tests
# ════════════════════════════════════════════════════════════


class TestCropPresets:
    @pytest.mark.asyncio
    async def test_create_crop_preset(self, client):
        resp = await client.post("/api/goes/crop-presets", json={
            "name": "Northeast US",
            "x": 100, "y": 200, "width": 500, "height": 400,
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "Northeast US"

    @pytest.mark.asyncio
    async def test_create_duplicate_crop_preset(self, client, db):
        make_crop_preset(db, name="Dupe")
        await db.commit()

        resp = await client.post("/api/goes/crop-presets", json={
            "name": "Dupe", "x": 0, "y": 0, "width": 10, "height": 10,
        })
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_list_crop_presets(self, client, db):
        make_crop_preset(db)
        await db.commit()

        resp = await client.get("/api/goes/crop-presets")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    @pytest.mark.asyncio
    async def test_update_crop_preset(self, client, db):
        p = make_crop_preset(db)
        await db.commit()

        resp = await client.put(f"/api/goes/crop-presets/{p.id}", json={"width": 999})
        assert resp.status_code == 200
        assert resp.json()["width"] == 999

    @pytest.mark.asyncio
    async def test_update_crop_preset_not_found(self, client):
        resp = await client.put(f"/api/goes/crop-presets/{make_id()}", json={"width": 1})
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_crop_preset(self, client, db):
        p = make_crop_preset(db)
        await db.commit()

        resp = await client.delete(f"/api/goes/crop-presets/{p.id}")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_delete_crop_preset_not_found(self, client):
        resp = await client.delete(f"/api/goes/crop-presets/{make_id()}")
        assert resp.status_code == 404


class TestAnimations:
    @pytest.mark.asyncio
    async def test_create_animation_no_frames(self, client):
        """Creating animation with no matching frames should fail."""
        with patch("app.tasks.animation_tasks.generate_animation"):
            resp = await client.post("/api/goes/animations", json={
                "name": "Test Anim",
                "satellite": "GOES-16",
                "sector": "CONUS",
                "band": "C02",
            })
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_create_animation_with_frames(self, client, db):
        f1 = make_frame(db)
        f2 = make_frame(db)
        await db.commit()

        with patch("app.tasks.animation_tasks.generate_animation") as mock_task:
            mock_task.delay.return_value = MagicMock(id="anim-task")
            resp = await client.post("/api/goes/animations", json={
                "name": "Test Anim",
                "frame_ids": [f1.id, f2.id],
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["frame_count"] == 2

    @pytest.mark.asyncio
    async def test_list_animations(self, client, db):
        make_animation(db)
        make_animation(db)
        await db.commit()

        resp = await client.get("/api/goes/animations")
        assert resp.status_code == 200
        assert resp.json()["total"] == 2

    @pytest.mark.asyncio
    async def test_get_animation(self, client, db):
        a = make_animation(db)
        await db.commit()

        resp = await client.get(f"/api/goes/animations/{a.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == a.id

    @pytest.mark.asyncio
    async def test_get_animation_not_found(self, client):
        resp = await client.get(f"/api/goes/animations/{make_id()}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_animation(self, client, db):
        a = make_animation(db)
        await db.commit()

        resp = await client.delete(f"/api/goes/animations/{a.id}")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_delete_animation_not_found(self, client):
        resp = await client.delete(f"/api/goes/animations/{make_id()}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_create_animation_from_range_no_frames(self, client):
        with patch("app.tasks.animation_tasks.generate_animation"):
            resp = await client.post("/api/goes/animations/from-range", json={
                "satellite": "GOES-16",
                "sector": "CONUS",
                "band": "C02",
                "start_time": "2025-01-01T00:00:00",
                "end_time": "2025-01-01T01:00:00",
            })
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_create_animation_recent_no_frames(self, client):
        with patch("app.tasks.animation_tasks.generate_animation"):
            resp = await client.post("/api/goes/animations/recent", json={
                "satellite": "GOES-16",
                "sector": "CONUS",
                "band": "C02",
                "hours": 1,
            })
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_animation_batch_no_frames(self, client):
        with patch("app.tasks.animation_tasks.generate_animation"):
            resp = await client.post("/api/goes/animations/batch", json={
                "animations": [{
                    "satellite": "GOES-16",
                    "sector": "CONUS",
                    "band": "C02",
                    "start_time": "2025-01-01T00:00:00",
                    "end_time": "2025-01-01T01:00:00",
                }],
            })
        assert resp.status_code == 400


class TestFrameRangePreview:
    @pytest.mark.asyncio
    async def test_preview_empty(self, client):
        resp = await client.get(
            "/api/goes/frames/preview-range"
            "?satellite=GOES-16&sector=CONUS&band=C02"
            "&start_time=2025-01-01T00:00:00&end_time=2025-01-01T01:00:00"
        )
        assert resp.status_code == 200
        assert resp.json()["total_frames"] == 0

    @pytest.mark.asyncio
    async def test_preview_with_frames(self, client, db):
        for i in range(3):
            make_frame(db, capture_time=datetime(2025, 1, 15, 12, i * 10))
        await db.commit()

        resp = await client.get(
            "/api/goes/frames/preview-range"
            "?satellite=GOES-16&sector=CONUS&band=C02"
            "&start_time=2025-01-15T00:00:00&end_time=2025-01-16T00:00:00"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_frames"] == 3
        assert data["first"] is not None
        assert data["middle"] is not None


class TestAnimationPresets:
    @pytest.mark.asyncio
    async def test_create_animation_preset(self, client):
        resp = await client.post("/api/goes/animation-presets", json={
            "name": "My Preset",
            "satellite": "GOES-16",
            "fps": 15,
        })
        assert resp.status_code == 200
        assert resp.json()["fps"] == 15

    @pytest.mark.asyncio
    async def test_create_duplicate_animation_preset(self, client, db):
        make_animation_preset(db, name="Dupe")
        await db.commit()

        resp = await client.post("/api/goes/animation-presets", json={"name": "Dupe"})
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_list_animation_presets(self, client, db):
        make_animation_preset(db)
        await db.commit()

        resp = await client.get("/api/goes/animation-presets")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    @pytest.mark.asyncio
    async def test_get_animation_preset(self, client, db):
        p = make_animation_preset(db)
        await db.commit()

        resp = await client.get(f"/api/goes/animation-presets/{p.id}")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_get_animation_preset_not_found(self, client):
        resp = await client.get(f"/api/goes/animation-presets/{make_id()}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_update_animation_preset(self, client, db):
        p = make_animation_preset(db)
        await db.commit()

        resp = await client.put(f"/api/goes/animation-presets/{p.id}", json={"fps": 25})
        assert resp.status_code == 200
        assert resp.json()["fps"] == 25

    @pytest.mark.asyncio
    async def test_update_animation_preset_not_found(self, client):
        resp = await client.put(f"/api/goes/animation-presets/{make_id()}", json={"fps": 5})
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_animation_preset(self, client, db):
        p = make_animation_preset(db)
        await db.commit()

        resp = await client.delete(f"/api/goes/animation-presets/{p.id}")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_delete_animation_preset_not_found(self, client):
        resp = await client.delete(f"/api/goes/animation-presets/{make_id()}")
        assert resp.status_code == 404


# ════════════════════════════════════════════════════════════
# Presets Router Tests (/api/presets)
# ════════════════════════════════════════════════════════════


class TestPresets:
    @pytest.mark.asyncio
    async def test_list_presets_empty(self, client):
        resp = await client.get("/api/presets")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_create_preset(self, client):
        resp = await client.post("/api/presets", json={
            "name": "My Preset",
            "params": {"crop_x": 100},
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "My Preset"

    @pytest.mark.asyncio
    async def test_rename_preset(self, client, db):
        p = Preset(id=make_id(), name="old_name", params={})
        db.add(p)
        await db.commit()

        resp = await client.patch("/api/presets/old_name", json={"name": "new_name"})
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_rename_preset_not_found(self, client):
        resp = await client.patch("/api/presets/nonexistent", json={"name": "x"})
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_preset(self, client, db):
        p = Preset(id=make_id(), name="to_delete", params={})
        db.add(p)
        await db.commit()

        resp = await client.delete("/api/presets/to_delete")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_delete_preset_not_found(self, client):
        resp = await client.delete("/api/presets/nonexistent")
        assert resp.status_code == 404


# ════════════════════════════════════════════════════════════
# System Router Tests (/api/system)
# ════════════════════════════════════════════════════════════


class TestSystem:
    @pytest.mark.asyncio
    async def test_system_status(self, client):
        resp = await client.get("/api/system/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "cpu_percent" in data or "status" in data or "memory" in data

    @pytest.mark.asyncio
    async def test_system_info(self, client):
        resp = await client.get("/api/system/info")
        assert resp.status_code == 200


# ════════════════════════════════════════════════════════════
# Health Router Tests (/api/health)
# ════════════════════════════════════════════════════════════


class TestHealth:
    @pytest.mark.asyncio
    async def test_health_check(self, client):
        resp = await client.get("/api/health")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_health_detailed(self, client):
        resp = await client.get("/api/health/detailed")
        # May return 200 or 503 depending on services
        assert resp.status_code in (200, 503)
