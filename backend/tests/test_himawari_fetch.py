"""Tests for Himawari fetch task (PR 4)."""
from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_redis():
    with patch("app.tasks.helpers._get_redis") as m:
        redis_mock = MagicMock()
        m.return_value = redis_mock
        yield redis_mock


@pytest.fixture
def mock_sync_db():
    with patch("app.tasks.helpers._get_sync_db") as m:
        session = MagicMock()
        m.return_value = session
        yield session


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
# _list_segments_for_timestamp
# ---------------------------------------------------------------------------

class TestListSegments:
    @patch("app.tasks.himawari_fetch_task._retry_s3_operation")
    @patch("app.tasks.himawari_fetch_task._get_s3_client")
    def test_lists_and_sorts_segments(self, mock_client, mock_retry):
        """Should list S3 keys and sort by segment number."""
        from app.tasks.himawari_fetch_task import _list_segments_for_timestamp

        # The retry wrapper just calls the function
        def run_fn(fn, **kwargs):
            return fn()

        mock_retry.side_effect = run_fn

        mock_paginator = MagicMock()
        mock_client.return_value.get_paginator.return_value = mock_paginator

        # Return keys for segments 3, 1, 2
        mock_paginator.paginate.return_value = [
            {
                "Contents": [
                    {"Key": "AHI-L1b-FLDK/2026/03/03/0000/HS_H09_20260303_0000_B13_FLDK_R20_S0310.DAT.bz2"},
                    {"Key": "AHI-L1b-FLDK/2026/03/03/0000/HS_H09_20260303_0000_B13_FLDK_R20_S0110.DAT.bz2"},
                    {"Key": "AHI-L1b-FLDK/2026/03/03/0000/HS_H09_20260303_0000_B13_FLDK_R20_S0210.DAT.bz2"},
                    # A different band — should be excluded
                    {"Key": "AHI-L1b-FLDK/2026/03/03/0000/HS_H09_20260303_0000_B01_FLDK_R10_S0110.DAT.bz2"},
                ]
            }
        ]

        scan_time = datetime(2026, 3, 3, 0, 0, tzinfo=UTC)
        keys = _list_segments_for_timestamp("noaa-himawari9", "FLDK", "B13", scan_time)

        # Should have 3 B13 keys, sorted by segment
        assert len(keys) == 3
        assert "S01" in keys[0]
        assert "S02" in keys[1]
        assert "S03" in keys[2]


# ---------------------------------------------------------------------------
# _download_segments_parallel
# ---------------------------------------------------------------------------

class TestDownloadSegmentsParallel:
    @patch("app.tasks.himawari_fetch_task._download_segment")
    def test_downloads_all_segments(self, mock_download):
        """Should download all segments and return in order."""
        from app.tasks.himawari_fetch_task import _download_segments_parallel

        mock_download.side_effect = lambda bucket, key: f"data_{key}".encode()
        keys = [f"key_{i}" for i in range(10)]

        results = _download_segments_parallel("bucket", keys)

        assert len(results) == 10
        assert results[0] == b"data_key_0"
        assert results[9] == b"data_key_9"

    @patch("app.tasks.himawari_fetch_task._download_segment")
    def test_partial_failure_returns_empty_bytes(self, mock_download):
        """Failed segments should produce empty bytes."""
        from app.tasks.himawari_fetch_task import _download_segments_parallel

        def side_effect(bucket, key):
            if "3" in key:
                raise ConnectionError("S3 timeout")
            return f"data_{key}".encode()

        mock_download.side_effect = side_effect
        keys = [f"key_{i}" for i in range(5)]

        results = _download_segments_parallel("bucket", keys)

        assert len(results) == 5
        assert results[3] == b""  # Failed segment
        assert results[0] == b"data_key_0"
        assert results[4] == b"data_key_4"


# ---------------------------------------------------------------------------
# _create_himawari_fetch_records
# ---------------------------------------------------------------------------

