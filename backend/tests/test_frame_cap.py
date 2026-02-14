"""Tests for frame cap handling, retry logic, and completed_partial status."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

from botocore.exceptions import ClientError

# ---------------------------------------------------------------------------
# fetch_frames metadata & capping
# ---------------------------------------------------------------------------

def _make_available(n: int) -> list[dict]:
    """Generate *n* fake S3 available-frame dicts."""
    base = datetime(2026, 1, 1, tzinfo=UTC)
    return [
        {"key": f"frame_{i}.nc", "scan_time": base + timedelta(minutes=10 * i), "size": 1000}
        for i in range(n)
    ]


def _client_error(code: str = "SlowDown") -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": "err"}}, "GetObject")


@patch("app.services.goes_fetcher._check_disk_space")
@patch("app.services.goes_fetcher._netcdf_to_png_from_file")
@patch("app.services.goes_fetcher._retry_s3_operation")
@patch("app.services.goes_fetcher._get_s3_client")
@patch("app.services.goes_fetcher.list_available")
def test_fetch_frames_returns_metadata(mock_list, mock_s3_client, mock_retry, mock_png, mock_disk, tmp_path):
    from app.services.goes_fetcher import fetch_frames

    mock_list.return_value = _make_available(5)
    # _retry_s3_operation returns a response with a Body that can iter_chunks
    body = MagicMock()
    body.iter_chunks.return_value = [b"data"]
    mock_retry.return_value = {"Body": body}
    mock_png.return_value = Path("dummy.png")

    result = fetch_frames(
        satellite="GOES-16", sector="FullDisk", band="C02",
        start_time=datetime(2026, 1, 1, tzinfo=UTC),
        end_time=datetime(2026, 1, 1, 1, tzinfo=UTC),
        output_dir=str(tmp_path),
    )

    assert set(result.keys()) == {"frames", "total_available", "capped", "attempted", "failed_downloads"}
    assert result["total_available"] == 5
    assert result["capped"] is False
    assert result["failed_downloads"] == 0
    assert result["attempted"] == 5
    assert len(result["frames"]) == 5


@patch("app.services.goes_fetcher._check_disk_space")
@patch("app.services.goes_fetcher._netcdf_to_png_from_file")
@patch("app.services.goes_fetcher._retry_s3_operation")
@patch("app.services.goes_fetcher._get_s3_client")
@patch("app.services.goes_fetcher.list_available")
def test_fetch_frames_caps_at_limit(mock_list, mock_s3_client, mock_retry, mock_png, mock_disk, tmp_path):
    from app.services.goes_fetcher import fetch_frames

    mock_list.return_value = _make_available(10)
    body = MagicMock()
    body.iter_chunks.return_value = [b"data"]
    mock_retry.return_value = {"Body": body}
    mock_png.return_value = Path("dummy.png")

    result = fetch_frames(
        satellite="GOES-16", sector="FullDisk", band="C02",
        start_time=datetime(2026, 1, 1, tzinfo=UTC),
        end_time=datetime(2026, 1, 1, 2, tzinfo=UTC),
        output_dir=str(tmp_path),
        max_frames=5,
    )

    assert result["total_available"] == 10
    assert result["capped"] is True
    assert result["attempted"] == 5
    assert len(result["frames"]) == 5


# ---------------------------------------------------------------------------
# Per-frame retry
# ---------------------------------------------------------------------------

@patch("app.services.goes_fetcher._FRAME_RETRY_DELAY", 0)
@patch("app.services.goes_fetcher._check_disk_space")
@patch("app.services.goes_fetcher._netcdf_to_png_from_file")
@patch("app.services.goes_fetcher._get_s3_client")
@patch("app.services.goes_fetcher.list_available")
def test_fetch_frames_retry_on_transient_error(mock_list, mock_s3_client, mock_png, mock_disk, tmp_path):
    from app.services.goes_fetcher import fetch_frames

    mock_list.return_value = _make_available(1)
    mock_png.return_value = Path("dummy.png")

    s3 = MagicMock()
    mock_s3_client.return_value = s3

    # First call to get_object raises, second succeeds
    body = MagicMock()
    body.iter_chunks.return_value = [b"data"]
    s3.get_object.side_effect = [_client_error("SlowDown"), {"Body": body}]

    # Patch _retry_s3_operation to just call the function directly (bypass circuit breaker)
    with patch("app.services.goes_fetcher._retry_s3_operation", side_effect=lambda fn, *a, **kw: fn(*a, **{k: v for k, v in kw.items() if k not in ("operation",)})):
        result = fetch_frames(
            satellite="GOES-16", sector="FullDisk", band="C02",
            start_time=datetime(2026, 1, 1, tzinfo=UTC),
            end_time=datetime(2026, 1, 1, 1, tzinfo=UTC),
            output_dir=str(tmp_path),
        )

    assert result["failed_downloads"] == 0
    assert len(result["frames"]) == 1


@patch("app.services.goes_fetcher._FRAME_RETRY_DELAY", 0)
@patch("app.services.goes_fetcher._check_disk_space")
@patch("app.services.goes_fetcher._get_s3_client")
@patch("app.services.goes_fetcher.list_available")
def test_fetch_frames_retry_exhausted(mock_list, mock_s3_client, mock_disk, tmp_path):
    from app.services.goes_fetcher import fetch_frames

    mock_list.return_value = _make_available(1)

    s3 = MagicMock()
    mock_s3_client.return_value = s3
    s3.get_object.side_effect = _client_error("SlowDown")

    with patch("app.services.goes_fetcher._retry_s3_operation", side_effect=lambda fn, *a, **kw: fn(*a, **{k: v for k, v in kw.items() if k not in ("operation",)})):
        result = fetch_frames(
            satellite="GOES-16", sector="FullDisk", band="C02",
            start_time=datetime(2026, 1, 1, tzinfo=UTC),
            end_time=datetime(2026, 1, 1, 1, tzinfo=UTC),
            output_dir=str(tmp_path),
        )

    assert result["failed_downloads"] == 1
    assert len(result["frames"]) == 0


# ---------------------------------------------------------------------------
# goes_tasks status logic
# ---------------------------------------------------------------------------

@patch("app.services.goes_fetcher.fetch_frames")
@patch("app.tasks.goes_tasks._update_job_db")
@patch("app.tasks.goes_tasks._publish_progress")
@patch("app.tasks.goes_tasks._get_sync_db")
def test_completed_partial_status_when_capped(mock_db, mock_progress, mock_update, mock_fetch):
    from app.tasks.goes_tasks import fetch_goes_data

    mock_session = MagicMock()
    mock_db.return_value = mock_session
    # AppSetting query returns None (use default)
    mock_session.query.return_value.filter.return_value.first.return_value = None

    mock_fetch.return_value = {
        "frames": [{"path": "/tmp/f.png", "scan_time": datetime(2026, 1, 1, tzinfo=UTC), "satellite": "GOES-16", "band": "C02", "sector": "FullDisk"}],
        "total_available": 300,
        "capped": True,
        "attempted": 200,
        "failed_downloads": 0,
    }

    params = {
        "satellite": "GOES-16", "sector": "FullDisk", "band": "C02",
        "start_time": "2026-01-01T00:00:00", "end_time": "2026-01-01T01:00:00",
    }

    with patch("app.services.thumbnail.generate_thumbnail", return_value=None), \
         patch("app.services.thumbnail.get_image_dimensions", return_value=(100, 100)), \
         patch("pathlib.Path.stat") as mock_stat, \
         patch("pathlib.Path.exists", return_value=True):
        mock_stat.return_value = MagicMock(st_size=1000)
        fetch_goes_data("job-cap", params)

    # Use keyword or positional
    final_statuses = []
    for c in mock_update.call_args_list:
        kw = c.kwargs if c.kwargs else {}
        if "status" in kw:
            final_statuses.append(kw["status"])
    assert "completed_partial" in final_statuses


@patch("app.services.goes_fetcher.fetch_frames")
@patch("app.tasks.goes_tasks._update_job_db")
@patch("app.tasks.goes_tasks._publish_progress")
@patch("app.tasks.goes_tasks._get_sync_db")
def test_completed_partial_status_when_some_failed(mock_db, mock_progress, mock_update, mock_fetch):
    from app.tasks.goes_tasks import fetch_goes_data

    mock_session = MagicMock()
    mock_db.return_value = mock_session
    mock_session.query.return_value.filter.return_value.first.return_value = None

    mock_fetch.return_value = {
        "frames": [{"path": "/tmp/f.png", "scan_time": datetime(2026, 1, 1, tzinfo=UTC), "satellite": "GOES-16", "band": "C02", "sector": "FullDisk"}],
        "total_available": 10,
        "capped": False,
        "attempted": 10,
        "failed_downloads": 3,
    }

    params = {
        "satellite": "GOES-16", "sector": "FullDisk", "band": "C02",
        "start_time": "2026-01-01T00:00:00", "end_time": "2026-01-01T01:00:00",
    }

    with patch("app.services.thumbnail.generate_thumbnail", return_value=None), \
         patch("app.services.thumbnail.get_image_dimensions", return_value=(100, 100)), \
         patch("pathlib.Path.stat") as mock_stat, \
         patch("pathlib.Path.exists", return_value=True):
        mock_stat.return_value = MagicMock(st_size=1000)
        fetch_goes_data("job-partial", params)

    final_statuses = []
    for c in mock_update.call_args_list:
        kw = c.kwargs if c.kwargs else {}
        if "status" in kw:
            final_statuses.append(kw["status"])
    assert "completed_partial" in final_statuses


@patch("app.services.goes_fetcher.fetch_frames")
@patch("app.tasks.goes_tasks._update_job_db")
@patch("app.tasks.goes_tasks._publish_progress")
@patch("app.tasks.goes_tasks._get_sync_db")
def test_completed_status_when_all_succeed(mock_db, mock_progress, mock_update, mock_fetch):
    from app.tasks.goes_tasks import fetch_goes_data

    mock_session = MagicMock()
    mock_db.return_value = mock_session
    mock_session.query.return_value.filter.return_value.first.return_value = None

    mock_fetch.return_value = {
        "frames": [{"path": "/tmp/f.png", "scan_time": datetime(2026, 1, 1, tzinfo=UTC), "satellite": "GOES-16", "band": "C02", "sector": "FullDisk"}],
        "total_available": 1,
        "capped": False,
        "attempted": 1,
        "failed_downloads": 0,
    }

    params = {
        "satellite": "GOES-16", "sector": "FullDisk", "band": "C02",
        "start_time": "2026-01-01T00:00:00", "end_time": "2026-01-01T01:00:00",
    }

    with patch("app.services.thumbnail.generate_thumbnail", return_value=None), \
         patch("app.services.thumbnail.get_image_dimensions", return_value=(100, 100)), \
         patch("pathlib.Path.stat") as mock_stat, \
         patch("pathlib.Path.exists", return_value=True):
        mock_stat.return_value = MagicMock(st_size=1000)
        fetch_goes_data("job-ok", params)

    final_statuses = []
    for c in mock_update.call_args_list:
        kw = c.kwargs if c.kwargs else {}
        if "status" in kw:
            final_statuses.append(kw["status"])
    assert "completed" in final_statuses
    assert "completed_partial" not in final_statuses


@patch("app.services.goes_fetcher.fetch_frames")
@patch("app.tasks.goes_tasks._update_job_db")
@patch("app.tasks.goes_tasks._publish_progress")
@patch("app.tasks.goes_tasks._get_sync_db")
def test_failed_status_when_zero_frames(mock_db, mock_progress, mock_update, mock_fetch):
    from app.tasks.goes_tasks import fetch_goes_data

    mock_session = MagicMock()
    mock_db.return_value = mock_session
    mock_session.query.return_value.filter.return_value.first.return_value = None

    mock_fetch.return_value = {
        "frames": [],
        "total_available": 0,
        "capped": False,
        "attempted": 0,
        "failed_downloads": 0,
    }

    params = {
        "satellite": "GOES-16", "sector": "FullDisk", "band": "C02",
        "start_time": "2026-01-01T00:00:00", "end_time": "2026-01-01T01:00:00",
    }

    fetch_goes_data("job-empty", params)

    final_statuses = []
    for c in mock_update.call_args_list:
        kw = c.kwargs if c.kwargs else {}
        if "status" in kw:
            final_statuses.append(kw["status"])
    assert "failed" in final_statuses


@patch("app.services.goes_fetcher.fetch_frames")
@patch("app.tasks.goes_tasks._update_job_db")
@patch("app.tasks.goes_tasks._publish_progress")
@patch("app.tasks.goes_tasks._get_sync_db")
def test_frame_cap_reads_from_settings(mock_db, mock_progress, mock_update, mock_fetch):
    from app.tasks.goes_tasks import fetch_goes_data

    mock_session = MagicMock()
    mock_db.return_value = mock_session

    # Simulate AppSetting with max_frames_per_fetch = 300
    setting_mock = MagicMock()
    setting_mock.value = 300
    mock_session.query.return_value.filter.return_value.first.return_value = setting_mock

    mock_fetch.return_value = {
        "frames": [],
        "total_available": 0,
        "capped": False,
        "attempted": 0,
        "failed_downloads": 0,
    }

    params = {
        "satellite": "GOES-16", "sector": "FullDisk", "band": "C02",
        "start_time": "2026-01-01T00:00:00", "end_time": "2026-01-01T01:00:00",
    }

    fetch_goes_data("job-settings", params)

    # Verify fetch_frames was called with max_frames=300
    assert mock_fetch.call_args.kwargs.get("max_frames") == 300


@patch("app.services.goes_fetcher.fetch_frames")
@patch("app.tasks.goes_tasks._update_job_db")
@patch("app.tasks.goes_tasks._publish_progress")
@patch("app.tasks.goes_tasks._get_sync_db")
def test_frame_cap_default_when_no_setting(mock_db, mock_progress, mock_update, mock_fetch):
    from app.tasks.goes_tasks import fetch_goes_data

    mock_session = MagicMock()
    mock_db.return_value = mock_session
    # No setting found
    mock_session.query.return_value.filter.return_value.first.return_value = None

    mock_fetch.return_value = {
        "frames": [],
        "total_available": 0,
        "capped": False,
        "attempted": 0,
        "failed_downloads": 0,
    }

    params = {
        "satellite": "GOES-16", "sector": "FullDisk", "band": "C02",
        "start_time": "2026-01-01T00:00:00", "end_time": "2026-01-01T01:00:00",
    }

    fetch_goes_data("job-default", params)

    assert mock_fetch.call_args.kwargs.get("max_frames") == 200
