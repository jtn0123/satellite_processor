"""Real tests for video_handler.py — mock subprocess and ffmpeg finding."""

import re
from pathlib import Path
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pytest

from satellite_processor.core.video_handler import (
    DEFAULT_FRAME_DURATION,
    MAX_BITRATE,
    MAX_FPS,
    MIN_BITRATE,
    MIN_FPS,
    VideoHandler,
)


@pytest.fixture
def vh():
    """Create VideoHandler with testing=True to skip ffmpeg check."""
    with patch("satellite_processor.core.video_handler.find_ffmpeg", return_value=Path("ffmpeg")):
        handler = VideoHandler()
        handler.testing = True
        return handler


@pytest.fixture
def frame_dir(tmp_path):
    """Create a temp dir with real frame images."""
    img = np.zeros((64, 64, 3), dtype=np.uint8)
    for i in range(5):
        cv2.imwrite(str(tmp_path / f"frame{i:04d}.png"), img)
    return tmp_path


class TestVideoHandlerInit:
    def test_init(self, vh):
        assert vh.encoder == "H.264"
        assert vh.bitrate == 5000
        assert vh.testing is True


class TestValidateFps:
    def test_valid(self, vh):
        vh.validate_fps(30)

    def test_too_low(self, vh):
        with pytest.raises(ValueError):
            vh.validate_fps(0)

    def test_too_high(self, vh):
        with pytest.raises(ValueError):
            vh.validate_fps(61)

    def test_not_int(self, vh):
        with pytest.raises(ValueError):
            vh.validate_fps(30.5)


class TestValidateBitrate:
    def test_valid(self, vh):
        vh.validate_bitrate(5000)

    def test_too_low(self, vh):
        with pytest.raises(ValueError):
            vh.validate_bitrate(50)

    def test_too_high(self, vh):
        with pytest.raises(ValueError):
            vh.validate_bitrate(20000)


class TestValidateEncoder:
    def test_valid(self, vh):
        vh.validate_encoder("H.264")

    def test_invalid(self, vh):
        with pytest.raises(ValueError):
            vh.validate_encoder("VP9")


class TestValidateTranscodingQuality:
    def test_valid(self, vh):
        assert vh.validate_transcoding_quality("high") == "High"
        assert vh.validate_transcoding_quality("Low") == "Low"

    def test_invalid(self, vh):
        with pytest.raises(ValueError):
            vh.validate_transcoding_quality("ultra")

    def test_not_string(self, vh):
        with pytest.raises(ValueError):
            vh.validate_transcoding_quality(42)


class TestValidateInterpolation:
    def test_valid_factor(self, vh):
        vh.validate_interpolation_factor(2, "Low")

    def test_invalid_factor(self, vh):
        with pytest.raises(ValueError):
            vh.validate_interpolation_factor(10, "Low")

    def test_valid_quality(self, vh):
        vh.validate_interpolation_quality("High")

    def test_invalid_quality(self, vh):
        with pytest.raises(ValueError):
            vh.validate_interpolation_quality("Best")


class TestValidateVideoPaths:
    def test_valid(self, vh, frame_dir):
        output = frame_dir / "out.mp4"
        inp, out = vh._validate_video_paths(frame_dir, output)
        assert inp.exists()

    def test_empty_output(self, vh, frame_dir):
        with pytest.raises(ValueError, match="Empty"):
            vh._validate_video_paths(frame_dir, "")

    def test_bad_extension(self, vh, frame_dir):
        with pytest.raises(ValueError, match="extension"):
            vh._validate_video_paths(frame_dir, frame_dir / "out.txt")

    def test_nonexistent_input(self, vh, tmp_path):
        with pytest.raises(ValueError, match="does not exist"):
            vh._validate_video_paths(tmp_path / "nope", tmp_path / "out.mp4")

    def test_input_not_dir(self, vh, tmp_path):
        f = tmp_path / "file.txt"
        f.write_text("x")
        with pytest.raises(ValueError, match="not a directory"):
            vh._validate_video_paths(f, tmp_path / "out.mp4")

    def test_output_dir_not_exists(self, vh, frame_dir, tmp_path):
        with pytest.raises(ValueError, match="Directory does not exist"):
            vh._validate_video_paths(frame_dir, tmp_path / "nope" / "out.mp4")


