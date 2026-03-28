"""Tests for job logging helpers."""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from app.db.models import Job, JobLog
from app.services.job_logger import log_job, log_job_sync
from sqlalchemy import select


@pytest_asyncio.fixture
async def job_id(db):
    """Create a job and return its ID."""
    jid = str(uuid.uuid4())
    db.add(Job(id=jid, name="test-job", status="processing", job_type="fetch"))
    await db.commit()
    return jid


class TestLogJobAsync:
    @pytest.mark.asyncio
    async def test_creates_log_entry(self, db, job_id):
        await log_job(db, job_id, "Started processing")

        result = await db.execute(select(JobLog).where(JobLog.job_id == job_id))
        logs = result.scalars().all()
        assert len(logs) == 1
        assert logs[0].message == "Started processing"
        assert logs[0].level == "info"

    @pytest.mark.asyncio
    async def test_custom_level(self, db, job_id):
        await log_job(db, job_id, "Something went wrong", level="error")

        result = await db.execute(select(JobLog).where(JobLog.job_id == job_id))
        log = result.scalars().first()
        assert log.level == "error"

    @pytest.mark.asyncio
    async def test_timestamp_set(self, db, job_id):
        await log_job(db, job_id, "Test message")

        result = await db.execute(select(JobLog).where(JobLog.job_id == job_id))
        log = result.scalars().first()
        assert log.timestamp is not None

    @pytest.mark.asyncio
    async def test_multiple_logs(self, db, job_id):
        await log_job(db, job_id, "Step 1")
        await log_job(db, job_id, "Step 2")
        await log_job(db, job_id, "Step 3")

        result = await db.execute(select(JobLog).where(JobLog.job_id == job_id))
        logs = result.scalars().all()
        assert len(logs) == 3


class TestLogJobSync:
    def test_creates_log_entry(self):
        """Test sync logging with a mock session."""
        from unittest.mock import MagicMock

        session = MagicMock()
        log_job_sync(session, "job-123", "Processing started")

        session.add.assert_called_once()
        added_entry = session.add.call_args[0][0]
        assert added_entry.job_id == "job-123"
        assert added_entry.message == "Processing started"
        assert added_entry.level == "info"
        session.commit.assert_called_once()

    def test_custom_level(self):
        from unittest.mock import MagicMock

        session = MagicMock()
        log_job_sync(session, "job-123", "Error occurred", level="error")

        added_entry = session.add.call_args[0][0]
        assert added_entry.level == "error"

    def test_publishes_to_redis(self):
        import json
        from unittest.mock import MagicMock

        session = MagicMock()
        redis_client = MagicMock()
        log_job_sync(session, "job-123", "Status update", redis_client=redis_client)

        redis_client.publish.assert_called_once()
        channel, payload = redis_client.publish.call_args[0]
        assert channel == "job:job-123"
        data = json.loads(payload)
        assert data["type"] == "log"
        assert data["message"] == "Status update"

    def test_redis_failure_does_not_raise(self):
        import redis.exceptions
        from unittest.mock import MagicMock

        session = MagicMock()
        redis_client = MagicMock()
        redis_client.publish.side_effect = redis.exceptions.ConnectionError

        # Should not raise
        log_job_sync(session, "job-123", "Message", redis_client=redis_client)
        session.commit.assert_called_once()
