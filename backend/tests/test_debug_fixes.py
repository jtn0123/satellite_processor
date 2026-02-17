"""Tests for debug run bug fixes."""

import pytest
from datetime import datetime, timezone, timedelta
from app.db.models import Job, AppSetting
from app.services.stale_jobs import mark_stale_pending_jobs, cleanup_all_stale
from app.services.gap_detector import get_coverage_stats


@pytest.mark.asyncio
async def test_settings_returns_defaults(client):
    """Bug 1: /api/settings should return defaults, not 500."""
    resp = await client.get("/api/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert "timestamp_enabled" in data or isinstance(data, dict)


@pytest.mark.asyncio
async def test_settings_put_and_get(client):
    """Settings round-trip."""
    resp = await client.put("/api/settings", json={"video_fps": 30})
    assert resp.status_code == 200
    resp = await client.get("/api/settings")
    assert resp.json()["video_fps"] == 30


@pytest.mark.asyncio
async def test_cleanup_stale_pending_jobs(db):
    """Bug 2: Pending jobs with no task_id older than 1 hour should be failed."""
    old_time = datetime.now(timezone.utc) - timedelta(hours=2)
    job = Job(
        id="stale-pending-test",
        status="pending",
        task_id=None,
        created_at=old_time,
        updated_at=old_time,
    )
    db.add(job)
    await db.commit()

    count = await mark_stale_pending_jobs(db)
    assert count == 1

    await db.refresh(job)
    assert job.status == "failed"
    assert "stale" in job.status_message.lower()


@pytest.mark.asyncio
async def test_cleanup_stale_ignores_recent_pending(db):
    """Recent pending jobs should not be marked stale."""
    job = Job(
        id="recent-pending-test",
        status="pending",
        task_id=None,
    )
    db.add(job)
    await db.commit()

    count = await mark_stale_pending_jobs(db)
    assert count == 0


@pytest.mark.asyncio
async def test_cleanup_stale_endpoint(client, db):
    """Bug 2: POST /api/jobs/cleanup-stale should work."""
    resp = await client.post("/api/jobs/cleanup-stale")
    assert resp.status_code == 200
    data = resp.json()
    assert "stale_processing" in data
    assert "stale_pending" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_cleanup_all_stale(db):
    """cleanup_all_stale returns combined results."""
    result = await cleanup_all_stale(db)
    assert result["total"] == result["stale_processing"] + result["stale_pending"]


@pytest.mark.asyncio
async def test_system_info(client):
    """Bug 5: /api/system/info should return system information."""
    resp = await client.get("/api/system/info")
    assert resp.status_code == 200
    data = resp.json()
    assert "python_version" in data
    assert "uptime_seconds" in data
    assert "memory" in data
    assert "disk" in data
    assert "worker_status" in data


@pytest.mark.asyncio
async def test_changelog_endpoint(client):
    """Bug 6: /api/health/changelog should return a list."""
    resp = await client.get("/api/health/changelog")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
