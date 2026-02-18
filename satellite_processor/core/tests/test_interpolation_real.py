"""Real tests for interpolation.py — mock only subprocess."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from satellite_processor.core.interpolation import (
    MAX_INTERPOLATION_FACTORS,
    VALID_INTERPOLATION_QUALITIES,
    apply_frame_interpolation,
    apply_interpolation,
    interpolate_frames,
    validate_interpolation_factor,
    validate_interpolation_quality,
)


class TestValidateInterpolationFactor:
    def test_valid_low(self):
        validate_interpolation_factor(2, "Low")
        validate_interpolation_factor(4, "Low")

    def test_valid_high(self):
        validate_interpolation_factor(8, "High")

    def test_too_low(self):
        with pytest.raises(ValueError, match="between 2"):
            validate_interpolation_factor(1, "Low")

    def test_too_high(self):
        with pytest.raises(ValueError, match="between 2"):
            validate_interpolation_factor(5, "Low")

    def test_invalid_quality(self):
        with pytest.raises(ValueError, match="Invalid"):
            validate_interpolation_factor(2, "Ultra")


class TestValidateInterpolationQuality:
    def test_valid(self):
        for q in VALID_INTERPOLATION_QUALITIES:
            validate_interpolation_quality(q)

    def test_invalid(self):
        with pytest.raises(ValueError):
            validate_interpolation_quality("Best")


class TestApplyInterpolation:
    @patch("subprocess.run")
    def test_cpu_success(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        result = apply_interpolation(
            "ffmpeg", Path("/in.mp4"), Path("/out.mp4"), 60, {}
        )
        assert result is True
        cmd = mock_run.call_args[0][0]
        assert "minterpolate" in " ".join(cmd)

    @patch("subprocess.run")
    def test_nvidia_hardware(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        result = apply_interpolation(
            "ffmpeg", Path("/in.mp4"), Path("/out.mp4"), 60,
            {"hardware": "NVIDIA GPU"}
        )
        assert result is True
        cmd = mock_run.call_args[0][0]
        assert "h264_nvenc" in cmd

    @patch("subprocess.run")
    def test_failure(self, mock_run):
        mock_run.return_value = MagicMock(returncode=1)
        result = apply_interpolation(
            "ffmpeg", Path("/in.mp4"), Path("/out.mp4"), 60, {}
        )
        assert result is False

    def test_with_try_encode_fn(self):
        fn = MagicMock(return_value=True)
        result = apply_interpolation(
            "ffmpeg", Path("/in.mp4"), Path("/out.mp4"), 60, {},
            try_encode_fn=fn
        )
        assert result is True
        assert fn.called

    @patch("subprocess.run", side_effect=Exception("boom"))
    def test_exception_returns_false(self, mock_run):
        result = apply_interpolation(
            "ffmpeg", Path("/in.mp4"), Path("/out.mp4"), 60, {}
        )
        assert result is False


class TestApplyFrameInterpolation:
    @patch("subprocess.run")
    def test_success(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        result = apply_frame_interpolation(
            "ffmpeg", Path("/in.mp4"), Path("/out.mp4"), 60
        )
        assert result is True

    @patch("subprocess.run")
    def test_failure(self, mock_run):
        mock_run.return_value = MagicMock(returncode=1, stderr="error")
        result = apply_frame_interpolation(
            "ffmpeg", Path("/in.mp4"), Path("/out.mp4"), 60
        )
        assert result is False


class TestInterpolateFrames:
    @patch("subprocess.run")
    def test_success(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        result = interpolate_frames(
            "ffmpeg", Path("/in.mp4"), Path("/out.mp4"), 60
        )
        assert result is True

    @patch("subprocess.run")
    def test_failure(self, mock_run):
        mock_run.return_value = MagicMock(returncode=1, stderr="err")
        result = interpolate_frames(
            "ffmpeg", Path("/in.mp4"), Path("/out.mp4"), 60
        )
        assert result is False


class TestConstants:
    def test_max_factors(self):
        assert MAX_INTERPOLATION_FACTORS["Low"] == 4
        assert MAX_INTERPOLATION_FACTORS["High"] == 8

    def test_valid_qualities(self):
        assert "Low" in VALID_INTERPOLATION_QUALITIES
        assert "Medium" in VALID_INTERPOLATION_QUALITIES
        assert "High" in VALID_INTERPOLATION_QUALITIES
