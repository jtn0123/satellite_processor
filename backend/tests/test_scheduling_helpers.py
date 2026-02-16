"""Tests for scheduling_tasks helper functions."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, call, patch

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
        assert job.params["sector"] == "CONUS"
        assert job.params["band"] == "C02"
        assert job.params["preset_id"] == "p1"
        assert job.params["schedule_id"] == "s1"
        assert schedule.last_run_at == now
        assert schedule.next_run_at == now + timedelta(minutes=30)
        session.flush.assert_called_once()

    def test_start_time_is_interval_before_now(self):
        session = MagicMock()
        now = _utcnow()
        preset = SimpleNamespace(id="p1", satellite="G16", sector="FD", band="C13", name="pname")
        schedule = SimpleNamespace(id="s1", interval_minutes=60, last_run_at=None, next_run_at=None, name="sname")

        with patch("app.tasks.goes_tasks.fetch_goes_data") as mock_task:
            mock_task.delay = MagicMock()
            _launch_schedule_job(session, schedule, preset, now)

        job = session.add.call_args[0][0]
        expected_start = (now - timedelta(minutes=60)).isoformat()
        assert job.params["start_time"] == expected_start
        assert job.params["end_time"] == now.isoformat()


# ── check_schedules task ────────────────────────────────

class TestCheckSchedules:
    @patch("app.tasks.scheduling_tasks._get_sync_db")
    @patch("app.tasks.scheduling_tasks._launch_schedule_job")
    @patch("app.tasks.scheduling_tasks.utcnow")
    def test_launches_due_schedules(self, mock_now, mock_launch, mock_db):
        now = _utcnow()
        mock_now.return_value = now

        preset = SimpleNamespace(id="p1", name="preset1")
        schedule = SimpleNamespace(id="s1", preset_id="p1", is_active=True, next_run_at=now - timedelta(minutes=1))

        session = MagicMock()
        mock_db.return_value = session
        session.query.return_value.filter.return_value.all.side_effect = [
            [schedule],  # FetchSchedule query
        ]
        # For preset query
        session.query.return_value.filter.return_value.first.return_value = preset

        from app.tasks.scheduling_tasks import check_schedules
        check_schedules()

        mock_launch.assert_called_once_with(session, schedule, preset, now)
        session.commit.assert_called_once()
        session.close.assert_called_once()

    @patch("app.tasks.scheduling_tasks._get_sync_db")
    @patch("app.tasks.scheduling_tasks.utcnow")
    def test_skips_missing_preset(self, mock_now, mock_db):
        now = _utcnow()
        mock_now.return_value = now

        schedule = SimpleNamespace(id="s1", preset_id="missing", is_active=True, next_run_at=now)

        session = MagicMock()
        mock_db.return_value = session
        session.query.return_value.filter.return_value.all.return_value = [schedule]
        session.query.return_value.filter.return_value.first.return_value = None

        from app.tasks.scheduling_tasks import check_schedules
        check_schedules()

        session.commit.assert_called_once()
        session.close.assert_called_once()

    @patch("app.tasks.scheduling_tasks._get_sync_db")
    @patch("app.tasks.scheduling_tasks.utcnow")
    def test_rollback_on_error(self, mock_now, mock_db):
        mock_now.return_value = _utcnow()

        session = MagicMock()
        mock_db.return_value = session
        session.query.side_effect = Exception("db error")

        from app.tasks.scheduling_tasks import check_schedules
        check_schedules()

        session.rollback.assert_called_once()
        session.close.assert_called_once()

    @patch("app.tasks.scheduling_tasks._get_sync_db")
    @patch("app.tasks.scheduling_tasks.utcnow")
    def test_no_due_schedules(self, mock_now, mock_db):
        mock_now.return_value = _utcnow()
        session = MagicMock()
        mock_db.return_value = session
        session.query.return_value.filter.return_value.all.return_value = []

        from app.tasks.scheduling_tasks import check_schedules
        check_schedules()

        session.commit.assert_called_once()
        session.close.assert_called_once()


# ── run_cleanup task ────────────────────────────────────

class TestRunCleanup:
    @patch("app.tasks.scheduling_tasks._get_sync_db")
    def test_no_active_rules(self, mock_db):
        session = MagicMock()
        mock_db.return_value = session
        session.query.return_value.filter.return_value.all.return_value = []

        from app.tasks.scheduling_tasks import run_cleanup
        run_cleanup()

        session.close.assert_called_once()

    @patch("app.tasks.scheduling_tasks._delete_frame_files")
    @patch("app.tasks.scheduling_tasks._collect_age_based_deletions")
    @patch("app.tasks.scheduling_tasks._get_protected_frame_ids")
    @patch("app.tasks.scheduling_tasks._get_sync_db")
    def test_age_rule_deletes_frames(self, mock_db, mock_prot, mock_age, mock_del_files):
        session = MagicMock()
        mock_db.return_value = session

        rule = SimpleNamespace(rule_type="max_age_days", protect_collections=False, is_active=True)
        session.query.return_value.filter.return_value.all.return_value = [rule]

        mock_prot.return_value = set()
        frame = SimpleNamespace(id="f1", file_size=1000, file_path="/a.png", thumbnail_path=None)
        mock_age.return_value = [frame]

        from app.tasks.scheduling_tasks import run_cleanup
        run_cleanup()

        mock_del_files.assert_called_once_with(frame)
        session.delete.assert_called_once_with(frame)
        session.commit.assert_called_once()
        session.close.assert_called_once()

    @patch("app.tasks.scheduling_tasks._delete_frame_files")
    @patch("app.tasks.scheduling_tasks._collect_storage_based_deletions")
    @patch("app.tasks.scheduling_tasks._get_protected_frame_ids")
    @patch("app.tasks.scheduling_tasks._get_sync_db")
    def test_storage_rule_deletes_frames(self, mock_db, mock_prot, mock_storage, mock_del_files):
        session = MagicMock()
        mock_db.return_value = session

        rule = SimpleNamespace(rule_type="max_storage_gb", protect_collections=True, is_active=True)
        session.query.return_value.filter.return_value.all.return_value = [rule]

        mock_prot.return_value = {"protected1"}
        frame = SimpleNamespace(id="f2", file_size=2000, file_path="/b.png", thumbnail_path="/b_thumb.png")
        mock_storage.return_value = [frame]

        from app.tasks.scheduling_tasks import run_cleanup
        run_cleanup()

        mock_del_files.assert_called_once_with(frame)
        session.delete.assert_called_once_with(frame)
        session.commit.assert_called_once()

    @patch("app.tasks.scheduling_tasks._get_protected_frame_ids")
    @patch("app.tasks.scheduling_tasks._get_sync_db")
    def test_unknown_rule_type(self, mock_db, mock_prot):
        session = MagicMock()
        mock_db.return_value = session

        rule = SimpleNamespace(rule_type="unknown_type", protect_collections=False, is_active=True)
        session.query.return_value.filter.return_value.all.return_value = [rule]
        mock_prot.return_value = set()

        from app.tasks.scheduling_tasks import run_cleanup
        run_cleanup()

        session.delete.assert_not_called()
        session.commit.assert_called_once()

    @patch("app.tasks.scheduling_tasks._get_sync_db")
    def test_rollback_on_error(self, mock_db):
        session = MagicMock()
        mock_db.return_value = session
        session.query.side_effect = Exception("db error")

        from app.tasks.scheduling_tasks import run_cleanup
        run_cleanup()

        session.rollback.assert_called_once()
        session.close.assert_called_once()

    @patch("app.tasks.scheduling_tasks._delete_frame_files")
    @patch("app.tasks.scheduling_tasks._collect_age_based_deletions")
    @patch("app.tasks.scheduling_tasks._get_protected_frame_ids")
    @patch("app.tasks.scheduling_tasks._get_sync_db")
    def test_frame_with_none_file_size(self, mock_db, mock_prot, mock_age, mock_del_files):
        session = MagicMock()
        mock_db.return_value = session

        rule = SimpleNamespace(rule_type="max_age_days", protect_collections=False, is_active=True)
        session.query.return_value.filter.return_value.all.return_value = [rule]
        mock_prot.return_value = set()

        frame = SimpleNamespace(id="f1", file_size=None, file_path="/a.png", thumbnail_path=None)
        mock_age.return_value = [frame]

        from app.tasks.scheduling_tasks import run_cleanup
        run_cleanup()

        session.commit.assert_called_once()


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

    def test_enabled_empty(self):
        session = MagicMock()
        session.execute.return_value.all.return_value = []
        result = _get_protected_frame_ids(session, True)
        assert result == set()


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

    @patch("app.tasks.scheduling_tasks.utcnow")
    def test_no_old_frames(self, mock_now):
        mock_now.return_value = _utcnow()
        session = MagicMock()
        session.query.return_value.filter.return_value.all.return_value = []

        result = _collect_age_based_deletions(session, SimpleNamespace(value=30), set())
        assert result == []

    @patch("app.tasks.scheduling_tasks.utcnow")
    def test_all_protected(self, mock_now):
        now = _utcnow()
        mock_now.return_value = now
        f1 = SimpleNamespace(id="f1", created_at=now - timedelta(days=100))
        session = MagicMock()
        session.query.return_value.filter.return_value.all.return_value = [f1]

        result = _collect_age_based_deletions(session, SimpleNamespace(value=30), {"f1"})
        assert result == []


# ── _collect_storage_based_deletions ────────────────────

class TestCollectStorageBasedDeletions:
    def test_under_limit(self):
        session = MagicMock()
        session.execute.return_value.scalar.return_value = 500
        rule = SimpleNamespace(value=1)  # 1 GB
        assert _collect_storage_based_deletions(session, rule, set()) == []

    def test_over_limit_deletes_oldest(self):
        session = MagicMock()
        session.execute.return_value.scalar.return_value = 2 * 1024 * 1024 * 1024

        f1 = SimpleNamespace(id="f1", file_size=1024 * 1024 * 1024, created_at=_utcnow())
        f2 = SimpleNamespace(id="f2", file_size=1024 * 1024 * 1024, created_at=_utcnow())
        session.query.return_value.order_by.return_value.offset.return_value.limit.return_value.all.return_value = [f1, f2]

        rule = SimpleNamespace(value=1)
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

    def test_zero_total_bytes(self):
        session = MagicMock()
        session.execute.return_value.scalar.return_value = 0
        rule = SimpleNamespace(value=1)
        assert _collect_storage_based_deletions(session, rule, set()) == []

    def test_none_file_size(self):
        session = MagicMock()
        session.execute.return_value.scalar.return_value = 2 * 1024 * 1024 * 1024

        f1 = SimpleNamespace(id="f1", file_size=None, created_at=_utcnow())
        f2 = SimpleNamespace(id="f2", file_size=2 * 1024 * 1024 * 1024, created_at=_utcnow())
        session.query.return_value.order_by.return_value.offset.return_value.limit.return_value.all.return_value = [f1, f2]

        rule = SimpleNamespace(value=1)
        result = _collect_storage_based_deletions(session, rule, set())
        # f1 has None file_size (counted as 0), so f2 should also be included
        assert f1 in result
        assert f2 in result

    def test_empty_batch_breaks_loop(self):
        session = MagicMock()
        session.execute.return_value.scalar.return_value = 2 * 1024 * 1024 * 1024
        session.query.return_value.order_by.return_value.offset.return_value.limit.return_value.all.return_value = []

        rule = SimpleNamespace(value=1)
        result = _collect_storage_based_deletions(session, rule, set())
        assert result == []


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
        _delete_frame_files(frame)

    def test_handles_none_paths(self):
        frame = SimpleNamespace(file_path=None, thumbnail_path=None)
        _delete_frame_files(frame)

    def test_handles_oserror_gracefully(self):
        frame = SimpleNamespace(file_path="/root/no_perms/file.png", thumbnail_path="/root/no_perms/thumb.png")
        _delete_frame_files(frame)  # should not raise


# ── Constants from other modules ────────────────────────

def test_jobs_id_fk():
    from app.db.models import JOBS_ID_FK
    assert JOBS_ID_FK == "jobs.id"


def test_frame_not_found_constant():
    from app.routers.goes_data import _FRAME_NOT_FOUND
    assert _FRAME_NOT_FOUND == "Frame not found"


def test_collection_not_found_constant():
    from app.routers.goes_data import _COLLECTION_NOT_FOUND
    assert _COLLECTION_NOT_FOUND == "Collection not found"


def test_max_export_limit():
    from app.routers.goes_data import MAX_EXPORT_LIMIT
    assert MAX_EXPORT_LIMIT == 5000


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
