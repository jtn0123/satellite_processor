"""Integration-style tests for the narrowed task-body ``except`` in
``app.tasks.processing`` (JTN-393).

These call the Celery task bodies synchronously via ``.apply()`` while
patching the :class:`SatelliteImageProcessor` import to a stub that
raises a variety of exception classes. They verify:

* Expected failures (e.g. ``ValueError``) hit the narrow handler, mark
  the job failed with a ``"Error: ..."`` status_message, and are
  re-raised for Celery retry.
* Unexpected failures (e.g. ``AttributeError``) fall through to the
  catch-all and mark the job failed with a ``"Crash: ..."`` status —
  distinct from the expected path, so the UI / logs can tell them
  apart — and are still re-raised so Celery surfaces the traceback.
* Our custom :class:`ProcessorError` base is in the expected tuple so
  service code can raise it and get the clean "Error:" status.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from app.errors import ProcessorError, ProcessorRuntimeError
from app.tasks.processing import create_video_task, process_images_task


def _make_processor(exc: type[BaseException], msg: str = "boom") -> MagicMock:
    """Return a MagicMock that raises ``exc(msg)`` on ``process()`` or ``create_video``."""
    proc = MagicMock()
    proc.process.side_effect = exc(msg)
    proc.create_video.side_effect = exc(msg)
    proc.set_input_directory = MagicMock()
    proc.set_output_directory = MagicMock()
    proc.on_progress = None
    proc.on_status_update = None
    return proc


@pytest.fixture
def patched_helpers():
    """Patch out DB / Redis / staging so the task body runs in isolation."""
    with (
        patch("app.tasks.processing._update_job_db") as mock_update,
        patch("app.tasks.processing._publish_progress") as mock_publish,
        patch("app.tasks.processing._get_sync_db"),
        patch("app.tasks.processing._get_redis"),
        patch("app.tasks.processing.log_job_sync"),
        patch("app.tasks.processing._stage_image_paths"),
        patch("app.tasks.processing.configure_processor"),
    ):
        yield mock_update, mock_publish


def _last_status_message(mock_update: MagicMock) -> str:
    """Extract the last ``status_message`` kwarg passed to ``_update_job_db``."""
    for call in reversed(mock_update.call_args_list):
        msg = call.kwargs.get("status_message")
        if msg is not None:
            return msg
    return ""


def _last_status(mock_update: MagicMock) -> str:
    for call in reversed(mock_update.call_args_list):
        status = call.kwargs.get("status")
        if status is not None:
            return status
    return ""


class TestProcessImagesExpectedError:
    def test_value_error_marked_failed_and_reraised(self, patched_helpers, tmp_path):
        mock_update, _ = patched_helpers
        proc = _make_processor(ValueError, "no valid images")

        with patch("app.tasks.processing.SatelliteImageProcessor", return_value=proc):
            result = process_images_task.apply(
                args=[
                    "job-1",
                    {"input_path": str(tmp_path / "in"), "output_path": str(tmp_path / "out")},
                ],
            )

        assert result.failed()
        assert isinstance(result.result, ValueError)
        assert _last_status(mock_update) == "failed"
        assert _last_status_message(mock_update).startswith("Error:")
        assert "no valid images" in _last_status_message(mock_update)

    def test_processor_error_marked_failed(self, patched_helpers, tmp_path):
        mock_update, _ = patched_helpers
        proc = _make_processor(ProcessorRuntimeError, "pipeline stage failed")

        with patch("app.tasks.processing.SatelliteImageProcessor", return_value=proc):
            result = process_images_task.apply(
                args=[
                    "job-2",
                    {"input_path": str(tmp_path / "in"), "output_path": str(tmp_path / "out")},
                ],
            )

        assert result.failed()
        assert isinstance(result.result, ProcessorError)
        assert _last_status_message(mock_update).startswith("Error:")

    def test_file_not_found_marked_failed(self, patched_helpers, tmp_path):
        mock_update, _ = patched_helpers
        proc = _make_processor(FileNotFoundError, "input.png")

        with patch("app.tasks.processing.SatelliteImageProcessor", return_value=proc):
            result = process_images_task.apply(
                args=[
                    "job-3",
                    {"input_path": str(tmp_path / "in"), "output_path": str(tmp_path / "out")},
                ],
            )

        assert result.failed()
        assert isinstance(result.result, FileNotFoundError)
        assert _last_status_message(mock_update).startswith("Error:")


class TestProcessImagesUnexpectedError:
    """Unexpected errors (bugs) must NOT be silently reported as generic failures."""

    def test_attribute_error_marked_crash_and_reraised(self, patched_helpers, tmp_path):
        """The exact scenario called out in JTN-393.

        A misconfigured processor raising ``AttributeError`` must reach
        Celery so the traceback is visible, AND the job must be marked
        failed with a distinct ``Crash:`` status so the UI and metrics
        can distinguish "expected failure" from "unexpected bug".
        """
        mock_update, _ = patched_helpers
        proc = _make_processor(AttributeError, "object has no attribute 'process'")

        with patch("app.tasks.processing.SatelliteImageProcessor", return_value=proc):
            result = process_images_task.apply(
                args=[
                    "job-bug-1",
                    {"input_path": str(tmp_path / "in"), "output_path": str(tmp_path / "out")},
                ],
            )

        # Must be re-raised so Celery sees it.
        assert result.failed()
        assert isinstance(result.result, AttributeError)
        # Job marked failed…
        assert _last_status(mock_update) == "failed"
        # …but with the *distinct* Crash marker.
        last_msg = _last_status_message(mock_update)
        assert last_msg.startswith("Crash:")
        assert "AttributeError" in last_msg
        # And the error field should carry the type name so logs are greppable.
        errors = [call.kwargs.get("error") for call in mock_update.call_args_list if call.kwargs.get("error")]
        assert any("AttributeError" in e for e in errors)

    def test_type_error_marked_crash(self, patched_helpers, tmp_path):
        mock_update, _ = patched_helpers
        proc = _make_processor(TypeError, "bad signature")

        with patch("app.tasks.processing.SatelliteImageProcessor", return_value=proc):
            result = process_images_task.apply(
                args=[
                    "job-bug-2",
                    {"input_path": str(tmp_path / "in"), "output_path": str(tmp_path / "out")},
                ],
            )

        assert result.failed()
        assert isinstance(result.result, TypeError)
        assert _last_status_message(mock_update).startswith("Crash:")


class TestCreateVideoNarrowExcept:
    """Same narrowing pattern applied to ``create_video_task``."""

    def test_value_error_hits_expected_branch(self, patched_helpers, tmp_path):
        mock_update, _ = patched_helpers
        proc = _make_processor(ValueError, "bad fps")

        with patch("app.tasks.processing.SatelliteImageProcessor", return_value=proc):
            result = create_video_task.apply(
                args=[
                    "vid-1",
                    {
                        "input_path": str(tmp_path / "in"),
                        "output_path": str(tmp_path / "out"),
                        "video": {"fps": 24},
                    },
                ],
            )

        assert result.failed()
        assert isinstance(result.result, ValueError)
        assert _last_status_message(mock_update).startswith("Error:")

    def test_attribute_error_hits_crash_branch(self, patched_helpers, tmp_path):
        mock_update, _ = patched_helpers
        proc = _make_processor(AttributeError, "missing create_video")

        with patch("app.tasks.processing.SatelliteImageProcessor", return_value=proc):
            result = create_video_task.apply(
                args=[
                    "vid-2",
                    {
                        "input_path": str(tmp_path / "in"),
                        "output_path": str(tmp_path / "out"),
                        "video": {"fps": 24},
                    },
                ],
            )

        assert result.failed()
        assert isinstance(result.result, AttributeError)
        assert _last_status_message(mock_update).startswith("Crash:")
