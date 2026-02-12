"""
FFmpeg Command Building & Codec Management
------------------------------------------
Handles FFmpeg command construction, codec parameter selection,
and encoder validation.

Does NOT handle:
- Video creation orchestration (see video_handler.py)
- Frame interpolation (see interpolation.py)
"""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

# --- Constants ---
DEFAULT_BITRATE = "5000k"
DEFAULT_FPS = 30
DEFAULT_PRESET = "slow"
HIGH_BITRATE = "35M"
HIGH_MAXRATE = "45M"
HIGH_BUFSIZE = "70M"
CRF_H264 = "18"
CRF_HEVC = "22"
CRF_AV1 = "26"
CRF_H264_NVIDIA = "16"
CRF_HEVC_NVIDIA = "20"
CRF_AV1_NVIDIA = "24"

SUPPORTED_ENCODERS = [
    "H.264",
    "HEVC/H.265 (Better Compression)",
    "AV1 (Best Quality)",
    "NVIDIA NVENC H.264",
    "NVIDIA NVENC HEVC",
]

VALID_VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov"]
VALID_IMAGE_EXTENSIONS = [".png", ".PNG", ".jpg", ".JPG", ".jpeg", ".JPEG"]

TRANSCODE_QUALITY_PRESETS = {
    "Low": "28",
    "Medium": "23",
    "High": "18",
}

FORMAT_MAP = {
    "MP4": "mp4",
    "AVI": "avi",
    "MKV": "mkv",
    "MOV": "mov",
}


_FFMPEG_WIN_REL = "ffmpeg/bin/ffmpeg.exe"


def find_ffmpeg(testing: bool = False) -> Path | None:
    """Find FFmpeg executable in system PATH or common locations"""
    if testing:
        return Path("ffmpeg")
    try:
        common_paths = [
            Path("C:/ffmpeg/bin/ffmpeg.exe"),
            Path(os.environ.get("PROGRAMFILES", ""), _FFMPEG_WIN_REL),
            Path(os.environ.get("PROGRAMFILES(X86)", ""), _FFMPEG_WIN_REL),
            Path(os.environ.get("LOCALAPPDATA", ""), _FFMPEG_WIN_REL),
            Path(os.path.expanduser("~/ffmpeg/bin/ffmpeg.exe")),
        ]

        for path in common_paths:
            if path.exists():
                logger.debug(f"Found FFmpeg at: {path}")
                return path

        try:
            result = subprocess.run(
                ["ffmpeg", "-version"], capture_output=True, text=True
            )
            if result.returncode == 0:
                return Path("ffmpeg")
        except Exception:
            pass

        return None
    except Exception as e:
        logger.error(f"Error finding FFmpeg: {e}", exc_info=True)
        return None


