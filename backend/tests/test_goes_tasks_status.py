"""Tests for _build_status_message and other extracted helpers in goes_tasks."""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest


class TestBuildStatusMessage:
    """Test all branches of _build_status_message."""

    def _call(self, fetched=1, total=1, capped=False, failed=0, max_frames=200):
        from app.tasks.goes_tasks import _build_status_message
        return _build_status_message(
            satellite="GOES-16", sector="FullDisk", band="C02",
            start_time=datetime(2026, 1, 1, tzinfo=UTC),
            end_time=datetime(2026, 1, 1, 1, tzinfo=UTC),
            fetched_count=fetched, total_available=total,
            was_capped=capped, failed_downloads=failed,
            max_frames_limit=max_frames,
        )

    def test_no_frames_found(self):
        msg, status = self._call(fetched=0, total=0)
        assert status == "failed"
        assert "No frames found" in msg

    def test_all_downloads_failed(self):
        msg, status = self._call(fetched=0, total=5)
        assert status == "failed"
        assert "failed to download" in msg

    def test_all_success_no_cap(self):
        msg, status = self._call(fetched=5, total=5)
        assert status == "completed"
        assert "Fetched 5 frames" in msg

    def test_capped_no_failures(self):
        msg, status = self._call(fetched=200, total=500, capped=True)
        assert status == "completed_partial"
        assert "frame limit" in msg

    def test_some_failed_no_cap(self):
        msg, status = self._call(fetched=7, total=10, failed=3)
        assert status == "completed_partial"
        assert "3 failed" in msg

    def test_capped_and_failed(self):
        msg, status = self._call(fetched=190, total=500, capped=True, failed=10)
        assert status == "completed_partial"
        assert "failed" in msg
        assert "beyond frame limit" in msg


class TestMakeJobLogger:
    """Test _make_job_logger."""

    @patch("app.tasks.goes_tasks._get_redis")
    @patch("app.tasks.goes_tasks._get_sync_db")
    @patch("app.tasks.goes_tasks.log_job_sync")
    def test_logs_without_error(self, mock_log, mock_db, mock_redis):
        from app.tasks.goes_tasks import _make_job_logger
        mock_db.return_value = MagicMock()
        _log = _make_job_logger("job-1")
        _log("test message", "info")
        mock_log.assert_called_once()

    @patch("app.tasks.goes_tasks._get_redis")
    @patch("app.tasks.goes_tasks._get_sync_db")
    @patch("app.tasks.goes_tasks.log_job_sync", side_effect=Exception("fail"))
    def test_handles_log_failure(self, mock_log, mock_db, mock_redis):
        from app.tasks.goes_tasks import _make_job_logger
        mock_db.return_value = MagicMock()
        _log = _make_job_logger("job-1")
        # Should not raise
        _log("test message")


class TestReadMaxFramesSetting:
    """Test _read_max_frames_setting edge cases."""

    @patch("app.tasks.goes_tasks._get_sync_db")
    def test_returns_default_when_no_setting(self, mock_db):
        from app.tasks.goes_tasks import _read_max_frames_setting
        session = MagicMock()
        session.query.return_value.filter.return_value.first.return_value = None
        mock_db.return_value = session
        assert _read_max_frames_setting() == 200

    @patch("app.tasks.goes_tasks._get_sync_db")
    def test_returns_custom_value(self, mock_db):
        from app.tasks.goes_tasks import _read_max_frames_setting
        session = MagicMock()
        setting = MagicMock()
        setting.value = 500
        session.query.return_value.filter.return_value.first.return_value = setting
        mock_db.return_value = session
        assert _read_max_frames_setting() == 500

    @patch("app.tasks.goes_tasks._get_sync_db")
    def test_returns_default_on_exception(self, mock_db):
        from app.tasks.goes_tasks import _read_max_frames_setting
        mock_db.return_value = MagicMock()
        mock_db.return_value.query.side_effect = Exception("db error")
        assert _read_max_frames_setting() == 200


class TestFillSingleGap:
    """Test _fill_single_gap helper."""

    @patch("app.tasks.goes_tasks._create_backfill_image_records")
    @patch("app.services.goes_fetcher.fetch_frames")
    def test_returns_frame_count(self, mock_fetch, mock_create):
        from app.tasks.goes_tasks import _fill_single_gap
        mock_fetch.return_value = {
            "frames": [{"path": "/tmp/a.png"}],
            "total_available": 1,
            "capped": False,
            "attempted": 1,
            "failed_downloads": 0,
        }
        gap = {"start": "2026-01-01T00:00:00", "end": "2026-01-01T01:00:00"}
        count = _fill_single_gap(gap, 0, "GOES-16", "FullDisk", "C02", "/tmp/out")
        assert count == 1
        mock_create.assert_called_once()

    @patch("app.tasks.goes_tasks._create_backfill_image_records")
    @patch("app.services.goes_fetcher.fetch_frames")
    def test_logs_warning_on_cap(self, mock_fetch, mock_create):
        from app.tasks.goes_tasks import _fill_single_gap
        mock_fetch.return_value = {
            "frames": [{"path": "/tmp/a.png"}] * 3,
            "total_available": 10,
            "capped": True,
            "attempted": 3,
            "failed_downloads": 0,
        }
        gap = {"start": "2026-01-01T00:00:00", "end": "2026-01-01T01:00:00"}
        count = _fill_single_gap(gap, 0, "GOES-16", "FullDisk", "C02", "/tmp/out")
        assert count == 3
