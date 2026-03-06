"""Tests for Himawari frame cleanup and per-satellite disk management."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from app.db.models import CleanupRule, Collection, CollectionFrame, GoesFrame


def _make_frame(db, **overrides):
    defaults = {
        "id": str(uuid.uuid4()),
        "satellite": "Himawari-9",
        "sector": "FLDK",
        "band": "B13",
        "capture_time": datetime(2024, 3, 15, 14, 0, tzinfo=UTC),
        "file_path": "/tmp/test_himawari.png",
        "file_size": 2048,
        "created_at": datetime(2024, 3, 15, 14, 0, tzinfo=UTC),
    }
    defaults.update(overrides)
    frame = GoesFrame(**defaults)
    db.add(frame)
    return frame


def _make_goes_frame(db, **overrides):
    defaults = {
        "id": str(uuid.uuid4()),
        "satellite": "GOES-16",
        "sector": "CONUS",
        "band": "C02",
        "capture_time": datetime(2024, 3, 15, 14, 0, tzinfo=UTC),
        "file_path": "/tmp/test_goes.nc",
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
        "satellite": None,
        "protect_collections": True,
        "is_active": True,
    }
    defaults.update(overrides)
    rule = CleanupRule(**defaults)
    db.add(rule)
    return rule


@pytest.mark.asyncio
class TestHimawariCleanupRules:
    """Test that cleanup rules can target Himawari-9 specifically."""

    async def test_create_himawari_specific_rule(self, client):
        resp = await client.post("/api/satellite/cleanup-rules", json={
            "name": "Prune Himawari",
            "rule_type": "max_age_days",
            "value": 7,
            "satellite": "Himawari-9",
            "protect_collections": True,
            "is_active": True,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["satellite"] == "Himawari-9"
        assert data["rule_type"] == "max_age_days"

    async def test_create_all_satellites_rule(self, client):
        resp = await client.post("/api/satellite/cleanup-rules", json={
            "name": "Prune All",
            "rule_type": "max_age_days",
            "value": 30,
        })
        assert resp.status_code == 200
        assert resp.json()["satellite"] is None

    async def test_create_himawari_storage_rule(self, client):
        resp = await client.post("/api/satellite/cleanup-rules", json={
            "name": "Himawari Storage Limit",
            "rule_type": "max_storage_gb",
            "value": 50,
            "satellite": "Himawari-9",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["satellite"] == "Himawari-9"
        assert data["rule_type"] == "max_storage_gb"

    async def test_list_rules_shows_satellite(self, client, db):
        _make_rule(db, name="GOES Rule", satellite="GOES-16")
        _make_rule(db, name="Himawari Rule", satellite="Himawari-9")
        _make_rule(db, name="Global Rule", satellite=None)
        await db.commit()

        resp = await client.get("/api/satellite/cleanup-rules")
        assert resp.status_code == 200
        rules = resp.json()
        assert len(rules) == 3
        satellites = {r["name"]: r["satellite"] for r in rules}
        assert satellites["GOES Rule"] == "GOES-16"
        assert satellites["Himawari Rule"] == "Himawari-9"
        assert satellites["Global Rule"] is None

    async def test_update_rule_satellite(self, client, db):
        rule = _make_rule(db, satellite=None)
        await db.commit()
        resp = await client.put(f"/api/satellite/cleanup-rules/{rule.id}", json={
            "satellite": "Himawari-9",
        })
        assert resp.status_code == 200
        assert resp.json()["satellite"] == "Himawari-9"


@pytest.mark.asyncio
class TestHimawariCleanupPreview:
    """Test that cleanup preview correctly handles Himawari frames."""

    async def test_preview_global_rule_includes_himawari(self, client, db):
        """A global rule (no satellite filter) should include Himawari frames."""
        _make_rule(db, rule_type="max_age_days", value=7, satellite=None)
        _make_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC))
        _make_goes_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC))
        await db.commit()

        resp = await client.get("/api/satellite/cleanup/preview")
        assert resp.status_code == 200
        assert resp.json()["frame_count"] == 2

    async def test_preview_himawari_rule_only_targets_himawari(self, client, db):
        """A Himawari-specific rule should only match Himawari frames."""
        _make_rule(db, rule_type="max_age_days", value=7, satellite="Himawari-9")
        _make_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC))
        _make_goes_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC))
        await db.commit()

        resp = await client.get("/api/satellite/cleanup/preview")
        assert resp.status_code == 200
        assert resp.json()["frame_count"] == 1

    async def test_preview_goes_rule_excludes_himawari(self, client, db):
        """A GOES-specific rule should not touch Himawari frames."""
        _make_rule(db, rule_type="max_age_days", value=7, satellite="GOES-16")
        _make_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC))
        _make_goes_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC))
        await db.commit()

        resp = await client.get("/api/satellite/cleanup/preview")
        assert resp.status_code == 200
        assert resp.json()["frame_count"] == 1

    async def test_preview_storage_rule_scoped_to_himawari(self, client, db):
        """Storage-based rule scoped to Himawari should only count Himawari storage."""
        _make_rule(db, rule_type="max_storage_gb", value=0.000001, satellite="Himawari-9")
        _make_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC), file_size=4096)
        _make_goes_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC), file_size=4096)
        await db.commit()

        resp = await client.get("/api/satellite/cleanup/preview")
        assert resp.status_code == 200
        # Only the Himawari frame should be targeted
        assert resp.json()["frame_count"] == 1

    async def test_preview_protects_himawari_collections(self, client, db):
        """Himawari frames in collections should be protected."""
        _make_rule(db, rule_type="max_age_days", value=7, satellite="Himawari-9", protect_collections=True)
        frame = _make_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC))
        coll = Collection(id=str(uuid.uuid4()), name="Himawari Collection")
        db.add(coll)
        await db.flush()
        db.add(CollectionFrame(collection_id=coll.id, frame_id=frame.id))
        await db.commit()

        resp = await client.get("/api/satellite/cleanup/preview")
        assert resp.json()["frame_count"] == 0


@pytest.mark.asyncio
class TestHimawariCleanupRun:
    """Test that cleanup run correctly deletes Himawari frames."""

    async def test_run_deletes_old_himawari_frames(self, client, db):
        _make_rule(db, rule_type="max_age_days", value=7, satellite="Himawari-9")
        _make_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC), file_path="/tmp/nonexistent_h9.png")
        _make_goes_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC), file_path="/tmp/nonexistent_g16.nc")
        await db.commit()

        resp = await client.post("/api/satellite/cleanup/run")
        data = resp.json()
        assert data["deleted_frames"] == 1
        assert data["freed_bytes"] == 2048  # Only Himawari frame size

    async def test_run_global_rule_deletes_both(self, client, db):
        _make_rule(db, rule_type="max_age_days", value=7, satellite=None)
        _make_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC), file_path="/tmp/h9.png")
        _make_goes_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC), file_path="/tmp/g16.nc")
        await db.commit()

        resp = await client.post("/api/satellite/cleanup/run")
        data = resp.json()
        assert data["deleted_frames"] == 2

    async def test_run_keeps_recent_himawari_frames(self, client, db):
        _make_rule(db, rule_type="max_age_days", value=7, satellite="Himawari-9")
        _make_frame(db, created_at=datetime.now(UTC))
        await db.commit()

        resp = await client.post("/api/satellite/cleanup/run")
        assert resp.json()["deleted_frames"] == 0

    async def test_run_himawari_storage_rule(self, client, db):
        _make_rule(db, rule_type="max_storage_gb", value=0.000001, satellite="Himawari-9")
        _make_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC), file_size=4096, file_path="/tmp/h9.png")
        _make_goes_frame(db, created_at=datetime(2020, 1, 1, tzinfo=UTC), file_size=4096, file_path="/tmp/g16.nc")
        await db.commit()

        resp = await client.post("/api/satellite/cleanup/run")
        data = resp.json()
        # Only Himawari frame should be deleted (storage rule scoped)
        assert data["deleted_frames"] == 1
        assert data["freed_bytes"] == 4096

    async def test_run_multiple_rules_different_satellites(self, client, db):
        """Multiple satellite-specific rules should each scope correctly."""
        _make_rule(db, name="Himawari 3-day", rule_type="max_age_days", value=3, satellite="Himawari-9")
        _make_rule(db, name="GOES 30-day", rule_type="max_age_days", value=30, satellite="GOES-16")

        # Both old, but GOES rule allows 30 days
        _make_frame(db, created_at=datetime(2024, 2, 1, tzinfo=UTC), file_path="/tmp/h9.png")
        _make_goes_frame(db, created_at=datetime(2024, 2, 1, tzinfo=UTC), file_path="/tmp/g16.nc")
        await db.commit()

        resp = await client.post("/api/satellite/cleanup/run")
        data = resp.json()
        # Both are old enough to exceed both rules
        assert data["deleted_frames"] == 2


@pytest.mark.asyncio
class TestCleanupStorageStats:
    """Test the /cleanup/stats endpoint for per-satellite storage breakdown."""

    async def test_stats_empty_db(self, client):
        resp = await client.get("/api/satellite/cleanup/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_frames"] == 0
        assert data["total_size"] == 0
        assert data["satellites"] == {}

    async def test_stats_single_satellite(self, client, db):
        _make_frame(db, file_size=2048, sector="FLDK")
        _make_frame(db, file_size=1024, sector="Japan", band="B01")
        await db.commit()

        resp = await client.get("/api/satellite/cleanup/stats")
        data = resp.json()
        assert data["total_frames"] == 2
        assert data["total_size"] == 3072
        assert "Himawari-9" in data["satellites"]
        sat = data["satellites"]["Himawari-9"]
        assert sat["total_frames"] == 2
        assert sat["total_size"] == 3072
        assert "FLDK" in sat["sectors"]
        assert "Japan" in sat["sectors"]
        assert sat["sectors"]["FLDK"]["count"] == 1
        assert sat["sectors"]["Japan"]["count"] == 1

    async def test_stats_multiple_satellites(self, client, db):
        _make_frame(db, file_size=2048)
        _make_goes_frame(db, file_size=1024)
        await db.commit()

        resp = await client.get("/api/satellite/cleanup/stats")
        data = resp.json()
        assert data["total_frames"] == 2
        assert len(data["satellites"]) == 2
        assert "Himawari-9" in data["satellites"]
        assert "GOES-16" in data["satellites"]

    async def test_stats_sector_date_ranges(self, client, db):
        _make_frame(
            db,
            capture_time=datetime(2024, 3, 1, 0, 0, tzinfo=UTC),
            created_at=datetime(2024, 3, 1, 0, 0, tzinfo=UTC),
        )
        _make_frame(
            db,
            capture_time=datetime(2024, 3, 15, 0, 0, tzinfo=UTC),
            created_at=datetime(2024, 3, 15, 0, 0, tzinfo=UTC),
        )
        await db.commit()

        resp = await client.get("/api/satellite/cleanup/stats")
        data = resp.json()
        sector = data["satellites"]["Himawari-9"]["sectors"]["FLDK"]
        assert sector["oldest"] is not None
        assert sector["newest"] is not None
        assert sector["oldest"] < sector["newest"]

    async def test_stats_himawari_all_sectors(self, client, db):
        for sector in ["FLDK", "Japan", "Target"]:
            _make_frame(db, sector=sector, file_size=1000)
        await db.commit()

        resp = await client.get("/api/satellite/cleanup/stats")
        data = resp.json()
        sectors = data["satellites"]["Himawari-9"]["sectors"]
        assert len(sectors) == 3
        assert all(s in sectors for s in ["FLDK", "Japan", "Target"])
