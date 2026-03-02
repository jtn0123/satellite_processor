"""Tests for backend reliability: narrowed exceptions, Celery retry config, failed_jobs tracking."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from app.celery_app import celery_app, on_task_failure
from app.db.database import Base
from app.models.failed_job import FailedJob

# ── Task 1: Narrowed exception tests ─────────────────────────────


class TestNarrowedExceptions:
    """Verify narrowed exceptions still handle expected failure cases."""

    def test_thumbnail_handles_invalid_image(self, tmp_path):
        """thumbnail.generate_thumbnail returns None for corrupt files."""
        from app.services.thumbnail import generate_thumbnail

        bad = tmp_path / "bad.png"
        bad.write_bytes(b"not an image")
        result = generate_thumbnail(str(bad), str(tmp_path))
        assert result is None

    def test_thumbnail_dimensions_handles_invalid(self, tmp_path):
        from app.services.thumbnail import get_image_dimensions

        bad = tmp_path / "bad.png"
        bad.write_bytes(b"not an image")
        w, h = get_image_dimensions(str(bad))
        assert w is None and h is None

    def test_publish_progress_handles_redis_down(self):
        """_publish_progress silently handles connection failures."""
        from app.tasks.helpers import _publish_progress

        with patch("app.tasks.helpers._get_redis") as mock:
            mock.return_value.publish.side_effect = ConnectionError("down")
            # Should not raise
            _publish_progress("job-1", 50, "testing")

    def test_cache_handles_redis_failure(self):
        """cache.get_cached handles Redis connection errors gracefully."""
        import asyncio

        from app.services.cache import get_cached

        async def _test():
            mock_redis = MagicMock()
            mock_redis.get = MagicMock(side_effect=ConnectionError("down"))
            mock_redis.set = MagicMock(side_effect=ConnectionError("down"))

            with patch("app.services.cache.get_redis_client", return_value=mock_redis):
                result = await get_cached("test:key", 60, lambda: {"data": 1})
            assert result == {"data": 1}

        asyncio.get_event_loop().run_until_complete(_test())


# ── Task 2: Celery retry config tests ────────────────────────────


class TestCeleryRetryConfig:
    """Verify autoretry configuration is applied to all task functions."""

    @pytest.mark.parametrize("task_name", [
        "fetch_goes_data",
        "backfill_gaps",
        "generate_composite",
        "fetch_composite_data",
        "generate_animation",
        "process_images",
        "create_video",
    ])
    def test_task_has_autoretry(self, task_name):
        """All major tasks should have autoretry_for configured."""
        task = celery_app.tasks.get(task_name)
        if task is None:
            pytest.skip(f"Task {task_name} not registered in test celery app")
        assert task.max_retries == 3
        assert task.retry_backoff is True
        assert task.retry_jitter is True

    def test_fetch_goes_data_retries_on_connection_error(self):
        """Verify fetch_goes_data has ConnectionError in autoretry_for."""
        from app.tasks.goes_tasks import fetch_goes_data

        autoretry = getattr(fetch_goes_data, 'autoretry_for', None)
        assert autoretry is not None
        assert ConnectionError in autoretry

    def test_process_images_retries_on_timeout(self):
        from app.tasks.processing import process_images_task

        autoretry = getattr(process_images_task, 'autoretry_for', None)
        assert autoretry is not None
        assert TimeoutError in autoretry


# ── Task 4: Failed jobs signal + endpoint ────────────────────────


class TestFailedJobsTracking:
    """Test the dead-letter tracking system."""

    def test_on_task_failure_writes_to_db(self):
        """Signal handler should persist failed job to database."""
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        sync_engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(sync_engine)
        Session = sessionmaker(bind=sync_engine)

        mock_sender = MagicMock()
        mock_sender.name = "test_task"
        mock_sender.request.retries = 2

        exc = ValueError("test error")

        session = Session()
        with patch("app.tasks.helpers._get_sync_db", return_value=session):
            on_task_failure(
                sender=mock_sender,
                task_id="abc-123",
                exception=exc,
                tb=None,
                args=["job-1", {"key": "val"}],
                kwargs={},
            )

        records = session.query(FailedJob).all()
        assert len(records) == 1
        assert records[0].task_name == "test_task"
        assert records[0].task_id == "abc-123"
        assert "test error" in records[0].exception
        session.close()

    @pytest.mark.asyncio
    async def test_failed_jobs_endpoint_empty(self, client):
        """GET /api/system/failed-jobs returns empty list initially."""
        resp = await client.get("/api/system/failed-jobs")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_failed_jobs_endpoint_with_data(self, client, db):
        """GET /api/system/failed-jobs returns persisted records."""
        entry = FailedJob(
            id="test-id-1",
            task_name="fetch_goes_data",
            task_id="celery-task-1",
            args='["job-1"]',
            kwargs="{}",
            exception="ConnectionError: timeout",
            traceback="...",
            retried_count=3,
        )
        db.add(entry)
        await db.commit()

        resp = await client.get("/api/system/failed-jobs")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["task_name"] == "fetch_goes_data"
        assert data["items"][0]["retried_count"] == 3

    @pytest.mark.asyncio
    async def test_failed_jobs_pagination(self, client, db):
        """Pagination works correctly."""
        for i in range(5):
            db.add(FailedJob(
                id=f"id-{i}",
                task_name="test_task",
                task_id=f"tid-{i}",
                exception="err",
            ))
        await db.commit()

        resp = await client.get("/api/system/failed-jobs?page=1&limit=2")
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        assert data["page"] == 1

    @pytest.mark.asyncio
    async def test_failed_jobs_filter_by_task(self, client, db):
        """Filter by task_name."""
        db.add(FailedJob(id="a", task_name="task_a", task_id="t1", exception="e"))
        db.add(FailedJob(id="b", task_name="task_b", task_id="t2", exception="e"))
        await db.commit()

        resp = await client.get("/api/system/failed-jobs?task_name=task_a")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["task_name"] == "task_a"


# ── Task 3: API error consistency ────────────────────────────────


class TestAPIErrorConsistency:
    """Verify all error responses use APIError or HTTPException."""

    @pytest.mark.asyncio
    async def test_404_uses_error_envelope(self, client):
        """Non-existent image returns structured error."""
        resp = await client.get("/api/images/00000000-0000-0000-0000-000000000000/full")
        assert resp.status_code == 404
        data = resp.json()
        assert "error" in data or "detail" in data

    @pytest.mark.asyncio
    async def test_no_bare_error_returns_in_routers(self):
        """Verify no router returns bare {'error': ...} dicts (should use APIError)."""
        from pathlib import Path

        routers_dir = Path(__file__).parent.parent / "app" / "routers"
        violations = []
        for py_file in routers_dir.glob("*.py"):
            if py_file.name == "health.py":
                continue  # Health checks return status dicts, not API error responses
            source = py_file.read_text()
            for i, line in enumerate(source.splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith("return") and '"error"' in stripped and "raise" not in stripped:
                    violations.append(f"{py_file.name}:{i}: {stripped}")
        assert violations == [], f"Bare error returns found: {violations}"
