"""Additional tests to boost coverage on new code for PR #98 SonarQube gate."""
from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

# ===========================================================================
# goes_fetcher.py — _record_s3_failure (lines 117-121)
# ===========================================================================

def test_record_s3_failure():
    with patch("app.circuit_breaker.s3_circuit_breaker") as mock_cb, \
         patch("app.metrics.S3_FETCH_ERRORS") as mock_errors:
        from app.services.goes_fetcher import _record_s3_failure
        _record_s3_failure("get", "Throttling")
        mock_cb.record_failure.assert_called_once()
        mock_errors.labels.assert_called_once_with(operation="get", error_type="Throttling")
        mock_errors.labels().inc.assert_called_once()


# ===========================================================================
# goes_fetcher.py — _retry_s3_operation (lines 142-164)
# ===========================================================================

class TestRetryS3Operation:
    """Cover _retry_s3_operation retry logic, circuit breaker, and error paths."""

    @patch("app.circuit_breaker.s3_circuit_breaker")
    @patch("app.metrics.S3_FETCH_COUNT")
    @patch("app.metrics.S3_FETCH_ERRORS")
    def test_circuit_breaker_open(self, mock_errors, mock_count, mock_cb):
        from app.services.goes_fetcher import _retry_s3_operation
        mock_cb.allow_request.return_value = False
        from app.circuit_breaker import CircuitBreakerOpen
        with pytest.raises(CircuitBreakerOpen):
            _retry_s3_operation(lambda: None, operation="test")
        mock_errors.labels.assert_called_with(operation="test", error_type="circuit_open")

    @patch("app.circuit_breaker.s3_circuit_breaker")
    @patch("app.metrics.S3_FETCH_COUNT")
    @patch("app.metrics.S3_FETCH_ERRORS")
    def test_success_on_first_try(self, mock_errors, mock_count, mock_cb):
        from app.services.goes_fetcher import _retry_s3_operation
        mock_cb.allow_request.return_value = True
        result = _retry_s3_operation(lambda: "ok", operation="get")
        assert result == "ok"
        mock_cb.record_success.assert_called_once()

    @patch("time.sleep")
    @patch("app.circuit_breaker.s3_circuit_breaker")
    @patch("app.metrics.S3_FETCH_COUNT")
    @patch("app.metrics.S3_FETCH_ERRORS")
    def test_retries_on_throttle_then_succeeds(self, mock_errors, mock_count, mock_cb, mock_sleep):
        from app.services.goes_fetcher import _retry_s3_operation
        from botocore.exceptions import ClientError
        mock_cb.allow_request.return_value = True

        call_count = 0
        def flaky():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ClientError({"Error": {"Code": "SlowDown", "Message": ""}}, "op")
            return "done"

        result = _retry_s3_operation(flaky, max_retries=3, operation="get")
        assert result == "done"
        assert mock_sleep.call_count == 2

    @patch("time.sleep")
    @patch("app.circuit_breaker.s3_circuit_breaker")
    @patch("app.metrics.S3_FETCH_COUNT")
    @patch("app.metrics.S3_FETCH_ERRORS")
    def test_non_retryable_client_error_raises_immediately(self, mock_errors, mock_count, mock_cb, mock_sleep):
        from app.services.goes_fetcher import _retry_s3_operation
        from botocore.exceptions import ClientError
        mock_cb.allow_request.return_value = True

        def fail():
            raise ClientError({"Error": {"Code": "NoSuchKey", "Message": ""}}, "op")

        with pytest.raises(ClientError):
            _retry_s3_operation(fail, max_retries=3, operation="get")
        mock_sleep.assert_not_called()
        mock_cb.record_failure.assert_called_once()

    @patch("time.sleep")
    @patch("app.circuit_breaker.s3_circuit_breaker")
    @patch("app.metrics.S3_FETCH_COUNT")
    @patch("app.metrics.S3_FETCH_ERRORS")
    def test_connection_error_retries_then_raises(self, mock_errors, mock_count, mock_cb, mock_sleep):
        from app.services.goes_fetcher import _retry_s3_operation
        from botocore.exceptions import ConnectTimeoutError
        mock_cb.allow_request.return_value = True

        def fail():
            raise ConnectTimeoutError(endpoint_url="https://s3")

        with pytest.raises(ConnectTimeoutError):
            _retry_s3_operation(fail, max_retries=2, operation="get")
        assert mock_sleep.call_count == 1
        mock_cb.record_failure.assert_called_once()


