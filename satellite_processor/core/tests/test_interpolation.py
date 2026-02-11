"""Tests for interpolation.py — command building (#145)."""

from unittest.mock import MagicMock, patch
from pathlib import Path

from satellite_processor.core.interpolation import (
    _run_minterpolate,
    apply_frame_interpolation,
    apply_interpolation,
    interpolate_frames,
    validate_interpolation_factor,
    validate_interpolation_quality,
)
import pytest


class TestValidation:
    def test_valid_factor(self):
        validate_interpolation_factor(2, "Low")

    def test_invalid_factor_too_high(self):
        with pytest.raises(ValueError):
            validate_interpolation_factor(10, "Low")

    def test_invalid_quality(self):
        with pytest.raises(ValueError):
            validate_interpolation_quality("Ultra")

    def test_valid_quality(self):
        validate_interpolation_quality("High")


class TestRunMinterpolate:
    @patch("satellite_processor.core.interpolation.subprocess.run")
    def test_basic_command(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        result = _run_minterpolate("ffmpeg", Path("/in.mp4"), Path("/out.mp4"), 60)
        assert result is True
        cmd = mock_run.call_args[0][0]
        assert "ffmpeg" in cmd[0]
        assert "-filter:v" in cmd
        assert any("minterpolate" in c for c in cmd)

    @patch("satellite_processor.core.interpolation.subprocess.run")
    def test_with_pix_fmt_and_faststart(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        _run_minterpolate("ffmpeg", Path("/in.mp4"), Path("/out.mp4"), 60, pix_fmt=True, faststart=True, mb_size=16)
        cmd = mock_run.call_args[0][0]
        assert "-pix_fmt" in cmd
        assert "-movflags" in cmd
        assert "mb_size=16" in cmd[cmd.index("-filter:v") + 1]

    @patch("satellite_processor.core.interpolation.subprocess.run")
    def test_failure(self, mock_run):
        mock_run.return_value = MagicMock(returncode=1, stderr="error")
        result = _run_minterpolate("ffmpeg", Path("/in.mp4"), Path("/out.mp4"), 60)
        assert result is False


class TestApplyFrameInterpolation:
    @patch("satellite_processor.core.interpolation._run_minterpolate", return_value=True)
    def test_delegates(self, mock):
        result = apply_frame_interpolation("ffmpeg", Path("/in"), Path("/out"), 60)
        assert result is True
        mock.assert_called_once()


class TestInterpolateFrames:
    @patch("satellite_processor.core.interpolation._run_minterpolate", return_value=True)
    def test_delegates(self, mock):
        result = interpolate_frames("ffmpeg", Path("/in"), Path("/out"), 60)
        assert result is True
        mock.assert_called_once()
