"""Edge case tests for Himawari fetch task — all segments fail, partial failures,
helper function tests, status building.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def himawari_params():
    return {
        "satellite": "Himawari-9",
        "sector": "FLDK",
        "band": "B13",
        "start_time": "2026-03-03T00:00:00+00:00",
        "end_time": "2026-03-03T01:00:00+00:00",
    }


# ---------------------------------------------------------------------------
# _build_final_status tests
# ---------------------------------------------------------------------------


class TestBuildFinalStatus:
    """Tests for the status message builder."""

    def test_all_fetched_no_cap(self):
        from app.tasks.himawari_fetch_task import _build_final_status

        msg, status = _build_final_status(5, 5, 0, False, 100)
        assert status == "completed"
        assert "5" in msg

    def test_zero_fetched_with_available(self):
        from app.tasks.himawari_fetch_task import _build_final_status

        msg, status = _build_final_status(0, 10, 10, False, 100)
        assert status == "failed"
        assert "10" in msg

    def test_zero_fetched_zero_available(self):
        from app.tasks.himawari_fetch_task import _build_final_status

        msg, status = _build_final_status(
            0,
            0,
            0,
            False,
            100,
            satellite="Himawari-9",
            sector="FLDK",
            band="B13",
        )
        assert status == "failed"
        assert "No frames" in msg

    def test_partial_with_failures(self):
        from app.tasks.himawari_fetch_task import _build_final_status

        msg, status = _build_final_status(3, 5, 2, False, 100)
        assert status == "completed_partial"
        assert "3" in msg
        assert "2 failed" in msg

    def test_partial_with_cap(self):
        from app.tasks.himawari_fetch_task import _build_final_status

        msg, status = _build_final_status(5, 10, 0, True, 5)
        assert status == "completed_partial"
        assert "5 beyond" in msg

    def test_partial_with_both_failures_and_cap(self):
        from app.tasks.himawari_fetch_task import _build_final_status

        msg, status = _build_final_status(3, 10, 2, True, 5)
        assert status == "completed_partial"
        assert "2 failed" in msg
        assert "beyond" in msg

    def test_custom_label(self):
        from app.tasks.himawari_fetch_task import _build_final_status

        msg, status = _build_final_status(5, 5, 0, False, 100, label="TrueColor frames")
        assert "TrueColor frames" in msg


# ---------------------------------------------------------------------------
# _collect_timestamps_in_range tests
# ---------------------------------------------------------------------------


class TestCollectTimestampsInRange:
    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    def test_single_day_range(self, mock_list):
        from app.tasks.himawari_fetch_task import _collect_timestamps_in_range

        mock_list.return_value = [
            {"scan_time": "2026-03-03T00:00:00+00:00", "key": "k1", "size": 1000},
            {"scan_time": "2026-03-03T00:10:00+00:00", "key": "k2", "size": 1000},
            {"scan_time": "2026-03-03T12:00:00+00:00", "key": "k3", "size": 1000},
        ]
        start = datetime(2026, 3, 3, 0, 0, tzinfo=UTC)
        end = datetime(2026, 3, 3, 0, 30, tzinfo=UTC)
        result = _collect_timestamps_in_range("FLDK", "B13", start, end)
        # Only first 2 are in range
        assert len(result) == 2

    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    def test_multi_day_range(self, mock_list):
        from app.tasks.himawari_fetch_task import _collect_timestamps_in_range

        def side_effect(sector, band, date):
            if date.day == 3:
                return [{"scan_time": "2026-03-03T23:50:00+00:00", "key": "k1", "size": 1000}]
            elif date.day == 4:
                return [{"scan_time": "2026-03-04T00:10:00+00:00", "key": "k2", "size": 1000}]
            return []

        mock_list.side_effect = side_effect
        start = datetime(2026, 3, 3, 23, 0, tzinfo=UTC)
        end = datetime(2026, 3, 4, 1, 0, tzinfo=UTC)
        result = _collect_timestamps_in_range("FLDK", "B13", start, end)
        assert len(result) == 2

    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    def test_empty_range(self, mock_list):
        from app.tasks.himawari_fetch_task import _collect_timestamps_in_range

        mock_list.return_value = []
        start = datetime(2026, 3, 3, 0, 0, tzinfo=UTC)
        end = datetime(2026, 3, 3, 1, 0, tzinfo=UTC)
        result = _collect_timestamps_in_range("FLDK", "B13", start, end)
        assert result == []


# ---------------------------------------------------------------------------
# _process_single_band_frame tests
# ---------------------------------------------------------------------------


class TestProcessSingleBandFrame:
    @patch("app.tasks.himawari_fetch_task.hsd_to_png")
    @patch("app.tasks.himawari_fetch_task._download_segments_parallel")
    @patch("app.tasks.himawari_fetch_task._list_segments_for_timestamp")
    def test_no_segments_returns_none(self, mock_list, mock_download, mock_hsd):
        from app.tasks.himawari_fetch_task import _process_single_band_frame

        mock_list.return_value = []
        scan_time = datetime(2026, 3, 3, 0, 0, tzinfo=UTC)
        result = _process_single_band_frame("bucket", "Himawari-9", "FLDK", "B13", scan_time, "/tmp")
        assert result is None
        mock_download.assert_not_called()

    @patch("app.tasks.himawari_fetch_task.hsd_to_png")
    @patch("app.tasks.himawari_fetch_task._download_segments_parallel")
    @patch("app.tasks.himawari_fetch_task._list_segments_for_timestamp")
    def test_all_downloads_fail_returns_none(self, mock_list, mock_download, mock_hsd):
        from app.tasks.himawari_fetch_task import _process_single_band_frame

        mock_list.return_value = [f"seg_{i}" for i in range(10)]
        mock_download.return_value = [b""] * 10
        scan_time = datetime(2026, 3, 3, 0, 0, tzinfo=UTC)
        result = _process_single_band_frame("bucket", "Himawari-9", "FLDK", "B13", scan_time, "/tmp")
        assert result is None
        mock_hsd.assert_not_called()

    @patch("app.tasks.himawari_fetch_task.hsd_to_png")
    @patch("app.tasks.himawari_fetch_task._download_segments_parallel")
    @patch("app.tasks.himawari_fetch_task._list_segments_for_timestamp")
    def test_partial_success_still_processes(self, mock_list, mock_download, mock_hsd, tmp_path):
        from app.tasks.himawari_fetch_task import _process_single_band_frame

        mock_list.return_value = [f"seg_{i}" for i in range(10)]
        mock_download.return_value = [b"data"] * 7 + [b""] * 3
        mock_hsd.return_value = Path("/tmp/test.png")
        scan_time = datetime(2026, 3, 3, 0, 0, tzinfo=UTC)
        result = _process_single_band_frame("bucket", "Himawari-9", "FLDK", "B13", scan_time, str(tmp_path))
        assert result is not None
        assert result["band"] == "B13"
        mock_hsd.assert_called_once()


# ---------------------------------------------------------------------------
# _handle_no_timestamps tests
# ---------------------------------------------------------------------------


class TestHandleNoTimestamps:
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    def test_sets_failed_status(self, mock_update, mock_progress):
        from app.tasks.himawari_fetch_task import _handle_no_timestamps

        _log = MagicMock()
        _handle_no_timestamps(
            "job-1",
            "Himawari-9",
            "FLDK",
            "B13",
            datetime(2026, 3, 3, tzinfo=UTC),
            datetime(2026, 3, 3, 1, 0, tzinfo=UTC),
            _log,
        )
        mock_update.assert_called_once()
        assert mock_update.call_args[1]["status"] == "failed"
        _log.assert_called_once()


# ---------------------------------------------------------------------------
# _finalize_job tests
# ---------------------------------------------------------------------------


class TestFinalizeJob:
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    def test_completed_status(self, mock_update, mock_progress):
        from app.tasks.himawari_fetch_task import _finalize_job

        _log = MagicMock()
        _finalize_job("job-1", "/tmp/out", "Fetched 5 frames", "completed", _log)
        assert mock_update.call_args[1]["status"] == "completed"
        assert "error" not in mock_update.call_args[1]

    @patch("app.tasks.himawari_fetch_task._publish_progress")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    def test_partial_status_includes_error(self, mock_update, mock_progress):
        from app.tasks.himawari_fetch_task import _finalize_job

        _log = MagicMock()
        _finalize_job("job-1", "/tmp/out", "Fetched 3 (2 failed)", "completed_partial", _log)
        assert mock_update.call_args[1]["status"] == "completed_partial"
        assert mock_update.call_args[1]["error"] == "Fetched 3 (2 failed)"


# ---------------------------------------------------------------------------
# Full integration: all segments fail in execute
# ---------------------------------------------------------------------------


class TestAllSegmentsFailInExecute:
    @patch("app.tasks.himawari_fetch_task._create_himawari_fetch_records")
    @patch("app.tasks.himawari_fetch_task.hsd_to_png")
    @patch("app.tasks.himawari_fetch_task._download_segments_parallel")
    @patch("app.tasks.himawari_fetch_task._list_segments_for_timestamp")
    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_all_timestamps_fail_downloads(
        self,
        mock_progress,
        mock_update,
        mock_timestamps,
        mock_list_segs,
        mock_download,
        mock_hsd,
        mock_records,
        himawari_params,
        tmp_path,
    ):
        """Every timestamp's segments fail -> final status is 'failed'."""
        from app.tasks.himawari_fetch_task import _execute_himawari_fetch

        mock_timestamps.return_value = [
            {"scan_time": "2026-03-03T00:00:00+00:00", "key": "k1", "size": 1000},
            {"scan_time": "2026-03-03T00:10:00+00:00", "key": "k2", "size": 1000},
            {"scan_time": "2026-03-03T00:20:00+00:00", "key": "k3", "size": 1000},
        ]
        mock_list_segs.return_value = [f"seg_{i}" for i in range(10)]
        mock_download.return_value = [b""] * 10  # all fail

        _log = MagicMock()
        with patch("app.tasks.himawari_fetch_task.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            with patch("app.tasks.himawari_fetch_task._read_max_frames_setting", return_value=200):
                _execute_himawari_fetch("job-1", himawari_params, _log)

        final_update = mock_update.call_args_list[-1]
        assert final_update[1]["status"] == "failed"
        assert "3" in final_update[1]["status_message"]  # "All 3 frames failed"
        mock_records.assert_not_called()

    @patch("app.tasks.himawari_fetch_task._create_himawari_fetch_records")
    @patch("app.tasks.himawari_fetch_task.hsd_to_png")
    @patch("app.tasks.himawari_fetch_task._download_segments_parallel")
    @patch("app.tasks.himawari_fetch_task._list_segments_for_timestamp")
    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_partial_failure_with_enough_to_proceed(
        self,
        mock_progress,
        mock_update,
        mock_timestamps,
        mock_list_segs,
        mock_download,
        mock_hsd,
        mock_records,
        himawari_params,
        tmp_path,
    ):
        """2 of 3 timestamps succeed -> status is 'completed_partial'."""
        from app.tasks.himawari_fetch_task import _execute_himawari_fetch

        call_count = [0]

        def download_side_effect(bucket, keys):
            call_count[0] += 1
            if call_count[0] == 2:
                return [b""] * 10  # Second timestamp fails
            return [b"data"] * 10

        mock_timestamps.return_value = [
            {"scan_time": f"2026-03-03T00:{i * 10:02d}:00+00:00", "key": f"k{i}", "size": 1000} for i in range(3)
        ]
        mock_list_segs.return_value = [f"seg_{i}" for i in range(10)]
        mock_download.side_effect = download_side_effect
        mock_hsd.return_value = Path("/tmp/test.png")

        _log = MagicMock()
        with patch("app.tasks.himawari_fetch_task.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            with patch("app.tasks.himawari_fetch_task._read_max_frames_setting", return_value=200):
                _execute_himawari_fetch("job-1", himawari_params, _log)

        final_update = mock_update.call_args_list[-1]
        assert final_update[1]["status"] == "completed_partial"
        assert "2" in final_update[1]["status_message"]  # "Fetched 2 frames"
        assert "1 failed" in final_update[1]["status_message"]
        mock_records.assert_called_once()

    @patch("app.tasks.himawari_fetch_task._create_himawari_fetch_records")
    @patch("app.tasks.himawari_fetch_task.hsd_to_png")
    @patch("app.tasks.himawari_fetch_task._download_segments_parallel")
    @patch("app.tasks.himawari_fetch_task._list_segments_for_timestamp")
    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_hsd_to_png_exception_counts_as_failure(
        self,
        mock_progress,
        mock_update,
        mock_timestamps,
        mock_list_segs,
        mock_download,
        mock_hsd,
        mock_records,
        himawari_params,
        tmp_path,
    ):
        """hsd_to_png raising an exception should count as a failed frame."""
        from app.tasks.himawari_fetch_task import _execute_himawari_fetch

        mock_timestamps.return_value = [
            {"scan_time": "2026-03-03T00:00:00+00:00", "key": "k1", "size": 1000},
        ]
        mock_list_segs.return_value = [f"seg_{i}" for i in range(10)]
        mock_download.return_value = [b"data"] * 10
        mock_hsd.side_effect = ValueError("Corrupt segment data")

        _log = MagicMock()
        with patch("app.tasks.himawari_fetch_task.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            with patch("app.tasks.himawari_fetch_task._read_max_frames_setting", return_value=200):
                _execute_himawari_fetch("job-1", himawari_params, _log)

        final_update = mock_update.call_args_list[-1]
        assert final_update[1]["status"] == "failed"
        mock_records.assert_not_called()

    @patch("app.tasks.himawari_fetch_task._create_himawari_fetch_records")
    @patch("app.tasks.himawari_fetch_task.hsd_to_png")
    @patch("app.tasks.himawari_fetch_task._download_segments_parallel")
    @patch("app.tasks.himawari_fetch_task._list_segments_for_timestamp")
    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_no_segment_keys_counts_as_failure(
        self,
        mock_progress,
        mock_update,
        mock_timestamps,
        mock_list_segs,
        mock_download,
        mock_hsd,
        mock_records,
        himawari_params,
        tmp_path,
    ):
        """No segment keys found for a timestamp -> counts as a failure."""
        from app.tasks.himawari_fetch_task import _execute_himawari_fetch

        mock_timestamps.return_value = [
            {"scan_time": "2026-03-03T00:00:00+00:00", "key": "k1", "size": 1000},
        ]
        mock_list_segs.return_value = []  # No segments

        _log = MagicMock()
        with patch("app.tasks.himawari_fetch_task.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            with patch("app.tasks.himawari_fetch_task._read_max_frames_setting", return_value=200):
                _execute_himawari_fetch("job-1", himawari_params, _log)

        final_update = mock_update.call_args_list[-1]
        assert final_update[1]["status"] == "failed"
