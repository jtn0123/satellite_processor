"""Extended tests for health, settings, stats, system, presets, jobs, images endpoints."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.db.models import GoesFrame, Image, Job, Preset, Tag


@pytest.mark.asyncio
class TestHealthExtended:
    async def test_basic_health(self, client):
        resp = await client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    async def test_version(self, client):
        resp = await client.get("/api/health/version")
        assert resp.status_code == 200
        data = resp.json()
        assert "version" in data
        assert "build" in data


@pytest.mark.asyncio
class TestSettingsExtended:
    async def test_get_settings(self, client):
        resp = await client.get("/api/settings")
        assert resp.status_code == 200
        data = resp.json()
        assert "default_crop" in data or "video_fps" in data

    async def test_update_settings_valid(self, client):
        resp = await client.put("/api/settings", json={
            "video_fps": 30,
            "timestamp_enabled": False,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["video_fps"] == 30
        assert data["timestamp_enabled"] is False

    async def test_update_settings_invalid_fps(self, client):
        resp = await client.put("/api/settings", json={"video_fps": 999})
        assert resp.status_code == 422

    async def test_update_settings_invalid_codec(self, client):
        resp = await client.put("/api/settings", json={"video_codec": "invalid"})
        assert resp.status_code == 422

    async def test_update_settings_invalid_false_color(self, client):
        resp = await client.put("/api/settings", json={"default_false_color": "invalid"})
        assert resp.status_code == 422

    async def test_update_settings_crop(self, client):
        resp = await client.put("/api/settings", json={
            "default_crop": {"x": 100, "y": 200, "w": 800, "h": 600},
        })
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestStatsExtended:
    async def test_stats_empty(self, client):
        resp = await client.get("/api/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_images"] == 0
        assert data["total_jobs"] == 0
        assert data["active_jobs"] == 0

    async def test_stats_with_data(self, client, db):
        db.add(Image(
            id=str(uuid.uuid4()), filename="test.png",
            original_name="test.png", file_path="/tmp/test.png",
        ))
        db.add(Job(id=str(uuid.uuid4()), status="pending"))
        db.add(Job(id=str(uuid.uuid4()), status="completed"))
        await db.commit()

        resp = await client.get("/api/stats")
        data = resp.json()
        assert data["total_images"] == 1
        assert data["total_jobs"] == 2
        assert data["active_jobs"] == 1  # pending counts as active

    async def test_stats_storage(self, client):
        resp = await client.get("/api/stats")
        storage = resp.json()["storage"]
        assert "total" in storage
        assert "used" in storage
        assert "free" in storage


@pytest.mark.asyncio
class TestSystemExtended:
    async def test_system_status(self, client):
        resp = await client.get("/api/system/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "cpu_percent" in data
        assert "memory" in data
        assert "disk" in data
        assert data["memory"]["total"] > 0


@pytest.mark.asyncio
class TestPresetsExtended:
    async def test_list_presets_empty(self, client):
        resp = await client.get("/api/presets")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_create_preset(self, client):
        resp = await client.post("/api/presets", json={
            "name": "My Preset",
            "params": {"brightness": 1.2},
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "My Preset"

    async def test_create_duplicate_preset(self, client, db):
        db.add(Preset(id=str(uuid.uuid4()), name="Dup", params={"a": 1}))
        await db.commit()

        resp = await client.post("/api/presets", json={"name": "Dup", "params": {"a": 1}})
        assert resp.status_code == 409

    async def test_rename_preset(self, client, db):
        db.add(Preset(id=str(uuid.uuid4()), name="Old", params={"a": 1}))
        await db.commit()

        resp = await client.patch("/api/presets/Old", json={"name": "New"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New"

    async def test_rename_preset_not_found(self, client):
        resp = await client.patch("/api/presets/Nonexistent", json={"name": "X"})
        assert resp.status_code == 404

    async def test_rename_preset_duplicate(self, client, db):
        db.add(Preset(id=str(uuid.uuid4()), name="A", params={"a": 1}))
        db.add(Preset(id=str(uuid.uuid4()), name="B", params={"a": 1}))
        await db.commit()

        resp = await client.patch("/api/presets/A", json={"name": "B"})
        assert resp.status_code == 409

    async def test_rename_preset_same_name(self, client, db):
        db.add(Preset(id=str(uuid.uuid4()), name="Same", params={"a": 1}))
        await db.commit()

        resp = await client.patch("/api/presets/Same", json={"name": "Same"})
        assert resp.status_code == 200

    async def test_delete_preset(self, client, db):
        db.add(Preset(id=str(uuid.uuid4()), name="Del", params={"a": 1}))
        await db.commit()

        resp = await client.delete("/api/presets/Del")
        assert resp.status_code == 200

    async def test_delete_preset_not_found(self, client):
        resp = await client.delete("/api/presets/Nonexistent")
        assert resp.status_code == 404

    async def test_list_presets_pagination(self, client, db):
        for i in range(5):
            db.add(Preset(id=str(uuid.uuid4()), name=f"P{i:02d}", params={"a": 1}))
        await db.commit()

        resp = await client.get("/api/presets?limit=2&offset=0")
        assert len(resp.json()) == 2

        resp = await client.get("/api/presets?limit=2&offset=4")
        assert len(resp.json()) == 1


@pytest.mark.asyncio
class TestJobsExtended:
    async def test_list_jobs_empty(self, client):
        resp = await client.get("/api/jobs")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    async def test_get_job_not_found(self, client):
        resp = await client.get("/api/jobs/nonexistent")
        assert resp.status_code == 404

    async def test_get_job_success(self, client, db):
        jid = str(uuid.uuid4())
        db.add(Job(id=jid, status="pending"))
        await db.commit()

        resp = await client.get(f"/api/jobs/{jid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == jid

    async def test_update_job_not_found(self, client):
        resp = await client.patch("/api/jobs/nonexistent", json={"status": "completed"})
        assert resp.status_code == 404

    async def test_update_job_status(self, client, db):
        jid = str(uuid.uuid4())
        db.add(Job(id=jid, status="pending"))
        await db.commit()

        resp = await client.patch(f"/api/jobs/{jid}", json={"status": "completed"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "completed"

    async def test_delete_job_not_found(self, client):
        resp = await client.delete("/api/jobs/nonexistent")
        assert resp.status_code == 404

    async def test_delete_job_success(self, client, db):
        jid = str(uuid.uuid4())
        db.add(Job(id=jid, status="pending"))
        await db.commit()

        resp = await client.delete(f"/api/jobs/{jid}")
        assert resp.status_code == 200

    async def test_bulk_delete_jobs_empty_rejected(self, client):
        resp = await client.request("DELETE", "/api/jobs/bulk", json={"ids": []})
        assert resp.status_code == 422  # min_length=1

    async def test_bulk_delete_jobs(self, client, db):
        j1 = str(uuid.uuid4())
        j2 = str(uuid.uuid4())
        db.add(Job(id=j1, status="pending"))
        db.add(Job(id=j2, status="completed"))
        await db.commit()

        resp = await client.request("DELETE", "/api/jobs/bulk", json={"ids": [j1, j2]})
        assert resp.json()["count"] == 2

    async def test_list_jobs_pagination(self, client, db):
        for _i in range(5):
            db.add(Job(id=str(uuid.uuid4()), status="pending"))
        await db.commit()

        resp = await client.get("/api/jobs?page=1&limit=2")
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2

    async def test_job_output_not_completed(self, client, db):
        jid = str(uuid.uuid4())
        db.add(Job(id=jid, status="pending"))
        await db.commit()

        resp = await client.get(f"/api/jobs/{jid}/output")
        assert resp.status_code == 400

    async def test_job_output_not_found(self, client):
        resp = await client.get("/api/jobs/nonexistent/output")
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestDownloadExtended:
    async def test_download_job_not_found(self, client):
        resp = await client.get("/api/jobs/nonexistent/download")
        assert resp.status_code == 404

    async def test_download_job_not_completed(self, client, db):
        jid = str(uuid.uuid4())
        db.add(Job(id=jid, status="processing"))
        await db.commit()

        resp = await client.get(f"/api/jobs/{jid}/download")
        assert resp.status_code == 400

    async def test_bulk_download_empty(self, client):
        resp = await client.post("/api/jobs/bulk-download", json={"ids": []})
        assert resp.status_code == 422  # min_length=1 validation

    async def test_bulk_download_no_completed(self, client, db):
        jid = str(uuid.uuid4())
        db.add(Job(id=jid, status="pending"))
        await db.commit()

        resp = await client.post("/api/jobs/bulk-download", json={"ids": [jid]})
        assert resp.status_code in (404, 422)  # 404 no completed or 422 validation


@pytest.mark.asyncio
class TestModels:
    """Test model relationships and constraints."""

    async def test_goesframe_tag_relationship(self, db):
        from app.db.models import FrameTag
        f = GoesFrame(
            id=str(uuid.uuid4()), satellite="GOES-16", sector="CONUS",
            band="C02", capture_time=datetime(2024, 1, 1, tzinfo=UTC),
            file_path="/tmp/t.nc", file_size=100,
        )
        t = Tag(id=str(uuid.uuid4()), name="test", color="#000")
        db.add(f)
        db.add(t)
        await db.commit()
        db.add(FrameTag(frame_id=f.id, tag_id=t.id))
        await db.commit()

        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        result = await db.execute(
            select(GoesFrame).options(selectinload(GoesFrame.tags)).where(GoesFrame.id == f.id)
        )
        frame = result.scalars().first()
        assert len(frame.tags) == 1
        assert frame.tags[0].name == "test"

    async def test_collection_frame_relationship(self, db):
        from app.db.models import Collection, CollectionFrame
        f = GoesFrame(
            id=str(uuid.uuid4()), satellite="GOES-16", sector="CONUS",
            band="C02", capture_time=datetime(2024, 1, 1, tzinfo=UTC),
            file_path="/tmp/t.nc", file_size=100,
        )
        c = Collection(id=str(uuid.uuid4()), name="Test Col")
        db.add(f)
        db.add(c)
        await db.commit()
        db.add(CollectionFrame(collection_id=c.id, frame_id=f.id))
        await db.commit()

        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        result = await db.execute(
            select(Collection).options(selectinload(Collection.frames)).where(Collection.id == c.id)
        )
        col = result.scalars().first()
        assert len(col.frames) == 1

    async def test_preset_unique_name(self, db):
        from sqlalchemy.exc import IntegrityError
        db.add(Preset(id=str(uuid.uuid4()), name="Unique", params={"a": 1}))
        await db.commit()

        db.add(Preset(id=str(uuid.uuid4()), name="Unique", params={"a": 1}))
        with pytest.raises(IntegrityError):
            await db.commit()


