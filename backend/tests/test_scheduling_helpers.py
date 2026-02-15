"""Tests for scheduling_tasks helper functions."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.tasks.scheduling_tasks import (
    _collect_age_based_deletions,
    _collect_storage_based_deletions,
    _delete_frame_files,
    _get_protected_frame_ids,
    _launch_schedule_job,
)


def _utcnow():
    return datetime.now(UTC)


# ── _launch_schedule_job ────────────────────────────────

class TestLaunchScheduleJob:
    def test_creates_job_and_dispatches(self):
        session = MagicMock()
        now = _utcnow()
        preset = SimpleNamespace(
            id="p1", satellite="G16", sector="CONUS", band="C02", name="test-preset"
        )
        schedule = SimpleNamespace(
            id="s1", interval_minutes=30, last_run_at=None, next_run_at=None, name="sched1"
        )

        with patch("app.tasks.goes_tasks.fetch_goes_data") as mock_task:
            mock_task.delay = MagicMock()
            _launch_schedule_job(session, schedule, preset, now)
            mock_task.delay.assert_called_once()

        session.add.assert_called_once()
        job = session.add.call_args[0][0]
        assert job.status == "pending"
        assert job.job_type == "goes_fetch"
        assert job.params["satellite"] == "G16"
        assert schedule.last_run_at == now
        assert schedule.next_run_at == now + timedelta(minutes=30)


# ── _get_protected_frame_ids ────────────────────────────

class TestGetProtectedFrameIds:
    def test_disabled(self):
        session = MagicMock()
        assert _get_protected_frame_ids(session, False) == set()
        session.execute.assert_not_called()

    def test_enabled(self):
        session = MagicMock()
        session.execute.return_value.all.return_value = [("f1",), ("f2",)]
        result = _get_protected_frame_ids(session, True)
        assert result == {"f1", "f2"}


# ── _collect_age_based_deletions ────────────────────────

class TestCollectAgeBasedDeletions:
    @patch("app.tasks.scheduling_tasks.utcnow")
    def test_filters_old_and_unprotected(self, mock_now):
        now = _utcnow()
        mock_now.return_value = now

        old_frame = SimpleNamespace(id="f1", created_at=now - timedelta(days=100))
        protected_frame = SimpleNamespace(id="f3", created_at=now - timedelta(days=100))

        session = MagicMock()
        session.query.return_value.filter.return_value.all.return_value = [old_frame, protected_frame]

        rule = SimpleNamespace(value=30)
        result = _collect_age_based_deletions(session, rule, {"f3"})
        assert result == [old_frame]


# ── _collect_storage_based_deletions ────────────────────

class TestCollectStorageBasedDeletions:
    def test_under_limit(self):
        session = MagicMock()
        session.execute.return_value.scalar.return_value = 500
        rule = SimpleNamespace(value=1)  # 1 GB
        assert _collect_storage_based_deletions(session, rule, set()) == []

    def test_over_limit_deletes_oldest(self):
        session = MagicMock()
        # total = 2GB in bytes
        session.execute.return_value.scalar.return_value = 2 * 1024 * 1024 * 1024

        f1 = SimpleNamespace(id="f1", file_size=1024 * 1024 * 1024, created_at=_utcnow())
        f2 = SimpleNamespace(id="f2", file_size=1024 * 1024 * 1024, created_at=_utcnow())
        session.query.return_value.order_by.return_value.offset.return_value.limit.return_value.all.return_value = [f1, f2]

        rule = SimpleNamespace(value=1)  # 1 GB limit → need to free 1GB
        result = _collect_storage_based_deletions(session, rule, set())
        assert result == [f1]

    def test_skips_protected(self):
        session = MagicMock()
        session.execute.return_value.scalar.return_value = 2 * 1024 * 1024 * 1024

        f1 = SimpleNamespace(id="f1", file_size=1024 * 1024 * 1024, created_at=_utcnow())
        f2 = SimpleNamespace(id="f2", file_size=1024 * 1024 * 1024, created_at=_utcnow())
        session.query.return_value.order_by.return_value.offset.return_value.limit.return_value.all.return_value = [f1, f2]

        rule = SimpleNamespace(value=1)
        result = _collect_storage_based_deletions(session, rule, {"f1"})
        assert result == [f2]


# ── _delete_frame_files ─────────────────────────────────

class TestDeleteFrameFiles:
    def test_deletes_existing_files(self, tmp_path):
        fp = tmp_path / "img.png"
        tp = tmp_path / "thumb.png"
        fp.write_text("x")
        tp.write_text("x")

        frame = SimpleNamespace(file_path=str(fp), thumbnail_path=str(tp))
        _delete_frame_files(frame)
        assert not fp.exists()
        assert not tp.exists()

    def test_handles_missing_files(self):
        frame = SimpleNamespace(file_path="/nonexistent/a.png", thumbnail_path=None)
        _delete_frame_files(frame)  # should not raise

    def test_handles_none_paths(self):
        frame = SimpleNamespace(file_path=None, thumbnail_path=None)
        _delete_frame_files(frame)  # should not raise


# ── Constants from other modules ────────────────────────

def test_jobs_id_fk():
    from app.db.models import JOBS_ID_FK
    assert JOBS_ID_FK == "jobs.id"


def test_frame_not_found_constant():
    from app.routers.goes_data import _FRAME_NOT_FOUND
    assert _FRAME_NOT_FOUND == "Frame not found"


def test_processing_constants():
    from app.tasks.processing import (
        MSG_PROCESSING_COMPLETE,
        MSG_PROCESSING_FAILED,
        MSG_VIDEO_CREATION_COMPLETE,
    )
    assert MSG_PROCESSING_COMPLETE == "Processing complete"
    assert MSG_PROCESSING_FAILED == "Processing failed"
    assert MSG_VIDEO_CREATION_COMPLETE == "Video creation complete"


def test_scheduling_router_constants():
    from app.routers.scheduling import _FETCH_PRESET_NOT_FOUND, _SCHEDULE_NOT_FOUND
    assert _FETCH_PRESET_NOT_FOUND == "Fetch preset not found"
    assert _SCHEDULE_NOT_FOUND == "Schedule not found"