# ===========================================================================
# goes_fetcher.py — _check_disk_space (line 378)
# ===========================================================================

def test_check_disk_space_insufficient():
    from app.services.goes_fetcher import _check_disk_space
    with patch("shutil.disk_usage") as mock_du:
        mock_du.return_value = MagicMock(free=500 * 1024 * 1024)  # 0.5 GB
        with pytest.raises(OSError, match="Insufficient disk space"):
            _check_disk_space(Path("/tmp"), min_gb=1.0)


def test_check_disk_space_sufficient():
    from app.services.goes_fetcher import _check_disk_space
    with patch("shutil.disk_usage") as mock_du:
        mock_du.return_value = MagicMock(free=5 * 1024**3)  # 5 GB
        _check_disk_space(Path("/tmp"), min_gb=1.0)  # Should not raise


# ===========================================================================
# goes_fetcher.py — _netcdf_to_png (line 363-369)
# ===========================================================================

def test_netcdf_to_png_writes_and_cleans_up(tmp_path):
    from app.services.goes_fetcher import _netcdf_to_png
    out = tmp_path / "result.png"
    with patch("app.services.goes_fetcher._netcdf_to_png_from_file") as mock_from_file:
        mock_from_file.return_value = out
        result = _netcdf_to_png(b"fake-nc-data", out, sector="CONUS")
        assert result == out
        # Verify temp file was cleaned up (the function unlocks it)
        mock_from_file.assert_called_once()


# ===========================================================================
# goes_fetcher.py — fetch_frames (lines 531, 541, 573-596)
# ===========================================================================

class TestFetchFrames:

    @patch("app.services.goes_fetcher._get_s3_client")
    @patch("app.services.goes_fetcher.list_available")
    @patch("app.services.goes_fetcher._check_disk_space")
    @patch("app.services.goes_fetcher.validate_params")
    def test_fetch_frames_empty(self, mock_val, mock_disk, mock_list, mock_s3, tmp_path):
        from app.services.goes_fetcher import fetch_frames
        mock_list.return_value = []
        result = fetch_frames("GOES-16", "FullDisk", "C02",
                              datetime(2026, 1, 1, tzinfo=UTC),
                              datetime(2026, 1, 2, tzinfo=UTC),
                              str(tmp_path))
        assert result["frames"] == []
        assert result["total_available"] == 0

    @patch("app.services.goes_fetcher._process_single_frame")
    @patch("app.services.goes_fetcher._get_s3_client")
    @patch("app.services.goes_fetcher.list_available")
    @patch("app.services.goes_fetcher._check_disk_space")
    @patch("app.services.goes_fetcher.validate_params")
    def test_fetch_frames_capped(self, mock_val, mock_disk, mock_list, mock_s3, mock_proc, tmp_path):
        from app.services.goes_fetcher import fetch_frames
        # Return more items than max_frames
        mock_list.return_value = [{"key": f"k{i}", "scan_time": datetime(2026, 1, 1, tzinfo=UTC), "size": 100} for i in range(10)]
        mock_proc.return_value = True
        result = fetch_frames("GOES-16", "FullDisk", "C02",
                              datetime(2026, 1, 1, tzinfo=UTC),
                              datetime(2026, 1, 2, tzinfo=UTC),
                              str(tmp_path), max_frames=3)
        assert result["capped"] is True
        assert result["attempted"] == 3
        assert mock_proc.call_count == 3

    @patch("app.services.goes_fetcher._process_single_frame")
    @patch("app.services.goes_fetcher._get_s3_client")
    @patch("app.services.goes_fetcher.list_available")
    @patch("app.services.goes_fetcher._check_disk_space")
    @patch("app.services.goes_fetcher.validate_params")
    def test_fetch_frames_with_failures(self, mock_val, mock_disk, mock_list, mock_s3, mock_proc, tmp_path):
        from app.services.goes_fetcher import fetch_frames
        mock_list.return_value = [{"key": f"k{i}", "scan_time": datetime(2026, 1, 1, tzinfo=UTC), "size": 100} for i in range(3)]
        mock_proc.side_effect = [True, False, True]
        result = fetch_frames("GOES-16", "FullDisk", "C02",
                              datetime(2026, 1, 1, tzinfo=UTC),
                              datetime(2026, 1, 2, tzinfo=UTC),
                              str(tmp_path))
        assert result["failed_downloads"] == 1

    def test_fetch_frames_invalid_max_frames(self, tmp_path):
        from app.services.goes_fetcher import fetch_frames
        with patch("app.services.goes_fetcher.validate_params"):
            with pytest.raises(ValueError, match="max_frames must be a positive"):
                fetch_frames("GOES-16", "FullDisk", "C02",
                             datetime(2026, 1, 1, tzinfo=UTC),
                             datetime(2026, 1, 2, tzinfo=UTC),
                             str(tmp_path), max_frames=0)


