"""Tests for extracted helper functions in goes_tasks (#98 coverage boost)."""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

# ---------------------------------------------------------------------------
# _read_max_frames_setting
# ---------------------------------------------------------------------------

@patch("app.tasks.goes_tasks._get_sync_db")
def test_read_max_frames_setting_from_db(mock_db):
    from app.tasks.goes_tasks import _read_max_frames_setting

    session = MagicMock()
    mock_db.return_value = session
    setting = MagicMock()
    setting.value = 500
    session.query.return_value.filter.return_value.first.return_value = setting

    assert _read_max_frames_setting() == 500
    session.close.assert_called_once()


@patch("app.tasks.goes_tasks._get_sync_db")
def test_read_max_frames_setting_default(mock_db):
    from app.tasks.goes_tasks import _read_max_frames_setting

    session = MagicMock()
    mock_db.return_value = session
    session.query.return_value.filter.return_value.first.return_value = None

    result = _read_max_frames_setting()
    assert result == 200  # DEFAULT_MAX_FRAMES
    session.close.assert_called_once()


@patch("app.tasks.goes_tasks._get_sync_db")
def test_read_max_frames_setting_exception(mock_db):
    from app.tasks.goes_tasks import _read_max_frames_setting

    session = MagicMock()
    mock_db.return_value = session
    session.query.side_effect = RuntimeError("db error")

    result = _read_max_frames_setting()
    assert result == 200
    session.close.assert_called_once()


# ---------------------------------------------------------------------------
# _build_status_message
# ---------------------------------------------------------------------------

def test_build_status_no_frames_no_available():
    from app.tasks.goes_tasks import _build_status_message

    msg, status = _build_status_message(
        "GOES-16", "FullDisk", "C02",
        datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 1, 1, tzinfo=UTC),
        fetched_count=0, total_available=0, was_capped=False,
        failed_downloads=0, max_frames_limit=200,
    )
    assert status == "failed"
    assert "No frames found" in msg


def test_build_status_all_failed():
    from app.tasks.goes_tasks import _build_status_message

    msg, status = _build_status_message(
        "GOES-16", "FullDisk", "C02",
        datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 1, 1, tzinfo=UTC),
        fetched_count=0, total_available=10, was_capped=False,
        failed_downloads=10, max_frames_limit=200,
    )
    assert status == "failed"
    assert "All 10 frames failed" in msg


def test_build_status_all_success():
    from app.tasks.goes_tasks import _build_status_message

    msg, status = _build_status_message(
        "GOES-16", "FullDisk", "C02",
        datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 1, 1, tzinfo=UTC),
        fetched_count=5, total_available=5, was_capped=False,
        failed_downloads=0, max_frames_limit=200,
    )
    assert status == "completed"
    assert "Fetched 5 frames" in msg


def test_build_status_capped():
    from app.tasks.goes_tasks import _build_status_message

    msg, status = _build_status_message(
        "GOES-16", "FullDisk", "C02",
        datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 1, 1, tzinfo=UTC),
        fetched_count=200, total_available=500, was_capped=True,
        failed_downloads=0, max_frames_limit=200,
    )
    assert status == "completed_partial"
    assert "frame limit" in msg


def test_build_status_partial_with_failures():
    from app.tasks.goes_tasks import _build_status_message

    msg, status = _build_status_message(
        "GOES-16", "FullDisk", "C02",
        datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 1, 1, tzinfo=UTC),
        fetched_count=7, total_available=10, was_capped=False,
        failed_downloads=3, max_frames_limit=200,
    )
    assert status == "completed_partial"
    assert "3 failed" in msg


def test_build_status_capped_with_failures():
    from app.tasks.goes_tasks import _build_status_message

    msg, status = _build_status_message(
        "GOES-16", "FullDisk", "C02",
        datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 1, 1, tzinfo=UTC),
        fetched_count=5, total_available=300, was_capped=True,
        failed_downloads=2, max_frames_limit=200,
    )
    assert status == "completed_partial"
    assert "2 failed" in msg
    assert "beyond frame limit" in msg


def test_build_status_historical_satellite():
    from app.tasks.goes_tasks import _build_status_message

    msg, status = _build_status_message(
        "GOES-16", "FullDisk", "C02",
        datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 1, 1, tzinfo=UTC),
        fetched_count=0, total_available=0, was_capped=False,
        failed_downloads=0, max_frames_limit=200,
    )
    assert status == "failed"
    assert "available from" in msg  # GOES-16 has available_to set


# ---------------------------------------------------------------------------
# _detect_gaps
# ---------------------------------------------------------------------------

