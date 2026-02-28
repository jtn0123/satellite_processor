"""Tests for task helpers throttle cleanup."""
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def _reset_throttle():
    """Reset the throttle dict before each test."""
    from app.tasks.helpers import _last_progress_update
    _last_progress_update.clear()
    yield
    _last_progress_update.clear()


@patch("app.tasks.helpers._get_sync_db")
def test_throttle_cleanup_on_terminal_status(mock_db):
    """Completed jobs should be removed from throttle tracker."""
    from app.tasks.helpers import _last_progress_update, _update_job_db

    mock_session = MagicMock()
    mock_job = MagicMock()
    mock_session.query.return_value.filter.return_value.first.return_value = mock_job
    mock_db.return_value = mock_session

    # Simulate progress updates
    _update_job_db("job-1", progress=50, status_message="halfway")
    assert "job-1" in _last_progress_update

    # Simulate completion
    _update_job_db("job-1", status="completed", progress=100)
    assert "job-1" not in _last_progress_update


@patch("app.tasks.helpers._get_sync_db")
def test_throttle_cleanup_on_failed_status(mock_db):
    """Failed jobs should be removed from throttle tracker."""
    from app.tasks.helpers import _last_progress_update, _update_job_db

    mock_session = MagicMock()
    mock_job = MagicMock()
    mock_session.query.return_value.filter.return_value.first.return_value = mock_job
    mock_db.return_value = mock_session

    _update_job_db("job-2", progress=25, status_message="quarter")
    assert "job-2" in _last_progress_update

    _update_job_db("job-2", status="failed", error="boom")
    assert "job-2" not in _last_progress_update


@patch("app.tasks.helpers._get_sync_db")
def test_throttle_skips_small_progress_delta(mock_db):
    """Progress updates < 5% delta should be skipped (throttled)."""
    from app.tasks.helpers import _update_job_db

    mock_session = MagicMock()
    mock_job = MagicMock()
    mock_session.query.return_value.filter.return_value.first.return_value = mock_job
    mock_db.return_value = mock_session

    _update_job_db("job-3", progress=10, status_message="start")
    call_count = mock_session.commit.call_count

    # 12% — only 2% delta, should be throttled
    _update_job_db("job-3", progress=12, status_message="tiny")
    assert mock_session.commit.call_count == call_count  # No new commit

    # 16% — 6% delta from last saved (10%), should go through
    _update_job_db("job-3", progress=16, status_message="bigger")
    assert mock_session.commit.call_count == call_count + 1


@patch("app.tasks.helpers._get_sync_db")
def test_throttle_cleanup_on_cancelled_status(mock_db):
    """Cancelled jobs should be removed from throttle tracker."""
    from app.tasks.helpers import _last_progress_update, _update_job_db

    mock_session = MagicMock()
    mock_job = MagicMock()
    mock_session.query.return_value.filter.return_value.first.return_value = mock_job
    mock_db.return_value = mock_session

    _update_job_db("job-cancel", progress=10, status_message="started")
    assert "job-cancel" in _last_progress_update

    _update_job_db("job-cancel", status="cancelled", error="user_cancelled")
    assert "job-cancel" not in _last_progress_update