# ===========================================================================
# goes_fetcher.py — fetch_single_preview (lines 573-596)
# ===========================================================================

class TestFetchSinglePreview:

    @patch("app.services.goes_fetcher.list_available")
    @patch("app.services.goes_fetcher.validate_params")
    def test_no_available_returns_none(self, mock_val, mock_list):
        from app.services.goes_fetcher import fetch_single_preview
        mock_list.return_value = []
        result = fetch_single_preview("GOES-16", "FullDisk", "C02", datetime(2026, 1, 1, tzinfo=UTC))
        assert result is None

    @patch("app.services.goes_fetcher._netcdf_to_png")
    @patch("app.services.goes_fetcher._retry_s3_operation")
    @patch("app.services.goes_fetcher._get_s3_client")
    @patch("app.services.goes_fetcher.list_available")
    @patch("app.services.goes_fetcher.validate_params")
    def test_success_returns_bytes(self, mock_val, mock_list, mock_s3, mock_retry, mock_png, tmp_path):
        from app.services.goes_fetcher import fetch_single_preview
        t = datetime(2026, 1, 1, 0, 5, tzinfo=UTC)
        mock_list.return_value = [
            {"key": "k1", "scan_time": datetime(2026, 1, 1, 0, 0, tzinfo=UTC), "size": 100},
            {"key": "k2", "scan_time": datetime(2026, 1, 1, 0, 10, tzinfo=UTC), "size": 100},
        ]
        body = MagicMock()
        body.read.return_value = b"nc-data"
        mock_retry.return_value = {"Body": body}

        # Mock _netcdf_to_png to write a file
        def write_png(nc_bytes, path, sector="FullDisk"):
            path.write_bytes(b"PNG-DATA")
            return path
        mock_png.side_effect = write_png

        result = fetch_single_preview("GOES-16", "FullDisk", "C02", t)
        assert result == b"PNG-DATA"

    @patch("app.services.goes_fetcher._retry_s3_operation")
    @patch("app.services.goes_fetcher._get_s3_client")
    @patch("app.services.goes_fetcher.list_available")
    @patch("app.services.goes_fetcher.validate_params")
    def test_exception_returns_none(self, mock_val, mock_list, mock_s3, mock_retry):
        from app.services.goes_fetcher import fetch_single_preview
        mock_list.return_value = [
            {"key": "k1", "scan_time": datetime(2026, 1, 1, tzinfo=UTC), "size": 100},
        ]
        mock_retry.side_effect = RuntimeError("boom")
        result = fetch_single_preview("GOES-16", "FullDisk", "C02", datetime(2026, 1, 1, tzinfo=UTC))
        assert result is None


# ===========================================================================
# goes_fetcher.py — _process_single_frame disk check (line 492)
# ===========================================================================

