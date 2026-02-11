"""
Frame Interpolation Module
--------------------------
Handles video frame interpolation logic including validation
and FFmpeg-based motion interpolation.

Does NOT handle:
- FFmpeg command building (see ffmpeg.py)
- Video creation orchestration (see video_handler.py)
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

# --- Constants ---
MAX_INTERPOLATION_FACTORS = {"Low": 4, "Medium": 6, "High": 8}
VALID_INTERPOLATION_QUALITIES = ["Low", "Medium", "High"]
INTERPOLATION_HIGH_BITRATE = "35M"
INTERPOLATION_HIGH_MAXRATE = "45M"
INTERPOLATION_HIGH_BUFSIZE = "70M"


def validate_interpolation_factor(factor: int, quality: str) -> None:
    """Validate interpolation factor based on quality."""
    max_factor = MAX_INTERPOLATION_FACTORS.get(quality)
    if max_factor is None:
        raise ValueError(f"Invalid interpolation quality: {quality}")
    if not (2 <= factor <= max_factor):
        raise ValueError(
            f"Interpolation factor must be between 2 and {max_factor} for {quality} quality."
        )


def validate_interpolation_quality(quality: str) -> None:
    """Validate interpolation quality."""
    if quality not in VALID_INTERPOLATION_QUALITIES:
        raise ValueError(
            f"Interpolation quality must be one of {VALID_INTERPOLATION_QUALITIES}."
        )


def apply_interpolation(
    ffmpeg_path: str | Path,
    input_path: Path,
    output_path: Path,
    target_fps: int,
    options: dict,
    try_encode_fn=None,
) -> bool:
    """Apply high-quality interpolation with hardware acceleration"""
    try:
        hardware = options.get("hardware", "CPU (Software)")

        hw_params = {
            "NVIDIA": {
                "decode": ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"],
                "codec": "h264_nvenc",
            },
            "Intel": {
                "decode": ["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"],
                "codec": "h264_qsv",
            },
            "AMD": {
                "decode": ["-hwaccel", "amf", "-hwaccel_output_format", "amf"],
                "codec": "h264_amf",
            },
            "CPU": {"decode": [], "codec": "libx264"},
        }

        if "NVIDIA" in hardware:
            hw = hw_params["NVIDIA"]
        elif "Intel" in hardware:
            hw = hw_params["Intel"]
        elif "AMD" in hardware:
            hw = hw_params["AMD"]
        else:
            hw = hw_params["CPU"]

        cmd = [
            str(ffmpeg_path),
            *hw["decode"],
            "-y",
            "-i",
            str(input_path),
            "-filter_complex",
            f"minterpolate=fps={target_fps}:mi_mode=mci",
            "-c:v",
            hw["codec"],
            "-preset",
            "p7" if "nvenc" in hw["codec"] else "slow",
            "-b:v",
            INTERPOLATION_HIGH_BITRATE,
            "-maxrate",
            INTERPOLATION_HIGH_MAXRATE,
            "-bufsize",
            INTERPOLATION_HIGH_BUFSIZE,
            str(output_path),
        ]

        if try_encode_fn:
            return try_encode_fn(cmd, input_path.parent, output_path)

        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0

    except Exception as e:
        logger.error(f"Error in apply_interpolation: {e}", exc_info=True)
        return False


def apply_frame_interpolation(
    ffmpeg_path: str | Path,
    video_path: Path,
    output_path: Path,
    fps: int,
) -> bool:
    """Apply frame interpolation to video"""
    try:
        ffmpeg_cmd = [
            str(ffmpeg_path),
            "-y",
            "-i",
            str(video_path),
            "-filter:v",
            f"minterpolate=fps={fps}:mi_mode=mci:me_mode=bidir:mc_mode=obmc:vsbmc=1:mb_size=16",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(output_path),
        ]

        process = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
        if process.returncode != 0:
            raise RuntimeError(f"FFmpeg interpolation failed: {process.stderr}")
        return True

    except Exception as e:
        logger.error(f"Interpolation failed: {e}", exc_info=True)
        return False


def interpolate_frames(
    ffmpeg_path: str | Path,
    input_path: Path,
    output_path: Path,
    fps: int,
) -> bool:
    """Interpolate frames to increase video smoothness"""
    try:
        ffmpeg_cmd = [
            str(ffmpeg_path),
            "-y",
            "-i",
            str(input_path),
            "-filter:v",
            f"minterpolate=fps={fps}:mi_mode=mci:me_mode=bidir:mc_mode=obmc:vsbmc=1",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "18",
            str(output_path),
        ]

        process = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
        if process.returncode != 0:
            raise RuntimeError(f"FFmpeg interpolation failed: {process.stderr}")
        return True

    except Exception as e:
        logger.error(f"Frame interpolation failed: {e}", exc_info=True)
        return False
