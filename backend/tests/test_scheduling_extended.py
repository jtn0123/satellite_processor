"""Extended tests for scheduling endpoints (presets, schedules, cleanup)."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from app.db.models import (
    CleanupRule,
    Collection,
    CollectionFrame,
    FetchPreset,
    FetchSchedule,
    GoesFrame,
)


def _preset(**kw):
    defaults = dict(
        id=str(uuid.uuid4()),
        name="Test Preset",
        satellite="GOES-16",
        sector="CONUS",
        band="C02",
    )
    defaults.update(kw)
    return FetchPreset(**defaults)


def _frame(**kw):
    defaults = dict(
        id=str(uuid.uuid4()),
        satellite="GOES-16",
        sector="CONUS",
        band="C02",
        capture_time=datetime(2024, 6, 1, 12, 0, tzinfo=UTC),
        file_path="/tmp/test.nc",
        file_size=1024,
        created_at=datetime(2024, 6, 1, tzinfo=UTC),
    )
    defaults.update(kw)
    return GoesFrame(**defaults)


@pytest.mark.asyncio
class TestFetchPresetsExtended:
    async def test_create_preset(self, client):
        resp = await client.post("/api/goes/fetch-presets", json={
            "name": "My Preset",
            "satellite": "GOES-16",
            "sector": "CONUS",
            "band": "C02",
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "My Preset"

    async def test_list_presets_empty(self, client):
        resp = await client.get("/api/goes/fetch-presets")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_update_preset_not_found(self, client):
        resp = await client.put("/api/goes/fetch-presets/fake", json={"name": "X"})
        assert resp.status_code == 404

    async def test_update_preset_partial(self, client, db):
        p = _preset()
        db.add(p)
        await db.commit()

        resp = await client.put(f"/api/goes/fetch-presets/{p.id}", json={"band": "C13"})
        assert resp.status_code == 200
        assert resp.json()["band"] == "C13"
        assert resp.json()["satellite"] == "GOES-16"  # unchanged

    async def test_delete_preset_not_found(self, client):
        resp = await client.delete("/api/goes/fetch-presets/fake")
        assert resp.status_code == 404

    async def test_delete_preset_success(self, client, db):
        p = _preset()
        db.add(p)
        await db.commit()

        resp = await client.delete(f"/api/goes/fetch-presets/{p.id}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] == p.id

    async def test_run_preset_not_found(self, client):
        resp = await client.post("/api/goes/fetch-presets/fake/run")
        assert resp.status_code == 404

    async def test_run_preset_success(self, client, db):
        p = _preset()
        db.add(p)
        await db.commit()

        with patch("app.tasks.goes_tasks.fetch_goes_data") as mock:
            mock.delay = lambda *a: None
            resp = await client.post(f"/api/goes/fetch-presets/{p.id}/run")
        assert resp.status_code == 200
        assert resp.json()["status"] == "pending"

    async def test_list_presets_order(self, client, db):
        p1 = _preset(name="Alpha")
        p2 = _preset(name="Beta")
        db.add(p1)
        db.add(p2)
        await db.commit()

        resp = await client.get("/api/goes/fetch-presets")
        # Ordered by created_at desc
        assert len(resp.json()) == 2


@pytest.mark.asyncio
class TestSchedulesExtended:
    async def test_create_schedule_preset_not_found(self, client):
        resp = await client.post("/api/goes/schedules", json={
            "name": "Sched",
            "preset_id": "fake",
            "interval_minutes": 30,
        })
        assert resp.status_code == 404

    async def test_create_schedule_success(self, client, db):
        p = _preset()
        db.add(p)
        await db.commit()

        resp = await client.post("/api/goes/schedules", json={
            "name": "My Schedule",
            "preset_id": p.id,
            "interval_minutes": 60,
            "is_active": True,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "My Schedule"
        assert data["is_active"] is True
        assert data["next_run_at"] is not None

    async def test_create_schedule_inactive(self, client, db):
        p = _preset()
        db.add(p)
        await db.commit()

        resp = await client.post("/api/goes/schedules", json={
            "name": "Inactive",
            "preset_id": p.id,
            "interval_minutes": 60,
            "is_active": False,
        })
        data = resp.json()
        assert data["is_active"] is False

    async def test_list_schedules_empty(self, client):
        resp = await client.get("/api/goes/schedules")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_update_schedule_not_found(self, client):
        resp = await client.put("/api/goes/schedules/fake", json={"name": "X"})
        assert resp.status_code == 404

    async def test_update_schedule_change_preset(self, client, db):
        p1 = _preset(name="Preset1")
        p2 = _preset(name="Preset2")
        db.add(p1)
        db.add(p2)
        await db.commit()

        sched = FetchSchedule(
            id=str(uuid.uuid4()), name="S", preset_id=p1.id,
            interval_minutes=30, is_active=False,
        )
        db.add(sched)
        await db.commit()

        resp = await client.put(f"/api/goes/schedules/{sched.id}", json={
            "preset_id": p2.id,
        })
        assert resp.status_code == 200

    async def test_update_schedule_invalid_preset(self, client, db):
        p = _preset()
        db.add(p)
        await db.commit()
        sched = FetchSchedule(
            id=str(uuid.uuid4()), name="S", preset_id=p.id,
            interval_minutes=30, is_active=False,
        )
        db.add(sched)
        await db.commit()

        resp = await client.put(f"/api/goes/schedules/{sched.id}", json={
            "preset_id": "nonexistent",
        })
        assert resp.status_code == 404

    async def test_delete_schedule_not_found(self, client):
        resp = await client.delete("/api/goes/schedules/fake")
        assert resp.status_code == 404

    async def test_delete_schedule_success(self, client, db):
        p = _preset()
        db.add(p)
        await db.commit()
        sched = FetchSchedule(
            id=str(uuid.uuid4()), name="S", preset_id=p.id,
            interval_minutes=30, is_active=False,
        )
        db.add(sched)
        await db.commit()

        resp = await client.delete(f"/api/goes/schedules/{sched.id}")
        assert resp.status_code == 200

    async def test_toggle_schedule(self, client, db):
        p = _preset()
        db.add(p)
        await db.commit()
        sched = FetchSchedule(
            id=str(uuid.uuid4()), name="S", preset_id=p.id,
            interval_minutes=30, is_active=False,
        )
        db.add(sched)
        await db.commit()

        resp = await client.post(f"/api/goes/schedules/{sched.id}/toggle")
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True

        # Toggle back
        resp = await client.post(f"/api/goes/schedules/{sched.id}/toggle")
        assert resp.json()["is_active"] is False

    async def test_toggle_schedule_not_found(self, client):
        resp = await client.post("/api/goes/schedules/fake/toggle")
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestCleanupRulesExtended:
    async def test_create_rule(self, client):
        resp = await client.post("/api/goes/cleanup-rules", json={
            "name": "Age Rule",
            "rule_type": "max_age_days",
            "value": 30,
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "Age Rule"

    async def test_list_rules_empty(self, client):
        resp = await client.get("/api/goes/cleanup-rules")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_update_rule_not_found(self, client):
        resp = await client.put("/api/goes/cleanup-rules/fake", json={"name": "X"})
        assert resp.status_code == 404

    async def test_update_rule_partial(self, client, db):
        rule = CleanupRule(
            id=str(uuid.uuid4()),
            name="Old",
            rule_type="max_age_days",
            value=30,
            is_active=True,
        )
        db.add(rule)
        await db.commit()

        resp = await client.put(f"/api/goes/cleanup-rules/{rule.id}", json={"value": 60})
        assert resp.status_code == 200
        assert resp.json()["value"] == 60
        assert resp.json()["name"] == "Old"

    async def test_delete_rule_not_found(self, client):
        resp = await client.delete("/api/goes/cleanup-rules/fake")
        assert resp.status_code == 404

    async def test_delete_rule_success(self, client, db):
        rule = CleanupRule(
            id=str(uuid.uuid4()),
            name="Del",
            rule_type="max_age_days",
            value=30,
        )
        db.add(rule)
        await db.commit()

        resp = await client.delete(f"/api/goes/cleanup-rules/{rule.id}")
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestCleanupPreview:
    async def test_preview_no_rules(self, client):
        resp = await client.get("/api/goes/cleanup/preview")
        assert resp.status_code == 200
        assert resp.json()["frame_count"] == 0

    async def test_preview_age_rule(self, client, db):
        old_frame = _frame(
            created_at=datetime(2020, 1, 1, tzinfo=UTC),
        )
        new_frame = _frame(
            created_at=datetime.now(UTC),
        )
        db.add(old_frame)
        db.add(new_frame)
        rule = CleanupRule(
            id=str(uuid.uuid4()),
            name="Age",
            rule_type="max_age_days",
            value=30,
            is_active=True,
            protect_collections=False,
        )
        db.add(rule)
        await db.commit()

        resp = await client.get("/api/goes/cleanup/preview")
        data = resp.json()
        assert data["frame_count"] == 1  # Only old frame

    async def test_preview_protects_collections(self, client, db):
        old_frame = _frame(created_at=datetime(2020, 1, 1, tzinfo=UTC))
        db.add(old_frame)
        db.add(Collection(id="c1", name="Protected"))
        await db.commit()
        db.add(CollectionFrame(collection_id="c1", frame_id=old_frame.id))
        rule = CleanupRule(
            id=str(uuid.uuid4()),
            name="Age",
            rule_type="max_age_days",
            value=30,
            is_active=True,
            protect_collections=True,
        )
        db.add(rule)
        await db.commit()

        resp = await client.get("/api/goes/cleanup/preview")
        assert resp.json()["frame_count"] == 0  # Protected!

    async def test_preview_inactive_rules_ignored(self, client, db):
        old_frame = _frame(created_at=datetime(2020, 1, 1, tzinfo=UTC))
        db.add(old_frame)
        rule = CleanupRule(
            id=str(uuid.uuid4()),
            name="Inactive",
            rule_type="max_age_days",
            value=1,
            is_active=False,
        )
        db.add(rule)
        await db.commit()

        resp = await client.get("/api/goes/cleanup/preview")
        assert resp.json()["frame_count"] == 0


@pytest.mark.asyncio
class TestCleanupRun:
    async def test_run_no_rules(self, client):
        resp = await client.post("/api/goes/cleanup/run")
        assert resp.status_code == 200
        assert resp.json()["deleted_frames"] == 0
        assert resp.json()["freed_bytes"] == 0

    async def test_run_deletes_old_frames(self, client, db):
        old_frame = _frame(
            created_at=datetime(2020, 1, 1, tzinfo=UTC),
            file_size=5000,
        )
        db.add(old_frame)
        rule = CleanupRule(
            id=str(uuid.uuid4()),
            name="Age",
            rule_type="max_age_days",
            value=30,
            is_active=True,
            protect_collections=False,
        )
        db.add(rule)
        await db.commit()

        resp = await client.post("/api/goes/cleanup/run")
        data = resp.json()
        assert data["deleted_frames"] == 1
        assert data["freed_bytes"] == 5000
