"""Comprehensive tests for job robustness features: cancel, delete with files,
bulk delete, stale job detection, and live log streaming."""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from app.db.models import GoesFrame, Job, JobLog
from app.services.stale_jobs import mark_stale_jobs
from app.utils import utcnow


def _uuid() -> str:
    return str(uuid.uuid4())


# ── Cancel endpoint ──────────────────────────────────────────────


@pytest.mark.asyncio
class TestCancelJob:
    async def test_cancel_pending_job(self, client, db):
        jid = _uuid()
        db.add(Job(id=jid, status="pending"))
        await db.commit()

        resp = await client.post(f"/api/jobs/{jid}/cancel")
        assert resp.status_code == 200
        data = resp.json()
        assert data["cancelled"] is True
        assert data["job_id"] == jid

        # Verify DB state
        from sqlalchemy import select
        result = await db.execute(select(Job).where(Job.id == jid))
        job = result.scalars().first()
        assert job.status == "cancelled"

    async def test_cancel_processing_job(self, client, db):
        jid = _uuid()
        db.add(Job(id=jid, status="processing", task_id="celery-task-123"))
        await db.commit()

        with patch("app.routers.jobs.celery_app") as mock_celery:
            resp = await client.post(f"/api/jobs/{jid}/cancel")

        assert resp.status_code == 200
        assert resp.json()["cancelled"] is True
        mock_celery.control.revoke.assert_called_once()

    async def test_cancel_completed_job_returns_400(self, client, db):
        jid = _uuid()
        db.add(Job(id=jid, status="completed"))
        await db.commit()

        resp = await client.post(f"/api/jobs/{jid}/cancel")
        assert resp.status_code == 400

    async def test_cancel_failed_job_returns_400(self, client, db):
        jid = _uuid()
        db.add(Job(id=jid, status="failed"))
        await db.commit()

        resp = await client.post(f"/api/jobs/{jid}/cancel")
        assert resp.status_code == 400

    async def test_cancel_already_cancelled_job_returns_400(self, client, db):
        jid = _uuid()
        db.add(Job(id=jid, status="cancelled"))
        await db.commit()

        resp = await client.post(f"/api/jobs/{jid}/cancel")
        assert resp.status_code == 400

    async def test_cancel_nonexistent_job_returns_404(self, client):
        resp = await client.post(f"/api/jobs/{_uuid()}/cancel")
        assert resp.status_code == 404

    async def test_cancel_invalid_uuid_returns_error(self, client):
        resp = await client.post("/api/jobs/not-a-uuid/cancel")
        assert resp.status_code in (404, 422)


# ── Delete with files ────────────────────────────────────────────