class TestValidateFrameSequence:
    def test_continuous(self, vh, frame_dir):
        frames = sorted(frame_dir.glob("*.png"))
        vh._validate_frame_sequence(frames)  # Should not raise

    def test_gap(self, vh, tmp_path):
        for i in [0, 1, 3]:  # missing frame2
            (tmp_path / f"frame{i:04d}.png").write_bytes(b"\x89PNG")
        frames = sorted(tmp_path.glob("*.png"))
        with pytest.raises(RuntimeError, match="not continuous"):
            vh._validate_frame_sequence(frames)

    def test_no_frame_pattern(self, vh, tmp_path):
        (tmp_path / "img.png").write_bytes(b"\x89PNG")
        vh._validate_frame_sequence([tmp_path / "img.png"])  # No numbers, should pass


class TestSetBitrate:
    def test_set(self, vh):
        vh.set_bitrate(8000)
        assert vh.bitrate == 8000


class TestGetSupportedEncoders:
    def test_returns_list(self, vh):
        result = vh.get_supported_encoders()
        assert "H.264" in result


class TestGetResourceUsage:
    def test_returns_dict(self, vh):
        usage = vh.get_resource_usage()
        assert "cpu" in usage
        assert "memory" in usage


class TestGetVideoInfo:
    @patch("subprocess.run")
    def test_parses_duration(self, mock_run, vh):
        mock_run.return_value = MagicMock(
            stderr="Duration: 00:01:30.50, start: 0.000000\nStream #0:0: Video: h264, 1920x1080"
        )
        info = vh.get_video_info(Path("test.mp4"))
        assert info["duration"] == "00:01:30.50"
        assert info["resolution"] == "1920x1080"

    @patch("subprocess.run", side_effect=Exception("fail"))
    def test_error_returns_empty(self, mock_run, vh):
        assert vh.get_video_info(Path("test.mp4")) == {}


class TestCancel:
    def test_cancel_no_process(self, vh):
        vh._current_process = None
        vh.cancel()  # Should not raise

    def test_cancel_running_process(self, vh):
        proc = MagicMock()
        proc.poll.return_value = None
        vh._current_process = proc
        vh.cancel()
        proc.terminate.assert_called_once()


class TestCreateVideo:
    @patch("subprocess.run")
    def test_success(self, mock_run, vh, frame_dir):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        output = frame_dir / "out.mp4"
        result = vh.create_video(frame_dir, output, {"fps": 30})
        assert result is True

    @patch("subprocess.run")
    def test_no_frames(self, mock_run, vh, tmp_path):
        output = tmp_path / "out.mp4"
        with pytest.raises(RuntimeError, match="No frame files"):
            vh.create_video(tmp_path, output, {"fps": 30})


class TestCleanupTempFiles:
    def test_with_temp_dir(self, vh, tmp_path):
        td = tmp_path / "temp"
        td.mkdir()
        (td / "file.txt").write_text("data")
        vh._cleanup_temp_files({"temp_dir": str(td)})
        assert not td.exists()

    def test_no_temp_dir(self, vh):
        vh._cleanup_temp_files({})  # Should not raise


class TestConfigureEncoder:
    def test_in_test(self, vh):
        VideoHandler.configure_encoder("H.264", {})  # Should return early in pytest


class TestBuildFfmpegCommand:
    def test_builds_command(self, vh, frame_dir):
        for i in range(3):
            (frame_dir / f"frame{i:04d}.png").write_bytes(b"\x89PNG")
        cmd, td = vh.build_ffmpeg_command(frame_dir, frame_dir / "out.mp4", {"fps": 30})
        assert len(cmd) > 0
        assert "ffmpeg" in cmd[0]


class TestGetCodec:
    def test_delegates(self, vh):
        codec = vh._get_codec("H.264")
        assert codec == "libx264"

    def test_hardware(self, vh):
        codec = vh._get_codec("H.264", "NVIDIA")
        assert codec == "h264_nvenc"
