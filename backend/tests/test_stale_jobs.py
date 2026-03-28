"""Tests for stale job detection and cleanup service."""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
import pytest_asyncio
from app.db.models import Job
from app.services.stale_jobs import (
    STALE_PENDING_MINUTES,
    STALE_PROCESSING_MINUTES,
    cleanup_all_stale,
    mark_stale_jobs,
    mark_stale_pending_jobs,
)
from app.utils import utcnow


def _job(
    status: str = "processing",
    minutes_ago: int = 0,
    task_id: str | None = "task-123",
) -> Job:
    ts = utcnow() - timedelta(minutes=minutes_ago)
    return Job(
        id=str(uuid.uuid4()),
        name="test-job",
        status=status,
        job_type="fetch",
        task_id=task_id,
        created_at=ts,
        started_at=ts if status == "processing" else None,
        updated_at=ts,
    )


@pytest_asyncio.fixture
async def db_with_stale_processing(db):
    """DB with jobs: 2 stale processing, 1 fresh processing, 1 completed."""
    db.add(_job(status="processing", minutes_ago=STALE_PROCESSING_MINUTES + 10))
    db.add(_job(status="processing", minutes_ago=STALE_PROCESSING_MINUTES + 5))
    db.add(_job(status="processing", minutes_ago=5))  # fresh
    db.add(_job(status="completed", minutes_ago=STALE_PROCESSING_MINUTES + 10))
    await db.commit()
    return db


@pytest_asyncio.fixture
async def db_with_stale_pending(db):
    """DB with pending jobs: 2 stale (no task_id), 1 fresh, 1 with task_id."""
    db.add(_job(status="pending", minutes_ago=STALE_PENDING_MINUTES + 10, task_id=None))
    db.add(_job(status="pending", minutes_ago=STALE_PENDING_MINUTES + 5, task_id=""))
    db.add(_job(status="pending", minutes_ago=5, task_id=None))  # fresh
    db.add(_job(status="pending", minutes_ago=STALE_PENDING_MINUTES + 10, task_id="has-task"))
    await db.commit()
    return db


class TestMarkStaleJobs:
    @pytest.mark.asyncio
    async def test_marks_stale_processing_jobs(self, db_with_stale_processing):
        count = await mark_stale_jobs(db_with_stale_processing)
        assert count == 2

    @pytest.mark.asyncio
    async def test_stale_jobs_set_to_failed(self, db_with_stale_processing):
        await mark_stale_jobs(db_with_stale_processing)
        from sqlalchemy import select

        result = await db_with_stale_processing.execute(
            select(Job).where(Job.status == "failed")
        )
        failed = result.scalars().all()
        assert len(failed) == 2
        for job in failed:
            assert "timed out" in job.status_message
            assert job.completed_at is not None

    @pytest.mark.asyncio
    async def test_fresh_jobs_untouched(self, db_with_stale_processing):
        await mark_stale_jobs(db_with_stale_processing)
        from sqlalchemy import select

        result = await db_with_stale_processing.execute(
            select(Job).where(Job.status == "processing")
        )
        processing = result.scalars().all()
        assert len(processing) == 1

    @pytest.mark.asyncio
    async def test_no_stale_returns_zero(self, db):
        db.add(_job(status="processing", minutes_ago=5))
        await db.commit()
        count = await mark_stale_jobs(db)
        assert count == 0

    @pytest.mark.asyncio
    async def test_empty_db(self, db):
        count = await mark_stale_jobs(db)
        assert count == 0


class TestMarkStalePendingJobs:
    @pytest.mark.asyncio
    async def test_marks_stale_pending_no_task_id(self, db_with_stale_pending):
        count = await mark_stale_pending_jobs(db_with_stale_pending)
        assert count == 2

    @pytest.mark.asyncio
    async def test_pending_with_task_id_untouched(self, db_with_stale_pending):
        await mark_stale_pending_jobs(db_with_stale_pending)
        from sqlalchemy import select

        result = await db_with_stale_pending.execute(
            select(Job).where(Job.status == "pending")
        )
        pending = result.scalars().all()
        # 1 fresh + 1 with task_id = 2 remaining pending
        assert len(pending) == 2

    @pytest.mark.asyncio
    async def test_empty_db(self, db):
        count = await mark_stale_pending_jobs(db)
        assert count == 0


class TestCleanupAllStale:
    @pytest.mark.asyncio
    async def test_runs_both_cleanups(self, db):
        # Add one stale processing and one stale pending
        db.add(_job(status="processing", minutes_ago=STALE_PROCESSING_MINUTES + 10))
        db.add(_job(status="pending", minutes_ago=STALE_PENDING_MINUTES + 10, task_id=None))
        await db.commit()

        result = await cleanup_all_stale(db)
        assert result["stale_processing"] == 1
        assert result["stale_pending"] == 1
        assert result["total"] == 2

    @pytest.mark.asyncio
    async def test_empty_db(self, db):
        result = await cleanup_all_stale(db)
        assert result["total"] == 0