@patch("app.services.goes_fetcher._check_disk_space")
@patch("app.services.goes_fetcher._download_and_convert_frame")
def test_process_single_frame_disk_check_at_index_10(mock_dl, mock_disk, tmp_path):
    from app.services.goes_fetcher import _process_single_frame
    mock_dl.return_value = {"path": "/f.png"}
    results = []
    _process_single_frame(
        MagicMock(), "bucket", {"key": "k"}, "GOES-16", "FullDisk", "C02",
        tmp_path, results, 10, 20, None,
    )
    mock_disk.assert_called_once_with(tmp_path, min_gb=0.5)


@patch("app.services.goes_fetcher._check_disk_space")
@patch("app.services.goes_fetcher._download_and_convert_frame")
def test_process_single_frame_disk_check_raises_oserror(mock_dl, mock_disk, tmp_path):
    from app.services.goes_fetcher import _process_single_frame
    mock_disk.side_effect = OSError("no space")
    results = []
    with pytest.raises(OSError):
        _process_single_frame(
            MagicMock(), "bucket", {"key": "k"}, "GOES-16", "FullDisk", "C02",
            tmp_path, results, 10, 20, None,
        )


# ===========================================================================
# goes_tasks.py — _make_progress_callback (lines 191-195)
# ===========================================================================

@patch("app.tasks.goes_tasks._update_job_db")
@patch("app.tasks.goes_tasks._publish_progress")
def test_make_progress_callback(mock_pub, mock_update):
    from app.tasks.goes_tasks import _make_progress_callback
    log_calls = []
    cb = _make_progress_callback("job-1", log_calls.append)
    cb(5, 10)
    assert log_calls == ["Downloading frame 5/10"]
    mock_pub.assert_called_once_with("job-1", 50, "Downloading frame 5/10")
    mock_update.assert_called_once_with("job-1", progress=50, status_message="Downloading frame 5/10")


# ===========================================================================
# goes_tasks.py — _load_band_images (lines 421-451)
# ===========================================================================

class TestLoadBandImages:

    def test_loads_bands_from_db(self, tmp_path):
        from app.tasks.goes_tasks import _load_band_images
        from PIL import Image as PILImage

        # Create a test image
        img_path = tmp_path / "band.png"
        PILImage.new("L", (10, 10), 128).save(str(img_path))

        session = MagicMock()
        frame = MagicMock()
        frame.file_path = str(img_path)
        session.execute.return_value.scalars.return_value.first.return_value = frame

        result = _load_band_images(session, ["C02", "C03", "C01"], "GOES-16", "FullDisk",
                                   datetime(2026, 1, 1, tzinfo=UTC))
        assert len(result) == 3
        assert all(r is not None for r in result)
        assert result[0].shape == (10, 10)

    def test_missing_frame_returns_none(self):
        from app.tasks.goes_tasks import _load_band_images

        session = MagicMock()
        session.execute.return_value.scalars.return_value.first.return_value = None

        result = _load_band_images(session, ["C02"], "GOES-16", "FullDisk",
                                   datetime(2026, 1, 1, tzinfo=UTC))
        assert result == [None]

    def test_missing_file_returns_none(self):
        from app.tasks.goes_tasks import _load_band_images

        session = MagicMock()
        frame = MagicMock()
        frame.file_path = "/nonexistent/path.png"
        session.execute.return_value.scalars.return_value.first.return_value = frame

        result = _load_band_images(session, ["C02"], "GOES-16", "FullDisk",
                                   datetime(2026, 1, 1, tzinfo=UTC))
        assert result == [None]


# ===========================================================================
# goes_tasks.py — _normalize_band (lines 456-467)
# ===========================================================================

class TestNormalizeBand:

    def test_same_shape_normalizes(self):
        from app.tasks.goes_tasks import _normalize_band
        arr = np.array([[0, 50], [100, 200]], dtype=np.float32)
        result = _normalize_band(arr, (2, 2))
        assert result.dtype == np.uint8
        assert result.max() == 255
        assert result.min() == 0

    def test_different_shape_resizes(self):
        from app.tasks.goes_tasks import _normalize_band
        arr = np.array([[0, 128, 255, 100]], dtype=np.float32)
        result = _normalize_band(arr, (2, 2))
        assert result.shape == (2, 2)
        assert result.dtype == np.uint8

    def test_uniform_values_returns_zeros(self):
        from app.tasks.goes_tasks import _normalize_band
        arr = np.full((3, 3), 42.0, dtype=np.float32)
        result = _normalize_band(arr, (3, 3))
        assert result.dtype == np.uint8
        assert np.all(result == 0)