@patch("app.tasks.goes_tasks._get_sync_db")
def test_detect_gaps_finds_gaps(mock_db):
    from app.tasks.goes_tasks import _detect_gaps

    session = MagicMock()
    mock_db.return_value = session

    # Simulate timestamps with a 30-min gap (expected interval 10 min)
    timestamps = [
        (datetime(2026, 1, 1, 0, 0, tzinfo=UTC),),
        (datetime(2026, 1, 1, 0, 10, tzinfo=UTC),),
        (datetime(2026, 1, 1, 0, 40, tzinfo=UTC),),  # 30 min gap
        (datetime(2026, 1, 1, 0, 50, tzinfo=UTC),),
    ]
    session.execute.return_value.all.return_value = timestamps

    gaps = _detect_gaps("GOES-16", "C02", "FullDisk", 10.0)
    assert len(gaps) == 1
    assert gaps[0]["duration_minutes"] == 30.0


@patch("app.tasks.goes_tasks._get_sync_db")
def test_detect_gaps_no_gaps(mock_db):
    from app.tasks.goes_tasks import _detect_gaps

    session = MagicMock()
    mock_db.return_value = session

    timestamps = [
        (datetime(2026, 1, 1, 0, 0, tzinfo=UTC),),
        (datetime(2026, 1, 1, 0, 10, tzinfo=UTC),),
        (datetime(2026, 1, 1, 0, 20, tzinfo=UTC),),
    ]
    session.execute.return_value.all.return_value = timestamps

    gaps = _detect_gaps("GOES-16", "C02", "FullDisk", 10.0)
    assert len(gaps) == 0


# ---------------------------------------------------------------------------
# _build_fetch_result (goes_fetcher)
# ---------------------------------------------------------------------------

def test_build_fetch_result():
    from app.services.goes_fetcher import _build_fetch_result

    result = _build_fetch_result(["a", "b"], 10, True, 5, 1)
    assert result == {
        "frames": ["a", "b"],
        "total_available": 10,
        "capped": True,
        "attempted": 5,
        "failed_downloads": 1,
    }


# ---------------------------------------------------------------------------
# _download_and_convert_frame (goes_fetcher)
# ---------------------------------------------------------------------------

@patch("app.services.goes_fetcher._netcdf_to_png_from_file")
@patch("app.services.goes_fetcher._retry_s3_operation")
def test_download_and_convert_frame_success(mock_retry, mock_png, tmp_path):
    from app.services.goes_fetcher import _download_and_convert_frame

    body = MagicMock()
    body.iter_chunks.return_value = [b"data"]
    mock_retry.return_value = {"Body": body}

    s3 = MagicMock()
    item = {"key": "test.nc", "scan_time": datetime(2026, 1, 1, tzinfo=UTC)}

    result = _download_and_convert_frame(s3, "bucket", item, "GOES-16", "FullDisk", "C02", tmp_path)
    assert result is not None
    assert result["satellite"] == "GOES-16"
    assert result["band"] == "C02"


@patch("app.services.goes_fetcher._FRAME_RETRY_DELAY", 0)
@patch("app.services.goes_fetcher._retry_s3_operation")
def test_download_and_convert_frame_transient_failure(mock_retry, tmp_path):
    from app.services.goes_fetcher import _download_and_convert_frame
    from botocore.exceptions import ConnectTimeoutError

    mock_retry.side_effect = ConnectTimeoutError(endpoint_url="https://s3")

    s3 = MagicMock()
    item = {"key": "test.nc", "scan_time": datetime(2026, 1, 1, tzinfo=UTC)}

    result = _download_and_convert_frame(s3, "bucket", item, "GOES-16", "FullDisk", "C02", tmp_path)
    assert result is None


# ---------------------------------------------------------------------------
# _process_single_frame
# ---------------------------------------------------------------------------

@patch("app.services.goes_fetcher._download_and_convert_frame")
def test_process_single_frame_success(mock_dl, tmp_path):
    from pathlib import Path as _P

    from app.services.goes_fetcher import _process_single_frame

    mock_dl.return_value = {"path": "/tmp/f.png", "satellite": "GOES-16", "band": "C02", "scan_time": datetime(2026, 1, 1, tzinfo=UTC)}
    results = []
    progress_calls = []
    ok = _process_single_frame(
        MagicMock(), "bucket", {"key": "k"}, "GOES-16", "FullDisk", "C02",
        _P(tmp_path), results, 0, 5, lambda cur, tot: progress_calls.append((cur, tot)),
    )
    assert ok is True
    assert len(results) == 1
    assert progress_calls == [(1, 5)]


@patch("app.services.goes_fetcher._download_and_convert_frame")
def test_process_single_frame_returns_none(mock_dl, tmp_path):
    from pathlib import Path as _P

    from app.services.goes_fetcher import _process_single_frame

    mock_dl.return_value = None
    results = []
    ok = _process_single_frame(
        MagicMock(), "bucket", {"key": "k"}, "GOES-16", "FullDisk", "C02",
        _P(tmp_path), results, 0, 5, None,
    )
    assert ok is False
    assert len(results) == 0


@patch("app.services.goes_fetcher._download_and_convert_frame")
def test_process_single_frame_unexpected_error(mock_dl, tmp_path):
    from pathlib import Path as _P

    from app.services.goes_fetcher import _process_single_frame

    mock_dl.side_effect = RuntimeError("boom")
    results = []
    ok = _process_single_frame(
        MagicMock(), "bucket", {"key": "k"}, "GOES-16", "FullDisk", "C02",
        _P(tmp_path), results, 0, 5, None,
    )
    assert ok is False