def check_gpu_support(ffmpeg_path: str | Path) -> bool:
    """Check if NVIDIA GPU encoding is supported"""
    try:
        cmd = [str(ffmpeg_path), "-encoders"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return "h264_nvenc" in result.stdout
    except Exception as e:
        logger.error(f"Error checking GPU support: {e}", exc_info=True)
        return False


def get_codec(encoder: str, hardware: str = "CPU") -> str:
    """Get appropriate codec based on encoder and hardware selection"""
    codec_map = {
        "NVIDIA": {
            "H.264": "h264_nvenc",
            "H.265": "hevc_nvenc",
            "AV1": "av1_nvenc",
        },
        "Intel": {"H.264": "h264_qsv", "H.265": "hevc_qsv", "AV1": "av1_qsv"},
        "AMD": {"H.264": "h264_amf", "H.265": "hevc_amf", "AV1": "av1_amf"},
        "CPU": {"H.264": "libx264", "H.265": "libx265", "AV1": "libaom-av1"},
    }

    base_codec = "H.264"
    if "H.265" in encoder or "HEVC" in encoder:
        base_codec = "H.265"
    elif "AV1" in encoder:
        base_codec = "AV1"

    hw_codecs = codec_map.get(hardware, codec_map["CPU"])
    return hw_codecs.get(base_codec, "libx264")


def get_codec_params(codec: str, hardware: str | None = None) -> list[str]:
    """Get optimal codec parameters based on selected encoder and hardware"""
    codec_map = {
        "NVIDIA": {
            "h264": ["-c:v", "h264_nvenc", "-preset", "p7", "-rc", "vbr", "-cq", CRF_H264_NVIDIA],
            "hevc": ["-c:v", "hevc_nvenc", "-preset", "p7", "-rc", "vbr", "-cq", CRF_HEVC_NVIDIA],
            "av1": ["-c:v", "av1_nvenc", "-preset", "p7", "-rc", "vbr", "-cq", CRF_AV1_NVIDIA],
        },
        "Intel": {
            "h264": ["-c:v", "h264_qsv", "-preset", "slow", "-global_quality", "20"],
            "hevc": ["-c:v", "hevc_qsv", "-preset", "slow", "-global_quality", "24"],
            "av1": ["-c:v", "av1_qsv", "-preset", "slow", "-global_quality", "28"],
        },
        "AMD": {
            "h264": ["-c:v", "h264_amf", "-quality", "quality", "-rc", "cqp", "-qp", CRF_H264],
            "hevc": ["-c:v", "hevc_amf", "-quality", "quality", "-rc", "cqp", "-qp", CRF_HEVC],
            "av1": ["-c:v", "av1_amf", "-quality", "quality", "-rc", "cqp", "-qp", CRF_AV1],
        },
        "CPU": {
            "h264": ["-c:v", "libx264", "-preset", "slow", "-crf", CRF_H264],
            "hevc": ["-c:v", "libx265", "-preset", "slow", "-crf", CRF_HEVC],
            "av1": ["-c:v", "libaom-av1", "-cpu-used", "4", "-crf", CRF_AV1],
        },
    }

    if hardware and "NVIDIA" in hardware:
        params = codec_map["NVIDIA"]
    elif hardware and "Intel" in hardware:
        params = codec_map["Intel"]
    elif hardware and "AMD" in hardware:
        params = codec_map["AMD"]
    else:
        params = codec_map["CPU"]

    if "H.264" in codec:
        base_params = params["h264"]
    elif "HEVC" in codec or "H.265" in codec:
        base_params = params["hevc"]
    else:
        base_params = params["av1"]

    return base_params + [
        "-b:v", HIGH_BITRATE,
        "-maxrate", HIGH_MAXRATE,
        "-bufsize", HIGH_BUFSIZE,
        "-movflags", "+faststart",
    ]


def get_hardware_params(hardware: str) -> list[str]:
    """Get hardware-specific FFmpeg parameters"""
    params = {
        "NVIDIA": ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"],
        "Intel": ["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"],
        "AMD": ["-hwaccel", "amf", "-hwaccel_output_format", "amf"],
        "CPU": [],
    }
    return params.get(hardware, [])


def get_supported_encoders() -> list[str]:
    """Get list of supported encoders"""
    return list(SUPPORTED_ENCODERS)


def validate_encoder(encoder: str) -> None:
    """Validate encoder selection."""
    if encoder not in SUPPORTED_ENCODERS:
        raise ValueError(f"Unsupported encoder selected: {encoder}")


def build_ffmpeg_command(
    ffmpeg_path: str | Path,
    input_path: str | Path,
    output_path: str | Path,
    options: dict,
) -> tuple[list[str], Path | None]:
    """Build FFmpeg command with hardware filters and metadata."""
    try:
        input_dir = Path(input_path).resolve()
        output_path = Path(output_path).resolve()
        temp_dir = None

        input_str = str(input_dir).replace("\\", "/")
        is_unc_path = input_str.startswith("//") or str(input_dir).startswith("\\\\")

        if is_unc_path:
            temp_dir = Path(tempfile.mkdtemp())
            list_file = temp_dir / "frames.txt"
            temp_dir.mkdir(parents=True, exist_ok=True)

            frame_files = _collect_frame_files(input_dir)

            with open(list_file, "w", encoding="utf-8") as f:
                for frame in frame_files:
                    frame_path = str(frame).replace("\\", "/")
                    if is_unc_path and not frame_path.startswith("//"):
                        frame_path = "//" + frame_path.lstrip("/")
                    f.write(f"file '{frame_path}'\n")
                    if options.get("frame_duration"):
                        f.write(f"duration {options['frame_duration']}\n")

            cmd = [
                str(ffmpeg_path).replace("\\", "/"),
                "-y", "-f", "concat", "-safe", "0",
                "-i", str(list_file).replace("\\", "/"),
            ]
        else:
            if options.get("test_mode") or any(input_dir.glob("frame*.png")):
                input_pattern = f"{input_str}/frame%04d.png"
                cmd = [
                    str(ffmpeg_path).replace("\\", "/"),
                    "-y", "-framerate", str(options.get("fps", DEFAULT_FPS)),
                    "-i", input_pattern,
                ]
            else:
                temp_dir = Path(tempfile.mkdtemp())
                list_file = temp_dir / "frames.txt"
                temp_dir.mkdir(parents=True, exist_ok=True)

                frame_files = _collect_frame_files(input_dir)

                with open(list_file, "w", encoding="utf-8") as f:
                    for frame in frame_files:
                        frame_path = str(frame).replace("\\", "/")
                        f.write(f"file '{frame_path}'\n")
                        if options.get("frame_duration"):
                            f.write(f"duration {options['frame_duration']}\n")

                cmd = [
                    str(ffmpeg_path).replace("\\", "/"),
                    "-y", "-f", "concat", "-safe", "0",
                    "-i", str(list_file).replace("\\", "/"),
                ]

        if metadata := options.get("metadata"):
            for key, value in metadata.items():
                cmd.extend(["-metadata", f'{key}="{value}"'])

        cmd.extend(["-framerate", str(options.get("fps", DEFAULT_FPS))])

        hardware = options.get("hardware", "CPU")
        if hardware == "NVIDIA GPU":
            cmd.extend(["-hwaccel", "cuda", "-vf", "scale_cuda"])
        elif hardware == "Intel GPU":
            cmd.extend(["-hwaccel", "qsv", "-vf", "scale_qsv"])
        elif hardware == "AMD GPU":
            cmd.extend(["-hwaccel", "amf", "-vf", "scale_amf"])

        cmd.extend([
            "-c:v", get_codec(options.get("encoder", "H.264"), hardware),
            "-b:v", f"{options.get('bitrate', 5000)}k",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
        ])

        output_str = str(output_path).replace("\\", "/")
        if output_str.startswith("//"):
            output_str = "//" + output_str.lstrip("/")
        cmd.append(output_str)

        return cmd, temp_dir

    except Exception as e:
        logger.error(f"Error building FFmpeg command: {e}", exc_info=True)
        raise


def _collect_frame_files(input_dir: Path) -> list[Path]:
    """Collect and sort frame files from directory"""
    frame_files = []
    for ext in VALID_IMAGE_EXTENSIONS:
        frame_files.extend(input_dir.glob(f"*{ext}"))
    frame_files.sort()
    return frame_files
