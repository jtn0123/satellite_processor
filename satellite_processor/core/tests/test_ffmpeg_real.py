"""Real tests for ffmpeg.py — mock only subprocess calls."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from satellite_processor.core.ffmpeg import (
    SUPPORTED_ENCODERS,
    VALID_IMAGE_EXTENSIONS,
    VALID_VIDEO_EXTENSIONS,
    _collect_frame_files,
    _write_concat_file,
    build_ffmpeg_command,
    find_ffmpeg,
    get_codec,
    get_codec_params,
    get_hardware_params,
    get_supported_encoders,
    validate_encoder,
)


class TestGetCodec:
    def test_h264_cpu(self):
        assert get_codec("H.264", "CPU") == "libx264"

    def test_hevc_cpu(self):
        assert get_codec("HEVC/H.265", "CPU") == "libx265"

    def test_av1_cpu(self):
        assert get_codec("AV1", "CPU") == "libaom-av1"

    def test_h264_nvidia(self):
        assert get_codec("H.264", "NVIDIA") == "h264_nvenc"

    def test_hevc_nvidia(self):
        assert get_codec("HEVC/H.265", "NVIDIA") == "hevc_nvenc"

    def test_h264_intel(self):
        assert get_codec("H.264", "Intel") == "h264_qsv"

    def test_h264_amd(self):
        assert get_codec("H.264", "AMD") == "h264_amf"

    def test_unknown_hardware_falls_back(self):
        assert get_codec("H.264", "Unknown") == "libx264"

    def test_unknown_encoder_defaults_h264(self):
        assert get_codec("Unknown", "CPU") == "libx264"


class TestGetCodecParams:
    def test_cpu_h264(self):
        params = get_codec_params("H.264")
        assert "-c:v" in params
        assert "libx264" in params

    def test_nvidia_hevc(self):
        params = get_codec_params("HEVC", "NVIDIA GPU")
        assert "hevc_nvenc" in params

    def test_includes_bitrate(self):
        params = get_codec_params("H.264")
        assert "-b:v" in params
        assert "-movflags" in params

    def test_av1_cpu(self):
        params = get_codec_params("AV1")
        assert "libaom-av1" in params


class TestGetHardwareParams:
    def test_nvidia(self):
        params = get_hardware_params("NVIDIA")
        assert "-hwaccel" in params
        assert "cuda" in params

    def test_cpu_empty(self):
        assert get_hardware_params("CPU") == []

    def test_unknown_empty(self):
        assert get_hardware_params("Unknown") == []


class TestValidateEncoder:
    def test_valid(self):
        validate_encoder("H.264")  # Should not raise

    def test_invalid(self):
        with pytest.raises(ValueError, match="Unsupported"):
            validate_encoder("VP9")


class TestGetSupportedEncoders:
    def test_returns_list(self):
        result = get_supported_encoders()
        assert isinstance(result, list)
        assert "H.264" in result


class TestFindFfmpeg:
    def test_testing_mode(self):
        result = find_ffmpeg(testing=True)
        assert result == Path("ffmpeg")

    @patch("subprocess.run")
    def test_found_in_path(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        result = find_ffmpeg(testing=False)
        assert result is None or isinstance(result, Path)


class TestWriteConcatFile:
    def test_writes_file_list(self, tmp_path):
        frames = [tmp_path / "f1.png", tmp_path / "f2.png"]
        list_file = tmp_path / "frames.txt"
        _write_concat_file(list_file, frames, {})
        content = list_file.read_text()
        assert "f1.png" in content
        assert "f2.png" in content

    def test_with_duration(self, tmp_path):
        frames = [tmp_path / "f1.png"]
        list_file = tmp_path / "frames.txt"
        _write_concat_file(list_file, frames, {"frame_duration": 0.5})
        content = list_file.read_text()
        assert "duration 0.5" in content


class TestCollectFrameFiles:
    def test_collects_images(self, tmp_path):
        (tmp_path / "img1.png").write_bytes(b"\x89PNG")
        (tmp_path / "img2.jpg").write_bytes(b"\xff\xd8")
        (tmp_path / "notes.txt").write_text("skip")
        result = _collect_frame_files(tmp_path)
        assert len(result) == 2

    def test_empty_dir(self, tmp_path):
        assert _collect_frame_files(tmp_path) == []

    def test_sorted(self, tmp_path):
        (tmp_path / "b.png").write_bytes(b"\x89PNG")
        (tmp_path / "a.png").write_bytes(b"\x89PNG")
        result = _collect_frame_files(tmp_path)
        assert result[0].name == "a.png"


class TestBuildFfmpegCommand:
    def test_basic_command(self, tmp_path):
        # Create frame files
        for i in range(3):
            (tmp_path / f"frame{i:04d}.png").write_bytes(b"\x89PNG")
        output = tmp_path / "out.mp4"
        cmd, temp_dir = build_ffmpeg_command("ffmpeg", tmp_path, output, {"fps": 30})
        assert cmd[0] == "ffmpeg"
        assert cmd[-1] == str(output)

    def test_with_metadata(self, tmp_path):
        for i in range(2):
            (tmp_path / f"frame{i:04d}.png").write_bytes(b"\x89PNG")
        output = tmp_path / "out.mp4"
        cmd, _ = build_ffmpeg_command(
            "ffmpeg", tmp_path, output,
            {"fps": 30, "metadata": {"title": "Test"}}
        )
        assert "-metadata" in cmd


class TestConstants:
    def test_valid_video_extensions(self):
        assert ".mp4" in VALID_VIDEO_EXTENSIONS

    def test_valid_image_extensions(self):
        assert ".png" in VALID_IMAGE_EXTENSIONS

    def test_supported_encoders(self):
        assert len(SUPPORTED_ENCODERS) > 0