# ---------------------------------------------------------------------------
# _detect_gaps edge cases
# ---------------------------------------------------------------------------

@patch("app.tasks.goes_tasks._get_sync_db")
def test_detect_gaps_empty_timestamps(mock_db):
    from app.tasks.goes_tasks import _detect_gaps

    session = MagicMock()
    mock_db.return_value = session
    session.execute.return_value.all.return_value = []

    gaps = _detect_gaps("GOES-16", "C02", "FullDisk", 10.0)
    assert gaps == []


@patch("app.tasks.goes_tasks._get_sync_db")
def test_detect_gaps_single_timestamp(mock_db):
    from app.tasks.goes_tasks import _detect_gaps

    session = MagicMock()
    mock_db.return_value = session
    session.execute.return_value.all.return_value = [
        (datetime(2026, 1, 1, 0, 0, tzinfo=UTC),),
    ]

    gaps = _detect_gaps("GOES-16", "C02", "FullDisk", 10.0)
    assert gaps == []


@patch("app.tasks.goes_tasks._get_sync_db")
def test_detect_gaps_no_filter(mock_db):
    """Test _detect_gaps with None satellite/band/sector (no WHERE filters)."""
    from app.tasks.goes_tasks import _detect_gaps

    session = MagicMock()
    mock_db.return_value = session
    session.execute.return_value.all.return_value = [
        (datetime(2026, 1, 1, 0, 0, tzinfo=UTC),),
        (datetime(2026, 1, 1, 1, 0, tzinfo=UTC),),  # 60 min gap
    ]

    gaps = _detect_gaps(None, None, None, 10.0)
    assert len(gaps) == 1
    assert gaps[0]["duration_minutes"] == 60.0


# ---------------------------------------------------------------------------
# _create_backfill_image_records
# ---------------------------------------------------------------------------

@patch("app.tasks.goes_tasks._get_sync_db")
def test_create_backfill_image_records(mock_db, tmp_path):
    from app.tasks.goes_tasks import _create_backfill_image_records

    session = MagicMock()
    mock_db.return_value = session

    # Create a fake file
    f = tmp_path / "frame.png"
    f.write_bytes(b"fake")

    _create_backfill_image_records([{
        "path": str(f),
        "satellite": "GOES-16",
        "band": "C02",
        "scan_time": datetime(2026, 1, 1, tzinfo=UTC),
    }])
    session.add.assert_called_once()
    session.commit.assert_called_once()
    session.close.assert_called_once()


# ---------------------------------------------------------------------------
# _read_max_frames_setting — non-numeric value
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# _create_fetch_records
# ---------------------------------------------------------------------------

@patch("app.services.thumbnail.generate_thumbnail", return_value="/tmp/thumb.png")
@patch("app.services.thumbnail.get_image_dimensions", return_value=(1000, 1000))
@patch("app.tasks.goes_tasks._get_sync_db")
def test_create_fetch_records(mock_db, mock_dims, mock_thumb, tmp_path):
    from app.tasks.goes_tasks import _create_fetch_records

    session = MagicMock()
    mock_db.return_value = session

    f = tmp_path / "frame.png"
    f.write_bytes(b"fake")

    _create_fetch_records("job-1", "FullDisk", str(tmp_path), [{
        "path": str(f),
        "satellite": "GOES-16",
        "band": "C02",
        "scan_time": datetime(2026, 1, 1, tzinfo=UTC),
    }])
    assert session.add.call_count >= 3  # Collection + Image + GoesFrame + CollectionFrame
    session.commit.assert_called_once()
    session.close.assert_called_once()


@patch("app.services.thumbnail.generate_thumbnail", return_value="/tmp/thumb.png")
@patch("app.services.thumbnail.get_image_dimensions", return_value=(1000, 1000))
@patch("app.tasks.goes_tasks._get_sync_db")
def test_create_fetch_records_empty(mock_db, mock_dims, mock_thumb):
    from app.tasks.goes_tasks import _create_fetch_records

    session = MagicMock()
    mock_db.return_value = session

    _create_fetch_records("job-1", "FullDisk", "/tmp", [])
    session.commit.assert_called_once()
    session.close.assert_called_once()


# ---------------------------------------------------------------------------
# _read_max_frames_setting — non-numeric value
# ---------------------------------------------------------------------------

@patch("app.tasks.goes_tasks._get_sync_db")
def test_read_max_frames_setting_non_numeric(mock_db):
    from app.tasks.goes_tasks import _read_max_frames_setting

    session = MagicMock()
    mock_db.return_value = session
    setting = MagicMock()
    setting.value = "not-a-number"
    session.query.return_value.filter.return_value.first.return_value = setting

    result = _read_max_frames_setting()
    assert result == 200  # Falls through to default