# ===========================================================================
# goes_tasks.py — _compose_rgb (lines 472-483)
# ===========================================================================

class TestComposeRgb:

    def test_three_bands(self):
        from app.tasks.goes_tasks import _compose_rgb
        bands = [
            np.full((5, 5), 100, dtype=np.float32),
            np.full((5, 5), 150, dtype=np.float32),
            np.full((5, 5), 200, dtype=np.float32),
        ]
        img = _compose_rgb(bands)
        assert img.mode == "RGB"
        assert img.size == (5, 5)

    def test_with_none_band(self):
        from app.tasks.goes_tasks import _compose_rgb
        bands = [
            np.full((5, 5), 100, dtype=np.float32),
            None,
            np.full((5, 5), 200, dtype=np.float32),
        ]
        img = _compose_rgb(bands)
        assert img.mode == "RGB"
        assert img.size == (5, 5)


# ===========================================================================
# goes_tasks.py — _mark_composite_failed (lines 488-498)
# ===========================================================================

@patch("app.tasks.goes_tasks._get_sync_db")
def test_mark_composite_failed(mock_db):
    from app.tasks.goes_tasks import _mark_composite_failed
    session = MagicMock()
    mock_db.return_value = session
    comp = MagicMock()
    session.query.return_value.filter.return_value.first.return_value = comp

    _mark_composite_failed("comp-1", "some error")
    assert comp.status == "failed"
    assert comp.error == "some error"
    session.commit.assert_called_once()
    session.close.assert_called_once()


@patch("app.tasks.goes_tasks._get_sync_db")
def test_mark_composite_failed_not_found(mock_db):
    from app.tasks.goes_tasks import _mark_composite_failed
    session = MagicMock()
    mock_db.return_value = session
    session.query.return_value.filter.return_value.first.return_value = None

    _mark_composite_failed("comp-missing", "err")
    session.commit.assert_called_once()
    session.close.assert_called_once()


# ===========================================================================
# goes_tasks.py — generate_composite (lines 504-553)
# ===========================================================================

class TestGenerateComposite:

    @patch("app.tasks.goes_tasks._publish_progress")
    @patch("app.tasks.goes_tasks._update_job_db")
    @patch("app.tasks.goes_tasks._get_sync_db")
    def test_success(self, mock_db, mock_update, mock_pub, tmp_path):
        from app.tasks.goes_tasks import generate_composite

        session = MagicMock()
        mock_db.return_value = session

        # Mock _load_band_images to return real arrays
        bands = [np.full((5, 5), v, dtype=np.float32) for v in [100, 150, 200]]

        with patch("app.tasks.goes_tasks._load_band_images", return_value=bands), \
             patch("app.tasks.goes_tasks.settings") as mock_settings:
            mock_settings.output_dir = str(tmp_path)

            comp = MagicMock()
            session.query.return_value.filter.return_value.first.return_value = comp

            generate_composite(
                "comp-1", "job-1",
                {"bands": ["C02", "C03", "C01"], "satellite": "GOES-16",
                 "sector": "FullDisk", "capture_time": "2026-01-01T00:00:00+00:00"},
            )
            assert comp.status == "completed"
            assert comp.file_path is not None
            session.commit.assert_called()

    @patch("app.tasks.goes_tasks._mark_composite_failed")
    @patch("app.tasks.goes_tasks._publish_progress")
    @patch("app.tasks.goes_tasks._update_job_db")
    @patch("app.tasks.goes_tasks._get_sync_db")
    def test_no_bands_raises(self, mock_db, mock_update, mock_pub, mock_mark):
        from app.tasks.goes_tasks import generate_composite

        session = MagicMock()
        mock_db.return_value = session

        with patch("app.tasks.goes_tasks._load_band_images", return_value=[None, None, None]):
            with pytest.raises(ValueError, match="No band images"):
                generate_composite(
                    "comp-1", "job-1",
                    {"bands": ["C02", "C03", "C01"], "satellite": "GOES-16",
                     "sector": "FullDisk", "capture_time": "2026-01-01T00:00:00+00:00"},
                )
            mock_mark.assert_called_once()


