"""Tests for animation_tasks helper functions and constants."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from app.tasks.animation_tasks import (
    PREVIEW_MAX_WIDTH,
    QUALITY_CRF,
    _apply_loop_style,
    _apply_overlay,
    _build_overlay_label,
    _encode_output,
    _mark_animation_failed,
    _process_single_frame,
    _render_frames_to_dir,
    _run_ffmpeg,
)

# ── Constants ────────────────────────────────────────────

def test_quality_crf_values():
    assert QUALITY_CRF == {"low": "28", "medium": "23", "high": "18"}


def test_preview_max_width():
    assert PREVIEW_MAX_WIDTH == 1024


# ── _apply_loop_style ───────────────────────────────────

class TestApplyLoopStyle:
    def test_forward(self):
        frames = [1, 2, 3]
        assert _apply_loop_style(frames, "forward", 10) == [1, 2, 3]

    def test_pingpong(self):
        frames = [1, 2, 3, 4]
        result = _apply_loop_style(frames, "pingpong", 10)
        assert result == [1, 2, 3, 4, 3, 2]

    def test_pingpong_two_frames(self):
        # edge: reversed(frames[1:-1]) is empty
        assert _apply_loop_style([1, 2], "pingpong", 10) == [1, 2]

    def test_hold(self):
        frames = [1, 2, 3]
        result = _apply_loop_style(frames, "hold", 5)
        assert result == [1, 2, 3] + [3] * 10  # fps*2 = 10

    def test_empty_frames(self):
        assert _apply_loop_style([], "hold", 10) == []

    def test_empty_frames_pingpong(self):
        assert _apply_loop_style([], "pingpong", 10) == []

    def test_unknown_style(self):
        assert _apply_loop_style([1, 2], "unknown", 10) == [1, 2]


# ── _build_overlay_label ────────────────────────────────

class TestBuildOverlayLabel:
    def _frame(self, sat="G16", sector="CONUS", band="C02"):
        return SimpleNamespace(satellite=sat, sector=sector, band=band)

    def test_with_label(self):
        result = _build_overlay_label({"label": True}, [self._frame()])
        assert result == "G16 CONUS Band 02"

    def test_no_overlay(self):
        assert _build_overlay_label(None, [self._frame()]) == ""

    def test_label_false(self):
        assert _build_overlay_label({"label": False}, [self._frame()]) == ""

    def test_empty_frames(self):
        assert _build_overlay_label({"label": True}, []) == ""

    def test_no_frames_arg(self):
        assert _build_overlay_label({"label": True}, None) == ""


# ── _process_single_frame ───────────────────────────────

class TestProcessSingleFrame:
    @pytest.fixture()
    def img_500x300(self):
        import numpy as np
        return np.zeros((300, 500, 3), dtype=np.uint8)

    def test_no_transforms(self, img_500x300):
        result = _process_single_frame(img_500x300, None, "full", "100%")
        assert result.shape == (300, 500, 3)

    def test_crop(self, img_500x300):
        crop = SimpleNamespace(x=10, y=20, width=100, height=50)
        result = _process_single_frame(img_500x300, crop, "full", None)
        assert result.shape == (50, 100, 3)

    def test_preview_downscale(self):
        import numpy as np
        big = np.zeros((1000, 2000, 3), dtype=np.uint8)
        result = _process_single_frame(big, None, "preview", None)
        assert result.shape[1] == PREVIEW_MAX_WIDTH

    def test_preview_no_downscale_if_small(self, img_500x300):
        result = _process_single_frame(img_500x300, None, "preview", None)
        assert result.shape == (300, 500, 3)

    def test_scale_50(self, img_500x300):
        result = _process_single_frame(img_500x300, None, "full", "50%")
        assert result.shape == (150, 250, 3)

    def test_scale_200(self, img_500x300):
        result = _process_single_frame(img_500x300, None, "full", "200%")
        assert result.shape == (600, 1000, 3)

    def test_scale_none(self, img_500x300):
        result = _process_single_frame(img_500x300, None, "full", None)
        assert result.shape == (300, 500, 3)


# ── _render_frames_to_dir ───────────────────────────────

class TestRenderFramesToDir:
    @patch("app.tasks.animation_tasks._update_job_db")
    @patch("app.tasks.animation_tasks._publish_progress")
    def test_skips_missing_file(self, mock_pub, mock_upd, tmp_path):
        frame = SimpleNamespace(file_path="/nonexistent/img.png")
        count = _render_frames_to_dir([frame], tmp_path, "j1", None, "full", "100%", None, "")
        assert count == 0
        assert list(tmp_path.glob("frame*.png")) == []

    @patch("app.tasks.animation_tasks._update_job_db")
    @patch("app.tasks.animation_tasks._publish_progress")
    def test_processes_existing_frame(self, mock_pub, mock_upd, tmp_path):
        import cv2
        import numpy as np

        src = tmp_path / "src.png"
        img = np.zeros((100, 100, 3), dtype=np.uint8)
        cv2.imwrite(str(src), img)

        frame = SimpleNamespace(file_path=str(src))
        work = tmp_path / "work"
        work.mkdir()
        _render_frames_to_dir([frame], work, "j1", None, "full", "100%", None, "")
        assert (work / "frame000000.png").exists()


# ── _encode_output ──────────────────────────────────────

class TestEncodeOutput:
    @patch("app.tasks.animation_tasks.subprocess.run")
    @patch("app.tasks.animation_tasks.shutil.which", return_value="/usr/bin/ffmpeg")
    def test_gif_encoding(self, mock_which, mock_run, tmp_path):
        mock_run.return_value = MagicMock(returncode=0)
        out = tmp_path / "out.gif"
        _encode_output("gif", 10, "medium", tmp_path, out)
        assert mock_run.call_count == 2  # palette + encode

    @patch("app.tasks.animation_tasks.subprocess.run")
    @patch("app.tasks.animation_tasks.shutil.which", return_value=None)
    def test_mp4_encoding(self, mock_which, mock_run, tmp_path):
        mock_run.return_value = MagicMock(returncode=0)
        out = tmp_path / "out.mp4"
        _encode_output("mp4", 10, "high", tmp_path, out)
        assert mock_run.call_count == 1
        cmd = mock_run.call_args[0][0]
        assert "-crf" in cmd
        idx = cmd.index("-crf")
        assert cmd[idx + 1] == "18"

    @patch("app.tasks.animation_tasks.subprocess.run")
    @patch("app.tasks.animation_tasks.shutil.which", return_value=None)
    def test_mp4_unknown_quality_defaults(self, mock_which, mock_run, tmp_path):
        mock_run.return_value = MagicMock(returncode=0)
        _encode_output("mp4", 10, "ultra", tmp_path, tmp_path / "o.mp4")
        cmd = mock_run.call_args[0][0]
        idx = cmd.index("-crf")
        assert cmd[idx + 1] == "23"


# ── _mark_animation_failed ─────────────────────────────

class TestMarkAnimationFailed:
    def test_marks_failed(self):
        anim = SimpleNamespace(status="processing", error=None, completed_at=None)
        query = MagicMock()
        query.filter.return_value.first.return_value = anim
        session = MagicMock()
        session.query.return_value = query

        _mark_animation_failed(session, "a1", "boom")
        assert anim.status == "failed"
        assert anim.error == "boom"
        assert anim.completed_at is not None
        session.commit.assert_called_once()

    def test_no_animation_found(self):
        query = MagicMock()
        query.filter.return_value.first.return_value = None
        session = MagicMock()
        session.query.return_value = query
        _mark_animation_failed(session, "a1", "boom")
        session.commit.assert_not_called()

    def test_exception_swallowed(self):
        session = MagicMock()
        session.query.side_effect = Exception("db down")
        _mark_animation_failed(session, "a1", "boom")  # should not raise


# ── _apply_overlay ──────────────────────────────────────

class TestApplyOverlay:
    def _make_img(self, w=200, h=100):
        import numpy as np
        return np.zeros((h, w, 3), dtype=np.uint8)

    def test_with_label_and_timestamp(self):
        from datetime import datetime
        frame = SimpleNamespace(capture_time=datetime(2024, 6, 15, 12, 30, 0))
        overlay = {"label": True, "timestamp": True}
        img = self._make_img()
        result = _apply_overlay(img, frame, overlay, "G16 CONUS Band 02")
        assert result.shape == img.shape

    def test_with_label_only(self):
        frame = SimpleNamespace(capture_time=None)
        overlay = {"label": True, "timestamp": False}
        img = self._make_img()
        result = _apply_overlay(img, frame, overlay, "G16 CONUS Band 02")
        assert result.shape == img.shape

    def test_with_timestamp_only(self):
        from datetime import datetime
        frame = SimpleNamespace(capture_time=datetime(2024, 6, 15, 12, 30, 0))
        overlay = {"label": False, "timestamp": True}
        img = self._make_img()
        result = _apply_overlay(img, frame, overlay, "")
        assert result.shape == img.shape

    def test_no_label_no_timestamp(self):
        frame = SimpleNamespace(capture_time=None)
        overlay = {"label": False, "timestamp": False}
        img = self._make_img()
        result = _apply_overlay(img, frame, overlay, "")
        assert result.shape == img.shape

    def test_timestamp_with_none_capture_time(self):
        frame = SimpleNamespace(capture_time=None)
        overlay = {"label": False, "timestamp": True}
        img = self._make_img()
        result = _apply_overlay(img, frame, overlay, "")
        assert result.shape == img.shape


# ── _run_ffmpeg ─────────────────────────────────────────

class TestRunFfmpeg:
    @patch("app.tasks.animation_tasks.subprocess.run")
    def test_success(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        _run_ffmpeg(["ffmpeg", "-version"])
        mock_run.assert_called_once()

    @patch("app.tasks.animation_tasks.subprocess.run")
    def test_failure_raises(self, mock_run):
        import subprocess
        mock_run.return_value = MagicMock(
            returncode=1, stderr=b"error msg", stdout=b""
        )
        with pytest.raises(subprocess.CalledProcessError):
            _run_ffmpeg(["ffmpeg", "-invalid"])


# ── _render_frames_to_dir with overlay ──────────────────

class TestRenderFramesWithOverlay:
    @patch("app.tasks.animation_tasks._update_job_db")
    @patch("app.tasks.animation_tasks._publish_progress")
    def test_with_overlay(self, mock_pub, mock_upd, tmp_path):
        import cv2
        import numpy as np
        from datetime import datetime

        src = tmp_path / "src.png"
        img = np.zeros((100, 100, 3), dtype=np.uint8)
        cv2.imwrite(str(src), img)

        frame = SimpleNamespace(
            file_path=str(src),
            capture_time=datetime(2024, 1, 1, 12, 0, 0),
            satellite="G16", sector="CONUS", band="C02"
        )
        work = tmp_path / "work"
        work.mkdir()
        overlay = {"label": True, "timestamp": True}
        count = _render_frames_to_dir([frame], work, "j1", None, "full", "100%", overlay, "G16 CONUS Band 02")
        assert count == 1
        assert (work / "frame000000.png").exists()
