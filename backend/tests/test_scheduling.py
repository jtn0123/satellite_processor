"""Tests for fetch presets, schedules, and cleanup rules."""

from datetime import UTC, datetime, timedelta

import pytest
from app.db.models import Collection, CollectionFrame, GoesFrame

pytestmark = pytest.mark.asyncio


# ── Fetch Presets ─────────────────────────────────────────

async def test_create_fetch_preset(client):
    resp = await client.post("/api/goes/fetch-presets", json={
        "name": "Test Preset",
        "satellite": "GOES-16",
        "sector": "FullDisk",
        "band": "C02",
        "description": "Test description",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test Preset"
    assert data["satellite"] == "GOES-16"
    assert data["id"]


async def test_list_fetch_presets(client):
    await client.post("/api/goes/fetch-presets", json={
        "name": "P1", "satellite": "GOES-16", "sector": "FullDisk", "band": "C02",
    })
    await client.post("/api/goes/fetch-presets", json={
        "name": "P2", "satellite": "GOES-18", "sector": "CONUS", "band": "C13",
    })
    resp = await client.get("/api/goes/fetch-presets")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_update_fetch_preset(client):
    resp = await client.post("/api/goes/fetch-presets", json={
        "name": "Old Name", "satellite": "GOES-16", "sector": "FullDisk", "band": "C02",
    })
    pid = resp.json()["id"]
    resp = await client.put(f"/api/goes/fetch-presets/{pid}", json={"name": "New Name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


async def test_delete_fetch_preset(client):
    resp = await client.post("/api/goes/fetch-presets", json={
        "name": "To Delete", "satellite": "GOES-16", "sector": "FullDisk", "band": "C02",
    })
    pid = resp.json()["id"]
    resp = await client.delete(f"/api/goes/fetch-presets/{pid}")
    assert resp.status_code == 200
    resp = await client.get("/api/goes/fetch-presets")
    assert len(resp.json()) == 0


async def test_delete_fetch_preset_not_found(client):
    resp = await client.delete("/api/goes/fetch-presets/nonexistent")
    assert resp.status_code == 404


async def test_run_fetch_preset(client, monkeypatch):
    # Mock the celery task
    called = {}
    class FakeTask:
        def delay(self, job_id, params):
            called["job_id"] = job_id
            called["params"] = params

    import app.tasks.goes_tasks as goes_mod
    monkeypatch.setattr(goes_mod, "fetch_goes_data", FakeTask())

    resp = await client.post("/api/goes/fetch-presets", json={
        "name": "Run Me", "satellite": "GOES-16", "sector": "FullDisk", "band": "C02",
    })
    pid = resp.json()["id"]
    resp = await client.post(f"/api/goes/fetch-presets/{pid}/run")
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"
    assert "job_id" in called


async def test_run_fetch_preset_not_found(client):
    resp = await client.post("/api/goes/fetch-presets/nonexistent/run")
    assert resp.status_code == 404


# ── Schedules ─────────────────────────────────────────────

async def test_create_schedule(client):
    p = await client.post("/api/goes/fetch-presets", json={
        "name": "SP", "satellite": "GOES-16", "sector": "FullDisk", "band": "C02",
    })
    pid = p.json()["id"]
    resp = await client.post("/api/goes/schedules", json={
        "name": "Hourly Fetch",
        "preset_id": pid,
        "interval_minutes": 60,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_active"] is False
    assert data["interval_minutes"] == 60


async def test_create_schedule_bad_preset(client):
    resp = await client.post("/api/goes/schedules", json={
        "name": "Bad", "preset_id": "nonexistent", "interval_minutes": 60,
    })
    assert resp.status_code == 404


async def test_list_schedules(client):
    p = await client.post("/api/goes/fetch-presets", json={
        "name": "SP2", "satellite": "GOES-16", "sector": "FullDisk", "band": "C02",
    })
    pid = p.json()["id"]
    await client.post("/api/goes/schedules", json={
        "name": "S1", "preset_id": pid, "interval_minutes": 60,
    })
    resp = await client.get("/api/goes/schedules")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


async def test_toggle_schedule(client):
    p = await client.post("/api/goes/fetch-presets", json={
        "name": "TP", "satellite": "GOES-16", "sector": "FullDisk", "band": "C02",
    })
    pid = p.json()["id"]
    s = await client.post("/api/goes/schedules", json={
        "name": "Toggle Me", "preset_id": pid, "interval_minutes": 60,
    })
    sid = s.json()["id"]
    assert s.json()["is_active"] is False

    resp = await client.post(f"/api/goes/schedules/{sid}/toggle")
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True
    assert resp.json()["next_run_at"] is not None

    resp = await client.post(f"/api/goes/schedules/{sid}/toggle")
    assert resp.json()["is_active"] is False
    assert resp.json()["next_run_at"] is None


async def test_update_schedule(client):
    p = await client.post("/api/goes/fetch-presets", json={
        "name": "UP", "satellite": "GOES-16", "sector": "FullDisk", "band": "C02",
    })
    pid = p.json()["id"]
    s = await client.post("/api/goes/schedules", json={
        "name": "Old", "preset_id": pid, "interval_minutes": 60,
    })
    sid = s.json()["id"]
    resp = await client.put(f"/api/goes/schedules/{sid}", json={"name": "New", "interval_minutes": 120})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New"
    assert resp.json()["interval_minutes"] == 120


async def test_delete_schedule(client):
    p = await client.post("/api/goes/fetch-presets", json={
        "name": "DP", "satellite": "GOES-16", "sector": "FullDisk", "band": "C02",
    })
    pid = p.json()["id"]
    s = await client.post("/api/goes/schedules", json={
        "name": "Del Me", "preset_id": pid, "interval_minutes": 60,
    })
    sid = s.json()["id"]
    resp = await client.delete(f"/api/goes/schedules/{sid}")
    assert resp.status_code == 200


async def test_toggle_schedule_not_found(client):
    resp = await client.post("/api/goes/schedules/nonexistent/toggle")
    assert resp.status_code == 404


# ── Cleanup Rules ─────────────────────────────────────────

async def test_create_cleanup_rule(client):
    resp = await client.post("/api/goes/cleanup-rules", json={
        "name": "Age Rule",
        "rule_type": "max_age_days",
        "value": 30,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["rule_type"] == "max_age_days"
    assert data["protect_collections"] is True
    assert data["is_active"] is True


async def test_list_cleanup_rules(client):
    await client.post("/api/goes/cleanup-rules", json={
        "name": "R1", "rule_type": "max_age_days", "value": 30,
    })
    resp = await client.get("/api/goes/cleanup-rules")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


async def test_update_cleanup_rule(client):
    r = await client.post("/api/goes/cleanup-rules", json={
        "name": "Update Me", "rule_type": "max_age_days", "value": 30,
    })
    rid = r.json()["id"]
    resp = await client.put(f"/api/goes/cleanup-rules/{rid}", json={"value": 60})
    assert resp.status_code == 200
    assert resp.json()["value"] == 60


async def test_delete_cleanup_rule(client):
    r = await client.post("/api/goes/cleanup-rules", json={
        "name": "Del Rule", "rule_type": "max_age_days", "value": 30,
    })
    rid = r.json()["id"]
    resp = await client.delete(f"/api/goes/cleanup-rules/{rid}")
    assert resp.status_code == 200


async def test_cleanup_preview_empty(client):
    resp = await client.get("/api/goes/cleanup/preview")
    assert resp.status_code == 200
    assert resp.json()["frame_count"] == 0


async def test_cleanup_preview_with_old_frames(client, db):
    """Test that cleanup preview identifies old frames."""
    # Create an age rule
    await client.post("/api/goes/cleanup-rules", json={
        "name": "Age 1d", "rule_type": "max_age_days", "value": 1,
    })
    # Create an old frame
    old_frame = GoesFrame(
        id="old-frame-1",
        satellite="GOES-16",
        sector="FullDisk",
        band="C02",
        capture_time=datetime.now(UTC) - timedelta(days=5),
        file_path="/tmp/fake.nc",
        file_size=1000,
        created_at=datetime.now(UTC) - timedelta(days=5),
    )
    db.add(old_frame)
    await db.commit()

    resp = await client.get("/api/goes/cleanup/preview")
    assert resp.status_code == 200
    assert resp.json()["frame_count"] == 1


async def test_cleanup_respects_protect_collections(client, db):
    """Frames in collections should be protected when protect_collections=True."""
    await client.post("/api/goes/cleanup-rules", json={
        "name": "Age 1d", "rule_type": "max_age_days", "value": 1,
    })

    # Create old frame in a collection
    old_frame = GoesFrame(
        id="protected-frame",
        satellite="GOES-16",
        sector="FullDisk",
        band="C02",
        capture_time=datetime.now(UTC) - timedelta(days=5),
        file_path="/tmp/fake2.nc",
        file_size=2000,
        created_at=datetime.now(UTC) - timedelta(days=5),
    )
    coll = Collection(id="coll-1", name="Protected")
    db.add(old_frame)
    db.add(coll)
    await db.commit()
    db.add(CollectionFrame(collection_id="coll-1", frame_id="protected-frame"))
    await db.commit()

    resp = await client.get("/api/goes/cleanup/preview")
    assert resp.status_code == 200
    assert resp.json()["frame_count"] == 0  # Protected!


async def test_cleanup_run(client, db):
    """Test manual cleanup run."""
    await client.post("/api/goes/cleanup-rules", json={
        "name": "Age 1d", "rule_type": "max_age_days", "value": 1,
    })
    old_frame = GoesFrame(
        id="delete-me",
        satellite="GOES-16",
        sector="FullDisk",
        band="C02",
        capture_time=datetime.now(UTC) - timedelta(days=5),
        file_path="/tmp/nonexistent_cleanup_test.nc",
        file_size=5000,
        created_at=datetime.now(UTC) - timedelta(days=5),
    )
    db.add(old_frame)
    await db.commit()

    resp = await client.post("/api/goes/cleanup/run")
    assert resp.status_code == 200
    data = resp.json()
    assert data["deleted_frames"] == 1
    assert data["freed_bytes"] == 5000


async def test_cleanup_storage_rule(client, db):
    """Test max_storage_gb rule."""
    # Rule: max 0 GB (will trigger cleanup of everything)
    await client.post("/api/goes/cleanup-rules", json={
        "name": "Storage 0", "rule_type": "max_storage_gb", "value": 0.000001,
    })
    frame = GoesFrame(
        id="storage-frame",
        satellite="GOES-16",
        sector="FullDisk",
        band="C02",
        capture_time=datetime.now(UTC),
        file_path="/tmp/storage_test.nc",
        file_size=10000,
        created_at=datetime.now(UTC),
    )
    db.add(frame)
    await db.commit()

    resp = await client.get("/api/goes/cleanup/preview")
    assert resp.json()["frame_count"] == 1