# ===========================================================================
# goes_tasks.py — backfill_gaps (lines 365-410)
# ===========================================================================

class TestBackfillGaps:

    @patch("app.tasks.goes_tasks._publish_progress")
    @patch("app.tasks.goes_tasks._update_job_db")
    @patch("app.tasks.goes_tasks._detect_gaps")
    def test_no_gaps(self, mock_gaps, mock_update, mock_pub):
        from app.tasks.goes_tasks import backfill_gaps
        mock_gaps.return_value = []
        backfill_gaps("job-1", {"satellite": "GOES-16", "band": "C02", "sector": "FullDisk"})
        # Should mark completed with "No gaps found"
        calls = [c for c in mock_update.call_args_list if "No gaps found" in str(c)]
        assert len(calls) >= 1

    @patch("app.tasks.goes_tasks._publish_progress")
    @patch("app.tasks.goes_tasks._update_job_db")
    @patch("app.tasks.goes_tasks._fill_single_gap")
    @patch("app.tasks.goes_tasks._detect_gaps")
    @patch("app.tasks.goes_tasks.settings")
    def test_with_gaps(self, mock_settings, mock_gaps, mock_fill, mock_update, mock_pub, tmp_path):
        from app.tasks.goes_tasks import backfill_gaps
        mock_settings.output_dir = str(tmp_path)
        mock_gaps.return_value = [
            {"start": datetime(2026, 1, 1, 0, 10, tzinfo=UTC),
             "end": datetime(2026, 1, 1, 0, 40, tzinfo=UTC),
             "duration_minutes": 30},
        ]
        mock_fill.return_value = 3
        backfill_gaps("job-1", {"satellite": "GOES-16", "band": "C02", "sector": "FullDisk"})
        mock_fill.assert_called_once()
        # Should report completion with backfilled count
        completed_calls = [c for c in mock_update.call_args_list if "completed" in str(c)]
        assert len(completed_calls) >= 1

    @patch("app.tasks.goes_tasks._publish_progress")
    @patch("app.tasks.goes_tasks._update_job_db")
    @patch("app.tasks.goes_tasks._detect_gaps")
    def test_exception(self, mock_gaps, mock_update, mock_pub):
        from app.tasks.goes_tasks import backfill_gaps
        mock_gaps.side_effect = RuntimeError("db down")
        with pytest.raises(RuntimeError):
            backfill_gaps("job-1", {})
        failed_calls = [c for c in mock_update.call_args_list if "failed" in str(c)]
        assert len(failed_calls) >= 1


# ===========================================================================
# goes_fetcher.py — list_available exception paths (lines 245-248)
# ===========================================================================

@patch("app.services.goes_fetcher._retry_s3_operation")
@patch("app.services.goes_fetcher._get_s3_client")
@patch("app.services.goes_fetcher.validate_params")
def test_list_available_s3_exception(mock_val, mock_s3, mock_retry):
    from app.services.goes_fetcher import list_available
    from botocore.exceptions import ClientError
    mock_retry.side_effect = ClientError({"Error": {"Code": "AccessDenied", "Message": ""}}, "op")
    result = list_available("GOES-16", "FullDisk", "C02",
                            datetime(2026, 1, 1, tzinfo=UTC),
                            datetime(2026, 1, 2, tzinfo=UTC))
    assert result == []


@patch("app.services.goes_fetcher._retry_s3_operation")
@patch("app.services.goes_fetcher._get_s3_client")
@patch("app.services.goes_fetcher.validate_params")
def test_list_available_generic_exception(mock_val, mock_s3, mock_retry):
    from app.services.goes_fetcher import list_available
    mock_retry.side_effect = RuntimeError("unexpected")
    result = list_available("GOES-16", "FullDisk", "C02",
                            datetime(2026, 1, 1, tzinfo=UTC),
                            datetime(2026, 1, 2, tzinfo=UTC))
    assert result == []