class TestCreateHimawariFetchRecords:
    @patch("app.tasks.himawari_fetch_task._get_sync_db")
    def test_creates_collection_and_frames(self, mock_db, tmp_path):
        """Should create Collection, GoesFrame, and Image records."""
        from app.tasks.himawari_fetch_task import _create_himawari_fetch_records

        session = MagicMock()
        mock_db.return_value = session
        session.query.return_value.filter.return_value.first.return_value = None

        # Create a fake image file
        img_path = tmp_path / "test.png"
        img_path.write_bytes(b"\x89PNG\r\n" + b"\x00" * 100)

        with patch("app.services.thumbnail.generate_thumbnail", return_value=str(tmp_path / "thumb.png")), \
             patch("app.services.thumbnail.get_image_dimensions", return_value=(5500, 5500)):
            _create_himawari_fetch_records(
                "job-1",
                "FLDK",
                str(tmp_path),
                [
                    {
                        "satellite": "Himawari-9",
                        "band": "B13",
                        "scan_time": datetime(2026, 3, 3, 0, 0, tzinfo=UTC),
                        "path": str(img_path),
                    }
                ],
            )

        # Should commit with Collection + Image + GoesFrame + CollectionFrame
        session.add.assert_called()
        session.flush.assert_called_once()
        session.commit.assert_called_once()

        # Check we added the right number of records (Collection + Image + GoesFrame + CollectionFrame)
        assert session.add.call_count == 4


# ---------------------------------------------------------------------------
# _execute_himawari_fetch
# ---------------------------------------------------------------------------

