"""Extended tests for cleanup rules and execution."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.db.models import CleanupRule, Collection, CollectionFrame, GoesFrame


def _make_frame(db, **overrides):
    defaults = {
        "id": str(uuid.uuid4()),
        "satellite": "GOES-16",
        "sector": "CONUS",
        "band": "C02",
        "capture_time": datetime(2024, 3, 15, 14, 0, tzinfo=UTC),
        "file_path": "/tmp/test.nc",
        "file_size": 1024,
        "created_at": datetime(2024, 3, 15, 14, 0, tzinfo=UTC),
    }
    defaults.update(overrides)
    frame = GoesFrame(**defaults)
    db.add(frame)
    return frame


def _make_rule(db, **overrides):
    defaults = {
        "id": str(uuid.uuid4()),
        "name": "Test Rule",
        "rule_type": "max_age_days",
        "value": 7,
        "protect_collections": True,
        "is_active": True,
    }
    defaults.update(overrides)
    rule = CleanupRule(**defaults)
    db.add(rule)
    return rule


@pytest.mark.asyncio
class TestCleanupRules:
    async def test_create_max_age_rule(self, client):
        resp = await client.post("/api/goes/cleanup-rules", json={
            "name": "Delete old frames",
            "rule_type": "max_age_days",
            "value": 30,
            "protect_collections": True,
            "is_active": True,
        })
        assert resp.status_code == 200
        assert resp.json()["rule_type"] == "max_age_days"

    async def test_create_max_storage_rule(self, client):
        resp = await client.post("/api/goes/cleanup-rules", json={
            "name": "Limit storage",
            "rule_type": "max_storage_gb",
            "value": 100,
        })
        assert resp.status_code == 200

    async def test_create_invalid_rule_type(self, client):
        resp = await client.post("/api/goes/cleanup-rules", json={
            "name": "Bad rule",
            "rule_type": "invalid_type",
            "value": 10,
        })
        assert resp.status_code == 422

    async def test_create_zero_value(self, client):
        resp = await client.post("/api/goes/cleanup-rules", json={
            "name": "Zero",
            "rule_type": "max_age_days",
            "value": 0,
        })
        assert resp.status_code == 422

    async def test_create_negative_value(self, client):
        resp = await client.post("/api/goes/cleanup-rules", json={
            "name": "Negative",
            "rule_type": "max_age_days",
            "value": -5,
        })
        assert resp.status_code == 422

    async def test_list_rules_empty(self, client):
        resp = await client.get("/api/goes/cleanup-rules")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_rules_with_data(self, client, db):
        _make_rule(db)
        await db.commit()
        resp = await client.get("/api/goes/cleanup-rules")
        assert len(resp.json()) == 1

    async def test_update_rule(self, client, db):
        rule = _make_rule(db)
        await db.commit()
        resp = await client.put(f"/api/goes/cleanup-rules/{rule.id}", json={
            "value": 14,
        })
        assert resp.status_code == 200
        assert resp.json()["value"] == 14

    async def test_update_nonexistent_rule(self, client):
        resp = await client.put("/api/goes/cleanup-rules/fake", json={"value": 5})
        assert resp.status_code == 404

    async def test_delete_rule(self, client, db):
        rule = _make_rule(db)
        await db.commit()
        resp = await client.delete(f"/api/goes/cleanup-rules/{rule.id}")
        assert resp.status_code == 200

    async def test_delete_nonexistent_rule(self, client):
        resp = await client.delete("/api/goes/cleanup-rules/fake")
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestCleanupPreview:
    async def test_preview_empty_db(self, client):
        resp = await client.get("/api/goes/cleanup/preview")
        assert resp.status_code == 200
        data = resp.json()
        assert data["frame_count"] == 0

    async def test_preview_no_active_rules(self, client, db):
        _make_rule(db, is_active=False)
        _make_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC))
        await db.commit()
        resp = await client.get("/api/goes/cleanup/preview")
        assert resp.json()["frame_count"] == 0

    async def test_preview_with_age_rule(self, client, db):
        _make_rule(db, rule_type="max_age_days", value=7)
        _make_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC))
        await db.commit()
        resp = await client.get("/api/goes/cleanup/preview")
        assert resp.json()["frame_count"] == 1

    async def test_preview_protects_collections(self, client, db):
        _make_rule(db, rule_type="max_age_days", value=7, protect_collections=True)
        frame = _make_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC))
        coll = Collection(id=str(uuid.uuid4()), name="Keep")
        db.add(coll)
        await db.flush()
        db.add(CollectionFrame(collection_id=coll.id, frame_id=frame.id))
        await db.commit()
        resp = await client.get("/api/goes/cleanup/preview")
        assert resp.json()["frame_count"] == 0

    async def test_preview_no_protection(self, client, db):
        _make_rule(db, rule_type="max_age_days", value=7, protect_collections=False)
        frame = _make_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC))
        coll = Collection(id=str(uuid.uuid4()), name="Keep")
        db.add(coll)
        await db.flush()
        db.add(CollectionFrame(collection_id=coll.id, frame_id=frame.id))
        await db.commit()
        resp = await client.get("/api/goes/cleanup/preview")
        assert resp.json()["frame_count"] == 1


@pytest.mark.asyncio
class TestCleanupRun:
    async def test_run_no_rules(self, client):
        resp = await client.post("/api/goes/cleanup/run")
        assert resp.status_code == 200
        assert resp.json()["deleted_frames"] == 0

    async def test_run_deletes_old_frames(self, client, db):
        _make_rule(db, rule_type="max_age_days", value=7)
        _make_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC), file_path="/tmp/nonexistent.nc")
        await db.commit()
        resp = await client.post("/api/goes/cleanup/run")
        data = resp.json()
        assert data["deleted_frames"] == 1
        assert data["freed_bytes"] == 1024

    async def test_run_keeps_recent_frames(self, client, db):
        _make_rule(db, rule_type="max_age_days", value=7)
        _make_frame(db, created_at=datetime.now(UTC))
        await db.commit()
        resp = await client.post("/api/goes/cleanup/run")
        assert resp.json()["deleted_frames"] == 0

    async def test_run_storage_rule(self, client, db):
        # Rule: max 0.000001 GB (basically 0), should delete all
        _make_rule(db, rule_type="max_storage_gb", value=0.000001)
        _make_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC), file_size=2048, file_path="/tmp/x.nc")
        await db.commit()
        resp = await client.post("/api/goes/cleanup/run")
        assert resp.json()["deleted_frames"] >= 1
