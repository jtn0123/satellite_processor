"""Tests for GOES Celery tasks (#184)."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def mock_redis():
    with patch("app.tasks.goes_tasks._get_redis") as m:
        redis_mock = MagicMock()
        m.return_value = redis_mock
        yield redis_mock


@pytest.fixture
def mock_sync_db():
    with patch("app.tasks.goes_tasks._get_sync_db") as m:
        session = MagicMock()
        m.return_value = session
        yield session


def test_publish_progress(mock_redis):
    from app.tasks.goes_tasks import _publish_progress

    _publish_progress("job-1", 50, "Halfway there")
    mock_redis.publish.assert_called_once()
    args = mock_redis.publish.call_args
    assert "job:job-1" == args[0][0]
    assert "50" in args[0][1]


def test_update_job_db(mock_sync_db):
    from app.tasks.goes_tasks import _update_job_db

    mock_job = MagicMock()
    mock_sync_db.query.return_value.filter.return_value.first.return_value = mock_job

    _update_job_db("job-1", status="completed", progress=100)
    mock_sync_db.commit.assert_called_once()


@patch("app.services.goes_fetcher.fetch_frames")
@patch("app.tasks.goes_tasks._update_job_db")
@patch("app.tasks.goes_tasks._publish_progress")
@patch("app.tasks.goes_tasks._get_sync_db")
def test_fetch_goes_data_success(mock_db, mock_progress, mock_update, mock_fetch):
    from app.tasks.goes_tasks import fetch_goes_data

    mock_session = MagicMock()
    mock_db.return_value = mock_session

    mock_fetch.return_value = []

    params = {
        "satellite": "GOES-16",
        "sector": "FullDisk",
        "band": "C02",
        "start_time": "2026-01-01T00:00:00",
        "end_time": "2026-01-01T01:00:00",
    }

    fetch_goes_data(None, "job-test", params)
    mock_fetch.assert_called_once()


@patch("app.services.goes_fetcher.fetch_frames")
@patch("app.tasks.goes_tasks._update_job_db")
@patch("app.tasks.goes_tasks._publish_progress")
@patch("app.tasks.goes_tasks._get_sync_db")
def test_fetch_goes_data_failure(mock_db, mock_progress, mock_update, mock_fetch):
    from app.tasks.goes_tasks import fetch_goes_data

    mock_fetch.side_effect = RuntimeError("S3 error")
    mock_db.return_value = MagicMock()

    params = {
        "satellite": "GOES-16",
        "sector": "FullDisk",
        "band": "C02",
        "start_time": "2026-01-01T00:00:00",
        "end_time": "2026-01-01T01:00:00",
    }

    with pytest.raises(RuntimeError):
        fetch_goes_data(None, "job-fail", params)
