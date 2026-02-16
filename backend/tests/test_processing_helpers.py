"""Tests for processing.py helper functions and constants."""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.tasks.processing import (
    MSG_PROCESSING_COMPLETE,
    MSG_PROCESSING_FAILED,
    MSG_VIDEO_CREATION_COMPLETE,
    _finalize_job,
    _stage_image_paths,
)


# ── _stage_image_paths ──────────────────────────────────

class TestStageImagePaths:
    def test_creates_symlinks(self, tmp_path):
        src_dir = tmp_path / "source"
        src_dir.mkdir()
        img1 = src_dir / "img1.png"
        img1.write_text("data1")
        img2 = src_dir / "img2.png"
        img2.write_text("data2")

        staging = tmp_path / "staging"
        _stage_image_paths(str(staging), [str(img1), str(img2)])

        assert (staging / "img1.png").exists()
        assert (staging / "img2.png").exists()

    def test_skips_if_staging_exists(self, tmp_path):
        staging = tmp_path / "staging"
        staging.mkdir()

        _stage_image_paths(str(staging), ["/nonexistent/img.png"])
        # Should not crash; staging already exists so it returns early

    def test_skips_nonexistent_sources(self, tmp_path):
        staging = tmp_path / "staging"
        _stage_image_paths(str(staging), ["/nonexistent/img.png"])
        assert staging.exists()
        assert list(staging.iterdir()) == []

    def test_skips_existing_destination(self, tmp_path):
        src_dir = tmp_path / "source"
        src_dir.mkdir()
        img = src_dir / "img.png"
        img.write_text("data")

        staging = tmp_path / "staging"
        staging.mkdir()
        existing = staging / "img.png"
        existing.write_text("already_here")

        # Should not overwrite the existing file — but staging already exists so returns early
        _stage_image_paths(str(staging), [str(img)])

    def test_falls_back_to_copy_on_symlink_failure(self, tmp_path):
        src_dir = tmp_path / "source"
        src_dir.mkdir()
        img = src_dir / "img.png"
        img.write_text("data")

        staging = tmp_path / "staging"

        with patch("pathlib.Path.symlink_to", side_effect=OSError("no symlink")):
            _stage_image_paths(str(staging), [str(img)])

        assert (staging / "img.png").exists()
        assert (staging / "img.png").read_text() == "data"

    def test_empty_paths_list(self, tmp_path):
        staging = tmp_path / "staging"
        _stage_image_paths(str(staging), [])
        assert staging.exists()


# ── _finalize_job ───────────────────────────────────────

class TestFinalizeJob:
    @patch("app.tasks.processing._publish_progress")
    @patch("app.tasks.processing._update_job_db")
    def test_success(self, mock_update, mock_publish):
        _finalize_job("job1", True, "/output/path")

        mock_update.assert_called_once()
        args = mock_update.call_args
        assert args[0][0] == "job1"
        assert args[1]["status"] == "completed"
        assert args[1]["progress"] == 100
        assert args[1]["output_path"] == "/output/path"
        assert args[1]["status_message"] == MSG_PROCESSING_COMPLETE

        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][1] == 100

    @patch("app.tasks.processing._publish_progress")
    @patch("app.tasks.processing._update_job_db")
    def test_failure(self, mock_update, mock_publish):
        _finalize_job("job1", False, "/output/path")

        mock_update.assert_called_once()
        args = mock_update.call_args
        assert args[0][0] == "job1"
        assert args[1]["status"] == "failed"
        assert args[1]["status_message"] == MSG_PROCESSING_FAILED

        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][1] == 0


# ── Constants ───────────────────────────────────────────

def test_constants():
    assert MSG_PROCESSING_COMPLETE == "Processing complete"
    assert MSG_PROCESSING_FAILED == "Processing failed"
    assert MSG_VIDEO_CREATION_COMPLETE == "Video creation complete"