class TestExecuteHimawariFetch:
    @patch("app.tasks.himawari_fetch_task._create_himawari_fetch_records")
    @patch("app.tasks.himawari_fetch_task.hsd_to_png")
    @patch("app.tasks.himawari_fetch_task._download_segments_parallel")
    @patch("app.tasks.himawari_fetch_task._list_segments_for_timestamp")
    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_full_fetch_success(
        self, mock_progress, mock_update, mock_timestamps,
        mock_list_segs, mock_download, mock_hsd, mock_records,
        himawari_params, tmp_path,
    ):
        """Happy path: finds timestamps, downloads segments, creates records."""
        from app.tasks.himawari_fetch_task import _execute_himawari_fetch

        mock_timestamps.return_value = [
            {"scan_time": "2026-03-03T00:00:00+00:00", "key": "k1", "size": 1000},
            {"scan_time": "2026-03-03T00:10:00+00:00", "key": "k2", "size": 1000},
        ]
        mock_list_segs.return_value = [f"seg_{i}" for i in range(10)]
        mock_download.return_value = [b"data"] * 10
        mock_hsd.return_value = Path("/tmp/test.png")

        _log = MagicMock()

        with patch("app.tasks.himawari_fetch_task.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            with patch("app.tasks.himawari_fetch_task._read_max_frames_setting", return_value=200):
                _execute_himawari_fetch("job-1", himawari_params, _log)

        # Should have processed 2 timestamps
        assert mock_hsd.call_count == 2
        mock_records.assert_called_once()
        # Final status should be completed
        final_update = mock_update.call_args_list[-1]
        assert final_update[1]["status"] == "completed"

    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_no_timestamps_found(
        self, mock_progress, mock_update, mock_timestamps,
        himawari_params, tmp_path,
    ):
        """Should report failure when no timestamps exist."""
        from app.tasks.himawari_fetch_task import _execute_himawari_fetch

        mock_timestamps.return_value = []
        _log = MagicMock()

        with patch("app.tasks.himawari_fetch_task.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            _execute_himawari_fetch("job-1", himawari_params, _log)

        final_update = mock_update.call_args_list[-1]
        assert final_update[1]["status"] == "failed"

    @patch("app.tasks.himawari_fetch_task._create_himawari_fetch_records")
    @patch("app.tasks.himawari_fetch_task.hsd_to_png")
    @patch("app.tasks.himawari_fetch_task._download_segments_parallel")
    @patch("app.tasks.himawari_fetch_task._list_segments_for_timestamp")
    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_respects_max_frames_limit(
        self, mock_progress, mock_update, mock_timestamps,
        mock_list_segs, mock_download, mock_hsd, mock_records,
        himawari_params, tmp_path,
    ):
        """Should cap the number of frames to max_frames_per_fetch."""
        from app.tasks.himawari_fetch_task import _execute_himawari_fetch

        # Return 5 timestamps, but limit to 2
        mock_timestamps.return_value = [
            {"scan_time": f"2026-03-03T00:{i*10:02d}:00+00:00", "key": f"k{i}", "size": 1000}
            for i in range(5)
        ]
        mock_list_segs.return_value = [f"seg_{i}" for i in range(10)]
        mock_download.return_value = [b"data"] * 10
        mock_hsd.return_value = Path("/tmp/test.png")

        _log = MagicMock()

        with patch("app.tasks.himawari_fetch_task.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            with patch("app.tasks.himawari_fetch_task._read_max_frames_setting", return_value=2):
                _execute_himawari_fetch("job-1", himawari_params, _log)

        # Only 2 frames should be processed
        assert mock_hsd.call_count == 2
        # Status should indicate partial
        final_update = mock_update.call_args_list[-1]
        assert final_update[1]["status"] == "completed_partial"

    @patch("app.tasks.himawari_fetch_task._create_himawari_fetch_records")
    @patch("app.tasks.himawari_fetch_task.hsd_to_png")
    @patch("app.tasks.himawari_fetch_task._download_segments_parallel")
    @patch("app.tasks.himawari_fetch_task._list_segments_for_timestamp")
    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_partial_segment_failure(
        self, mock_progress, mock_update, mock_timestamps,
        mock_list_segs, mock_download, mock_hsd, mock_records,
        himawari_params, tmp_path,
    ):
        """Should handle partial segment failures gracefully."""
        from app.tasks.himawari_fetch_task import _execute_himawari_fetch

        mock_timestamps.return_value = [
            {"scan_time": "2026-03-03T00:00:00+00:00", "key": "k1", "size": 1000},
        ]
        mock_list_segs.return_value = [f"seg_{i}" for i in range(10)]
        # Return data with some empty segments
        mock_download.return_value = [b"data"] * 7 + [b""] * 3
        mock_hsd.return_value = Path("/tmp/test.png")

        _log = MagicMock()

        with patch("app.tasks.himawari_fetch_task.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            with patch("app.tasks.himawari_fetch_task._read_max_frames_setting", return_value=200):
                _execute_himawari_fetch("job-1", himawari_params, _log)

        # Should still produce an image (hsd_to_png handles missing segments)
        mock_hsd.assert_called_once()
        mock_records.assert_called_once()

    @patch("app.tasks.himawari_fetch_task.hsd_to_png")
    @patch("app.tasks.himawari_fetch_task._download_segments_parallel")
    @patch("app.tasks.himawari_fetch_task._list_segments_for_timestamp")
    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_all_downloads_fail(
        self, mock_progress, mock_update, mock_timestamps,
        mock_list_segs, mock_download, mock_hsd,
        himawari_params, tmp_path,
    ):
        """Should report failure when all downloads fail."""
        from app.tasks.himawari_fetch_task import _execute_himawari_fetch

        mock_timestamps.return_value = [
            {"scan_time": "2026-03-03T00:00:00+00:00", "key": "k1", "size": 1000},
        ]
        mock_list_segs.return_value = [f"seg_{i}" for i in range(10)]
        # All segments fail
        mock_download.return_value = [b""] * 10

        _log = MagicMock()

        with patch("app.tasks.himawari_fetch_task.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            with patch("app.tasks.himawari_fetch_task._read_max_frames_setting", return_value=200):
                _execute_himawari_fetch("job-1", himawari_params, _log)

        final_update = mock_update.call_args_list[-1]
        assert final_update[1]["status"] == "failed"

    @patch("app.tasks.himawari_fetch_task._create_himawari_fetch_records")
    @patch("app.tasks.himawari_fetch_task.hsd_to_png", side_effect=Exception("corrupt data"))
    @patch("app.tasks.himawari_fetch_task._download_segments_parallel")
    @patch("app.tasks.himawari_fetch_task._list_segments_for_timestamp")
    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_processing_error_counts_as_failure(
        self, mock_progress, mock_update, mock_timestamps,
        mock_list_segs, mock_download, mock_hsd, mock_records,
        himawari_params, tmp_path,
    ):
        """hsd_to_png failure should count as a failed download."""
        from app.tasks.himawari_fetch_task import _execute_himawari_fetch

        mock_timestamps.return_value = [
            {"scan_time": "2026-03-03T00:00:00+00:00", "key": "k1", "size": 1000},
        ]
        mock_list_segs.return_value = [f"seg_{i}" for i in range(10)]
        mock_download.return_value = [b"data"] * 10

        _log = MagicMock()

        with patch("app.tasks.himawari_fetch_task.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            with patch("app.tasks.himawari_fetch_task._read_max_frames_setting", return_value=200):
                _execute_himawari_fetch("job-1", himawari_params, _log)

        final_update = mock_update.call_args_list[-1]
        assert final_update[1]["status"] == "failed"
        mock_records.assert_not_called()


# ---------------------------------------------------------------------------
# Celery task (fetch_himawari_data)
# ---------------------------------------------------------------------------

class TestFetchHimawariDataTask:
    @patch("app.tasks.himawari_fetch_task._execute_himawari_fetch")
    @patch("app.tasks.himawari_fetch_task._make_job_logger")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_task_calls_execute(self, mock_progress, mock_update, mock_logger, mock_execute, himawari_params):
        """Task should call _execute_himawari_fetch."""
        from app.tasks.himawari_fetch_task import fetch_himawari_data

        mock_logger.return_value = MagicMock()
        fetch_himawari_data("job-1", himawari_params)

        mock_execute.assert_called_once()

    @patch("app.tasks.himawari_fetch_task._execute_himawari_fetch", side_effect=ConnectionError("boom"))
    @patch("app.tasks.himawari_fetch_task._make_job_logger")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_task_handles_failure(self, mock_progress, mock_update, mock_logger, mock_execute, himawari_params):
        """Task should update job status on failure and re-raise."""
        from app.tasks.himawari_fetch_task import fetch_himawari_data

        mock_logger.return_value = MagicMock()
        with pytest.raises(ConnectionError):
            fetch_himawari_data("job-1", himawari_params)

        # Should have set status to failed
        failed_call = [c for c in mock_update.call_args_list if c[1].get("status") == "failed"]
        assert len(failed_call) == 1


# ---------------------------------------------------------------------------
# Router dispatch (fetch endpoint → Himawari task)
# ---------------------------------------------------------------------------

class TestFetchEndpointDispatch:
    """Verify that the fetch endpoint dispatches to the correct task based on satellite type."""

    def test_himawari_satellite_detected_by_format(self):
        """SATELLITE_REGISTRY should identify Himawari-9 as HSD format."""
        from app.services.satellite_registry import SATELLITE_REGISTRY

        assert SATELLITE_REGISTRY["Himawari-9"].format == "hsd"
        assert SATELLITE_REGISTRY["GOES-18"].format == "netcdf"

    def test_dispatch_logic_selects_himawari_for_hsd(self):
        """The dispatch logic should select Himawari task for HSD satellites."""
        from app.services.satellite_registry import SATELLITE_REGISTRY

        satellite = "Himawari-9"
        sat_config = SATELLITE_REGISTRY.get(satellite)
        assert sat_config is not None
        assert sat_config.format == "hsd"

    def test_dispatch_logic_selects_goes_for_netcdf(self):
        """The dispatch logic should select GOES task for NetCDF satellites."""
        from app.services.satellite_registry import SATELLITE_REGISTRY

        for sat_name in ["GOES-16", "GOES-18", "GOES-19"]:
            sat_config = SATELLITE_REGISTRY.get(sat_name)
            assert sat_config is not None
            assert sat_config.format == "netcdf"

    def test_himawari_is_fetchable(self):
        """Himawari-9 should be marked as fetchable in the registry."""
        from app.services.satellite_registry import SATELLITE_REGISTRY

        assert SATELLITE_REGISTRY["Himawari-9"].fetchable is True


# ---------------------------------------------------------------------------
# Progress reporting
# ---------------------------------------------------------------------------

class TestProgressReporting:
    @patch("app.tasks.himawari_fetch_task._create_himawari_fetch_records")
    @patch("app.tasks.himawari_fetch_task.hsd_to_png")
    @patch("app.tasks.himawari_fetch_task._download_segments_parallel")
    @patch("app.tasks.himawari_fetch_task._list_segments_for_timestamp")
    @patch("app.tasks.himawari_fetch_task.list_himawari_timestamps")
    @patch("app.tasks.himawari_fetch_task._update_job_db")
    @patch("app.tasks.himawari_fetch_task._publish_progress")
    def test_progress_reported_for_each_frame(
        self, mock_progress, mock_update, mock_timestamps,
        mock_list_segs, mock_download, mock_hsd, mock_records,
        himawari_params, tmp_path,
    ):
        """Progress should be published for each frame being processed."""
        from app.tasks.himawari_fetch_task import _execute_himawari_fetch

        mock_timestamps.return_value = [
            {"scan_time": f"2026-03-03T00:{i*10:02d}:00+00:00", "key": f"k{i}", "size": 1000}
            for i in range(3)
        ]
        mock_list_segs.return_value = [f"seg_{i}" for i in range(10)]
        mock_download.return_value = [b"data"] * 10
        mock_hsd.return_value = Path("/tmp/test.png")

        _log = MagicMock()

        with patch("app.tasks.himawari_fetch_task.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)
            with patch("app.tasks.himawari_fetch_task._read_max_frames_setting", return_value=200):
                _execute_himawari_fetch("job-1", himawari_params, _log)

        # Progress should be published for each frame + final
        progress_calls = mock_progress.call_args_list
        assert len(progress_calls) >= 4  # 3 frames + 1 final

        # Final progress should be 100
        final = progress_calls[-1]
        assert final[0][1] == 100  # progress=100