@pytest.mark.asyncio
class TestDeleteWithFiles:
    async def test_delete_job_without_files(self, client, db):
        jid = _uuid()
        db.add(Job(id=jid, status="completed"))
        await db.commit()

        resp = await client.delete(f"/api/jobs/{jid}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["deleted"] is True
        assert data["bytes_freed"] == 0

        # Verify gone from DB
        from sqlalchemy import select
        result = await db.execute(select(Job).where(Job.id == jid))
        assert result.scalars().first() is None

    async def test_delete_job_with_files_flag(self, client, db):
        jid = _uuid()
        db.add(Job(id=jid, status="completed"))
        await db.commit()

        with patch("app.routers.jobs._delete_job_files", return_value=1024) as mock_del:
            resp = await client.delete(f"/api/jobs/{jid}?delete_files=true")

        assert resp.status_code == 200
        assert resp.json()["bytes_freed"] == 1024
        mock_del.assert_called_once()

    async def test_delete_job_with_goes_frames(self, client, db):
        """Delete job that has GoesFrame records — cascades properly."""
        jid = _uuid()
        db.add(Job(id=jid, status="completed"))
        await db.commit()

        fid = _uuid()
        db.add(GoesFrame(
            id=fid, satellite="GOES-16", sector="CONUS", band="C02",
            capture_time=datetime(2024, 1, 1, tzinfo=UTC),
            file_path="/tmp/nonexistent.nc", file_size=100,
            source_job_id=jid,
        ))
        await db.commit()

        # delete_files=true triggers file cleanup
        with patch("app.routers.jobs.os.path.isdir", return_value=False), \
             patch("app.routers.jobs.os.path.isfile", return_value=False):
            resp = await client.delete(f"/api/jobs/{jid}?delete_files=true")
        assert resp.status_code == 200

        # GoesFrame should be deleted
        from sqlalchemy import select
        result = await db.execute(select(GoesFrame).where(GoesFrame.id == fid))
        assert result.scalars().first() is None

    async def test_delete_nonexistent_job_returns_404(self, client):
        resp = await client.delete(f"/api/jobs/{_uuid()}")
        assert resp.status_code == 404


# ── Bulk delete ──────────────────────────────────────────────────


@pytest.mark.asyncio
class TestBulkDelete:
    async def test_bulk_delete_multiple_jobs(self, client, db):
        ids = [_uuid() for _ in range(3)]
        for jid in ids:
            db.add(Job(id=jid, status="completed"))
        await db.commit()

        resp = await client.request("DELETE", "/api/jobs/bulk", json={"job_ids": ids})
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 3
        assert set(data["deleted"]) == set(ids)

    async def test_bulk_delete_empty_list(self, client):
        resp = await client.request("DELETE", "/api/jobs/bulk", json={"job_ids": []})
        assert resp.status_code == 200
        assert resp.json()["count"] == 0

    async def test_bulk_delete_with_delete_files(self, client, db):
        jid = _uuid()
        db.add(Job(id=jid, status="completed"))
        await db.commit()

        with patch("app.routers.jobs._delete_job_files", return_value=2048):
            resp = await client.request(
                "DELETE", "/api/jobs/bulk",
                json={"job_ids": [jid], "delete_files": True},
            )
        assert resp.status_code == 200
        assert resp.json()["bytes_freed"] == 2048

    async def test_bulk_delete_nonexistent_ids(self, client):
        resp = await client.request(
            "DELETE", "/api/jobs/bulk",
            json={"job_ids": [_uuid(), _uuid()]},
        )
        assert resp.status_code == 200
        assert resp.json()["count"] == 0

    async def test_bulk_delete_revokes_running_tasks(self, client, db):
        jid = _uuid()
        db.add(Job(id=jid, status="processing", task_id="task-abc"))
        await db.commit()

        with patch("app.routers.jobs.celery_app") as mock_celery:
            resp = await client.request(
                "DELETE", "/api/jobs/bulk", json={"job_ids": [jid]},
            )
        assert resp.status_code == 200
        mock_celery.control.revoke.assert_called_once()


# ── Stale job detection ──────────────────────────────────────────


@pytest.mark.asyncio
class TestStaleJobDetection:
    async def test_stale_job_marked_failed(self, db):
        """Job processing >30 min → marked as failed."""
        jid = _uuid()
        old_time = utcnow() - timedelta(minutes=45)
        db.add(Job(
            id=jid, status="processing",
            started_at=old_time, updated_at=old_time,
        ))
        await db.commit()

        count = await mark_stale_jobs(db)
        assert count == 1

        from sqlalchemy import select
        result = await db.execute(select(Job).where(Job.id == jid))
        job = result.scalars().first()
        assert job.status == "failed"
        assert "timed out" in job.status_message

    async def test_recent_job_left_alone(self, db):
        """Job processing <30 min → left alone."""
        jid = _uuid()
        recent = utcnow() - timedelta(minutes=10)
        db.add(Job(
            id=jid, status="processing",
            started_at=recent, updated_at=recent,
        ))
        await db.commit()

        count = await mark_stale_jobs(db)
        assert count == 0

        from sqlalchemy import select
        result = await db.execute(select(Job).where(Job.id == jid))
        job = result.scalars().first()
        assert job.status == "processing"

    async def test_completed_job_not_affected(self, db):
        """Job already completed → not affected."""
        jid = _uuid()
        old_time = utcnow() - timedelta(hours=2)
        db.add(Job(
            id=jid, status="completed",
            started_at=old_time, updated_at=old_time,
        ))
        await db.commit()

        count = await mark_stale_jobs(db)
        assert count == 0

    async def test_pending_job_not_affected(self, db):
        """Pending jobs aren't considered stale."""
        jid = _uuid()
        old_time = utcnow() - timedelta(hours=2)
        db.add(Job(id=jid, status="pending", updated_at=old_time))
        await db.commit()

        count = await mark_stale_jobs(db)
        assert count == 0

    async def test_multiple_stale_jobs(self, db):
        """Multiple stale jobs all get marked."""
        old = utcnow() - timedelta(minutes=60)
        for _ in range(3):
            db.add(Job(id=_uuid(), status="processing", started_at=old, updated_at=old))
        await db.commit()

        count = await mark_stale_jobs(db)
        assert count == 3


# ── Job logs ─────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestJobLogs:
    async def test_get_logs_for_job(self, client, db):
        jid = _uuid()
        db.add(Job(id=jid, status="processing"))
        await db.commit()

        db.add(JobLog(job_id=jid, level="info", message="Frame 1/10"))
        db.add(JobLog(job_id=jid, level="info", message="Frame 2/10"))
        db.add(JobLog(job_id=jid, level="error", message="Failed frame 3"))
        await db.commit()

        resp = await client.get(f"/api/jobs/{jid}/logs")
        assert resp.status_code == 200
        logs = resp.json()
        assert len(logs) == 3

    async def test_get_logs_filtered_by_level(self, client, db):
        jid = _uuid()
        db.add(Job(id=jid, status="processing"))
        await db.commit()

        db.add(JobLog(job_id=jid, level="info", message="ok"))
        db.add(JobLog(job_id=jid, level="error", message="bad"))
        await db.commit()

        resp = await client.get(f"/api/jobs/{jid}/logs?level=error")
        assert resp.status_code == 200
        logs = resp.json()
        assert len(logs) == 1
        assert logs[0]["level"] == "error"

    async def test_get_logs_nonexistent_job(self, client):
        # Logs endpoint returns empty list for non-existent job (no 404)
        resp = await client.get(f"/api/jobs/{_uuid()}/logs")
        assert resp.status_code == 200
        assert resp.json() == []
