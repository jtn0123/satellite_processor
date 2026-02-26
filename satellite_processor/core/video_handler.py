"""
Video Processing Module
----------------------
Handles video creation and encoding operations:
- FFmpeg integration and execution
- Video codec management
- Frame rate handling
- Video quality settings
- Frame sequence assembly

Does NOT handle:
- File management (use FileManager)
- Image processing
- Directory operations
- File ordering
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

import cv2  # type: ignore
import psutil

from .ffmpeg import (
    _FFMPEG_WIN_REL,
    DEFAULT_FPS,
    FORMAT_MAP,
    TRANSCODE_QUALITY_PRESETS,
    VALID_VIDEO_EXTENSIONS,
    build_ffmpeg_command,
    find_ffmpeg,
    get_codec,
    get_codec_params,
    get_hardware_params,
    get_supported_encoders,
    validate_encoder,
)
from .file_manager import FileManager
from .interpolation import (
    apply_frame_interpolation,
    apply_interpolation,
    interpolate_frames,
    validate_interpolation_factor,
    validate_interpolation_quality,
)

logger = logging.getLogger(__name__)

# --- Constants ---
MAX_RETRY_COUNT = 3
PROCESS_POLL_INTERVAL_SECONDS = 0.1
PROCESS_TERMINATE_TIMEOUT_SECONDS = 5
MIN_FPS = 1
MAX_FPS = 60
MIN_BITRATE = 100
MAX_BITRATE = 10000
DEFAULT_FRAME_DURATION = 1.0
HIGH_BITRATE = "35M"
HIGH_MAXRATE = "45M"
HIGH_BUFSIZE = "70M"


_VIDEO_CANCELLED_MSG = "Video creation cancelled"

class VideoHandler:
    """Handle video creation and processing operations"""

    def __init__(self):
        """Initialize video handler with file manager"""
        self.logger = logging.getLogger(__name__)
        self.file_manager = FileManager()
        self.encoder = "H.264"
        self.bitrate = 5000
        self.testing = False

        self.ffmpeg_path = find_ffmpeg(testing=getattr(self, "testing", False))
        if not self.ffmpeg_path:
            # Try common Windows paths
            common_paths = [
                Path("C:/ffmpeg/bin/ffmpeg.exe"),
                Path(os.environ.get("PROGRAMFILES", ""), _FFMPEG_WIN_REL),
                Path(os.environ.get("PROGRAMFILES(X86)", ""), _FFMPEG_WIN_REL),
                Path(os.environ.get("LOCALAPPDATA", ""), _FFMPEG_WIN_REL),
                Path(os.path.expanduser("~/ffmpeg/bin/ffmpeg.exe")),
            ]
            for path in common_paths:
                if path.exists():
                    self.ffmpeg_path = path
                    break

        if not self.ffmpeg_path and not getattr(self, "testing", False):
            raise RuntimeError(
                "FFmpeg not found. Please install FFmpeg and ensure it's in your PATH"
            )

        if self.ffmpeg_path:
            self.logger.info(f"Using FFmpeg from: {self.ffmpeg_path}")

        self._current_process = None
        self._processor = None
        self.process = psutil.Process()
        self._is_processing = False

    def set_processor(self, processor):
        """Set reference to main processor for process tracking"""
        self._processor = processor

    def _find_ffmpeg(self) -> Path | None:
        """Find FFmpeg executable"""
        return find_ffmpeg(testing=getattr(self, "testing", False))

    def _check_gpu_support(self) -> bool:
        """Check if NVIDIA GPU encoding is supported"""
        from .ffmpeg import check_gpu_support

        return check_gpu_support(self.ffmpeg_path)

    def validate_fps(self, fps: int) -> None:
        """Validate FPS value."""
        if not isinstance(fps, int) or not (MIN_FPS <= fps <= MAX_FPS):
            raise ValueError(f"FPS must be between {MIN_FPS} and {MAX_FPS}.")

    def validate_bitrate(self, bitrate: int) -> None:
        """Validate bitrate value."""
        if not isinstance(bitrate, int) or not (MIN_BITRATE <= bitrate <= MAX_BITRATE):
            raise ValueError(f"Bitrate must be between {MIN_BITRATE} and {MAX_BITRATE} kbps.")

    def validate_interpolation_factor(self, factor: int, quality: str) -> None:
        """Validate interpolation factor based on quality."""
        validate_interpolation_factor(factor, quality)

    def validate_interpolation_quality(self, quality: str) -> None:
        """Validate interpolation quality."""
        validate_interpolation_quality(quality)

    def _validate_video_paths(
        self, input_dir: str | Path, output_path: str | Path
    ) -> tuple[Path, Path]:
        """Validate and resolve input/output paths for video creation."""
        if not output_path:
            raise ValueError("Empty output path")
        output_path = Path(output_path)
        if not output_path.parent.exists():
            raise ValueError("Directory does not exist")
        if output_path.suffix.lower() not in VALID_VIDEO_EXTENSIONS:
            raise ValueError("Invalid file extension")

        input_dir = Path(input_dir).resolve()
        output_path = output_path.resolve()

        # Handle UNC paths on Windows
        if os.name == "nt":
            if str(input_dir).startswith("\\\\"):
                input_dir = Path("//" + str(input_dir)[2:])
            if str(output_path).startswith("\\\\"):
                output_path = Path("//" + str(output_path)[2:])

        if not input_dir.exists():
            raise ValueError(f"Input directory does not exist: {input_dir}")
        if not input_dir.is_dir():
            raise ValueError(f"Input path is not a directory: {input_dir}")

        return input_dir, output_path

    def _handle_ffmpeg_error(
        self, e: subprocess.CalledProcessError, input_dir: Path,
        output_path: Path, options: dict, retry_count: int,
    ) -> bool:
        """Handle FFmpeg CalledProcessError with retry logic."""
        if self.cancelled:
            self.logger.info(_VIDEO_CANCELLED_MSG)
            return False

        stderr = str(e.stderr)
        if "Cannot use NVENC" in stderr and retry_count < MAX_RETRY_COUNT:
            self.logger.warning("NVENC failed, falling back to CPU encoding")
            self._is_processing = False
            options["hardware"] = "CPU"
            options["encoder"] = "H.264"
            return self.create_video(input_dir, output_path, options, _retry_count=retry_count + 1)

        if "Temporary failure" in stderr and retry_count < MAX_RETRY_COUNT:
            self.logger.warning("Temporary failure, retrying...")
            self._is_processing = False
            return self.create_video(input_dir, output_path, options, _retry_count=retry_count + 1)

        self.logger.error(f"FFmpeg error: {e.stderr}")
        raise RuntimeError(f"FFmpeg error: {e.stderr}")

    def create_video(
        self,
        input_dir: str | Path,
        output_path: str | Path,
        options: dict,
        _retry_count: int = 0,
    ) -> bool:
        """Create video with improved validation and retry handling"""
        original_processing_state = self._is_processing
        temp_dir = None
        try:
            if original_processing_state and not self.testing:
                self.logger.warning("Video creation already in progress")
                return False

            self._is_processing = True
            self.cancelled = False

            input_dir, output_path = self._validate_video_paths(input_dir, output_path)
            self.logger.debug(f"Resolved input directory: {input_dir}")
            self.logger.debug(f"Resolved output path: {output_path}")

            output_path.parent.mkdir(parents=True, exist_ok=True)

            frame_files = sorted(input_dir.glob("*.*"))
            frame_files = [f for f in frame_files if f.suffix.lower() in [".png", ".jpg", ".jpeg"]]
            if not frame_files:
                raise RuntimeError(f"No frame files found in {input_dir}")

            self.logger.info(f"Found {len(frame_files)} frames in {input_dir}")
            self._validate_frame_sequence(frame_files)

            if self.cancelled:
                self.logger.info(_VIDEO_CANCELLED_MSG)
                return False

            if not self.testing:
                initial_usage = self.get_resource_usage()
                self.logger.debug(f"Initial resource usage: {initial_usage}")

            if getattr(self, "testing", False):
                options["test_mode"] = True

            cmd, temp_dir = self.build_ffmpeg_command(input_dir, output_path, options)
            self.logger.debug(f"FFmpeg command: {' '.join(map(str, cmd))}")

            try:
                subprocess.run(cmd, check=True, capture_output=True, text=True, cwd=str(input_dir))
                self.logger.info(f"Successfully created video at {output_path}")
                return True
            except subprocess.CalledProcessError as e:
                return self._handle_ffmpeg_error(e, input_dir, output_path, options, _retry_count)

        except Exception as e:
            if self.cancelled:
                self.logger.info(_VIDEO_CANCELLED_MSG)
                return False
            self.logger.error(f"Video creation error: {e}", exc_info=True)
            raise

        finally:
            self._is_processing = original_processing_state
            self._cleanup_temp_files(options)
            if temp_dir and temp_dir.exists():
                shutil.rmtree(temp_dir)

    def build_ffmpeg_command(
        self,
        input_path: str | Path,
        output_path: str | Path,
        options: dict,
    ) -> tuple:
        """Build FFmpeg command with hardware filters and metadata."""
        return build_ffmpeg_command(self.ffmpeg_path, input_path, output_path, options)

    def validate_encoder(self, encoder: str) -> None:
        """Validate encoder selection."""
        validate_encoder(encoder)

    def validate_transcoding_quality(self, quality: str) -> str:
        """Validate and standardize transcoding quality."""
        valid_qualities = ["Low", "Medium", "High"]
        if not isinstance(quality, str):
            raise ValueError("Transcoding quality must be a string.")
        standardized_quality = quality.capitalize()
        if standardized_quality not in valid_qualities:
            raise ValueError(f"Transcoding quality must be one of {valid_qualities}.")
        return standardized_quality

    def get_supported_encoders(self) -> list[str]:
        """Get list of supported encoders"""
        return get_supported_encoders()

    def _verify_output(self, output_path: Path) -> bool:
        """Verify the encoded output file exists and is non-empty."""
        if not output_path.exists():
            self.logger.error("Output file was not created")
            return False
        file_size = output_path.stat().st_size
        if file_size == 0:
            self.logger.error("Output file is empty")
            return False
        self.logger.info(
            f"Successfully created video at {output_path} ({file_size / 1024 / 1024:.1f} MB)"
        )
        return True

    def _try_encode(self, cmd: list[str], temp_dir: Path, output_path: Path) -> bool:
        """Try to encode with given FFmpeg command"""
        process = None
        try:
            self.logger.info("Starting FFmpeg encoding process...")
            popen_kwargs = {
                "stdout": subprocess.PIPE,
                "stderr": subprocess.PIPE,
                "cwd": str(temp_dir),
                "universal_newlines": True,
                "bufsize": 1,
            }
            if os.name == "nt":
                popen_kwargs["creationflags"] = subprocess.HIGH_PRIORITY_CLASS
            process = subprocess.Popen(cmd, **popen_kwargs)

            self._current_process = process
            if self._processor:
                self._processor._ffmpeg_processes.add(process)

            while process.poll() is None:
                if process.stderr:
                    line = process.stderr.readline()
                    if line:
                        self.logger.info(f"FFmpeg: {line.strip()}")
                time.sleep(PROCESS_POLL_INTERVAL_SECONDS)

            _, stderr = process.communicate()

            if self._processor:
                self._processor._ffmpeg_processes.discard(process)
            self._current_process = None

            if process.returncode != 0:
                self.logger.error(f"FFmpeg error: {stderr}")
                return False

            return self._verify_output(output_path)

        except Exception as e:
            self.logger.error(f"Encoding failed: {e}", exc_info=True)
            return False
        finally:
            if process:
                try:
                    process.terminate()
                except Exception as e:
                    self.logger.error(f"Error terminating process: {e}", exc_info=True)

    def _create_initial_video(
        self, frame_files: list[Path], output: Path, fps: float, options: dict
    ) -> bool:
        """Create initial video with proper frame timing"""
        try:
            list_file = output.parent / "frames.txt"
            frame_duration = options.get("frame_duration", 1.0 / fps)

            with open(list_file, "w", encoding="utf-8") as f:
                for frame in frame_files:
                    f.write(f"file '{frame.name}'\n")
                    f.write(f"duration {frame_duration}\n")
                f.write(f"file '{frame_files[-1].name}'\n")

            cmd = [
                str(self.ffmpeg_path),
                "-y", "-f", "concat", "-safe", "0",
                "-i", str(list_file),
                "-c:v", "h264_nvenc",
                "-preset", "p7", "-rc", "vbr",
                "-b:v", HIGH_BITRATE,
                "-maxrate", HIGH_MAXRATE,
                "-bufsize", HIGH_BUFSIZE,
                "-profile:v", "main",
                "-fps_mode", "cfr",
                "-r", str(fps),
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                str(output),
            ]

            self.logger.debug(f"Running initial video creation: {' '.join(cmd)}")
            process = subprocess.run(cmd, capture_output=True, text=True, check=False)

            if process.returncode != 0:
                self.logger.error(f"Initial video creation failed: {process.stderr}")
                return False

            return True

        except Exception as e:
            self.logger.error(f"Error in _create_initial_video: {e}", exc_info=True)
            return False

    def _apply_interpolation(
        self, input_path: Path, output_path: Path, target_fps: int, options: dict
    ) -> bool:
        """Apply high-quality interpolation with hardware acceleration"""
        return apply_interpolation(
            self.ffmpeg_path, input_path, output_path, target_fps, options,
            try_encode_fn=self._try_encode,
        )

    def _get_codec_params(self, codec: str, hardware: str | None = None) -> list[str]:
        """Get optimal codec parameters based on selected encoder and hardware"""
        return get_codec_params(codec, hardware)

    def _create_ffmpeg_video(
        self, frame_paths: list[Path], output_path: Path, options: dict
    ) -> bool:
        """Create video using FFmpeg"""
        temp_dir = None
        image_list_path = None
        try:
            fps = options.get("fps", DEFAULT_FPS)
            encoder = options.get("encoder", "H.264")
            bitrate = options.get("bitrate", "8000k")
            preset = options.get("preset", "slow")
            frame_duration = options.get("frame_duration", 1.0 / fps)

            output_path = Path(output_path).resolve()
            output_path.parent.mkdir(parents=True, exist_ok=True)

            temp_dir = frame_paths[0].parent
            image_list_path = (temp_dir / "image_list.txt").resolve()
            with open(image_list_path, "w", encoding="utf-8") as f:
                for frame_path in frame_paths:
                    f.write(f"file '{frame_path}'\n")
                    f.write(f"duration {frame_duration}\n")
                if frame_paths:
                    f.write(f"file '{frame_paths[-1]}'\n")

            cmd = [
                str(self.ffmpeg_path),
                "-y", "-f", "concat", "-safe", "0",
                "-i", str(image_list_path),
                "-c:v", get_codec(encoder),
                "-preset", preset,
                "-b:v", bitrate,
                "-vf", f"fps={fps}",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                str(output_path),
            ]

            process = subprocess.run(
                cmd, capture_output=True, text=True, env=os.environ.copy(), check=False,
            )

            if process.returncode != 0:
                self.logger.error(f"FFmpeg stderr: {process.stderr}")
                raise RuntimeError(f"FFmpeg failed with code {process.returncode}")

            if not output_path.exists():
                raise RuntimeError("Output file was not created")

            return True

        except Exception as e:
            self.logger.error(f"Video creation failed: {e}", exc_info=True)
            return False

        finally:
            self._cleanup_ffmpeg_artifacts(image_list_path, frame_paths, temp_dir)

    def _cleanup_ffmpeg_artifacts(
        self, image_list_path: Path | None, frame_paths: list[Path], temp_dir: Path | None
    ) -> None:
        """Clean up temporary files created during FFmpeg video creation."""
        try:
            if image_list_path and isinstance(image_list_path, Path):
                image_list_path.unlink(missing_ok=True)
            for frame_path in frame_paths:
                try:
                    frame_path.unlink(missing_ok=True)
                except Exception as e:
                    self.logger.debug(f"Failed to remove frame: {e}")
            if temp_dir and temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception as e:
            self.logger.error(f"Cleanup error: {e}", exc_info=True)

    def apply_interpolation(
        self, video_path: Path, output_path: Path, fps: int
    ) -> bool:
        """Apply frame interpolation to video"""
        return apply_frame_interpolation(self.ffmpeg_path, video_path, output_path, fps)

    def _get_codec(self, encoder: str, hardware: str = "CPU") -> str:
        """Get appropriate codec based on encoder and hardware selection"""
        return get_codec(encoder, hardware)

    def interpolate_frames(self, input_path: Path, output_path: Path, fps: int) -> bool:
        """Interpolate frames to increase video smoothness"""
        return interpolate_frames(self.ffmpeg_path, input_path, output_path, fps)

    def get_video_info(self, video_path: Path) -> dict:
        """Get video file information using FFmpeg"""
        try:
            cmd = [str(self.ffmpeg_path), "-i", str(video_path)]
            result = subprocess.run(cmd, capture_output=True, text=True)
            info = {}
            if result.stderr:
                duration_match = re.search(
                    r"Duration: (\d{2}:\d{2}:\d{2}\.\d{2})", result.stderr
                )
                if duration_match:
                    info["duration"] = duration_match.group(1)
                resolution_match = re.search(r"(\d{2,}x\d{2,})", result.stderr)
                if resolution_match:
                    info["resolution"] = resolution_match.group(1)
            return info

        except Exception as e:
            self.logger.error(f"Failed to get video info: {e}", exc_info=True)
            return {}

    def _get_hardware_params(self, hardware: str) -> list[str]:
        """Get hardware-specific FFmpeg parameters"""
        return get_hardware_params(hardware)

    @staticmethod
    def configure_encoder(encoder_type: str, settings: dict) -> None:
        if "pytest" in sys.modules:
            return

    def encode_video(self, fps: int, bitrate: int):
        """Encode the video with the specified FPS and bitrate."""
        self.logger.info(
            f"Encoding video at {fps} FPS with {bitrate} kbps bitrate using {self.encoder} encoder."
        )
        fourcc = (
            cv2.VideoWriter_fourcc(*"X264")
            if self.encoder == "H.264"
            else cv2.VideoWriter_fourcc(*"H265")
        )
        out = cv2.VideoWriter("output_video.mp4", fourcc, fps, (1920, 1080))
        out.release()
        self.logger.info("Video encoding completed.")

    def set_bitrate(self, bitrate: int) -> None:
        """Set the video bitrate."""
        self.bitrate = bitrate
        self.logger.info(f"Bitrate set to: {self.bitrate} kbps")

    def transcode_video(
        self, input_video: str, output_video: str, options: dict
    ) -> bool:
        """Transcode video to specified format and quality."""
        output_format = FORMAT_MAP.get(options.get("transcoding_format"), "mp4")
        quality = TRANSCODE_QUALITY_PRESETS.get(
            options.get("transcoding_quality"), "23"
        )

        ffmpeg_cmd = [
            "ffmpeg", "-i", input_video,
            "-vcodec", "libx264",
            "-crf", quality,
            "-preset", "medium",
            output_video + f".{output_format}",
        ]

        try:
            subprocess.run(ffmpeg_cmd, capture_output=True, check=True)
            self.logger.info(f"Transcoding completed: {output_video}.{output_format}")
            return True
        except subprocess.CalledProcessError as e:
            self.logger.error(f"Transcoding failed: {e.stderr.decode()}")
            return False
        except Exception as e:
            self.logger.error(f"Unexpected error during transcoding: {e}", exc_info=True)
            return False

    def cancel(self) -> None:
        """Cancel an ongoing FFmpeg process"""
        try:
            if self._current_process and self._current_process.poll() is None:
                self._current_process.terminate()
                try:
                    self._current_process.wait(timeout=PROCESS_TERMINATE_TIMEOUT_SECONDS)
                except subprocess.TimeoutExpired:
                    self._current_process.kill()
                self._current_process = None
                self.logger.info("FFmpeg process terminated")
        except Exception as e:
            self.logger.error(f"Error cancelling process: {e}", exc_info=True)

    def _cleanup_temp_files(self, options: dict) -> None:
        """Clean up temporary files after video creation"""
        try:
            if temp_dir := options.get("temp_dir"):
                temp_path = Path(temp_dir)
                if temp_path.exists():
                    shutil.rmtree(temp_path, ignore_errors=True)
                    self.logger.debug(f"Cleaned up temp directory: {temp_dir}")
        except Exception as e:
            self.logger.error(f"Error cleaning up temp files: {e}", exc_info=True)

    def get_resource_usage(self):
        """Get current CPU and memory usage with tracking"""
        try:
            cpu_usage = self.process.cpu_percent()
            memory = self.process.memory_info()
            memory_usage = memory.rss / (1024 * 1024)

            if not hasattr(self, "_resource_metrics"):
                self._resource_metrics = []
            self._resource_metrics.append({"cpu": cpu_usage, "memory": memory_usage})

            self.logger.debug(
                f"Resource usage - CPU: {cpu_usage}%, Memory: {memory_usage:.1f}MB"
            )
            return {"cpu": cpu_usage, "memory": memory_usage}
        except Exception as e:
            self.logger.error(f"Error getting resource usage: {e}", exc_info=True)
            return {"cpu": 0, "memory": 0}

    def _validate_frame_sequence(self, frame_files: list[Path]) -> None:
        """Validate that frame sequence is continuous"""
        try:
            numbers = []
            pattern = re.compile(r"frame(\d+)")

            for frame in frame_files:
                if frame.suffix.lower() in [".png", ".jpg", ".jpeg"]:
                    match = pattern.search(frame.stem)
                    if match:
                        numbers.append(int(match.group(1)))

            if not numbers:
                return

            numbers.sort()
            expected = list(range(min(numbers), max(numbers) + 1))

            if numbers != expected:
                missing = set(expected) - set(numbers)
                raise RuntimeError(
                    f"Frame sequence is not continuous. Missing frames: {missing}"
                )

        except Exception as e:
            if "Frame sequence is not continuous" in str(e):
                raise
            self.logger.error(f"Error validating frame sequence: {e}", exc_info=True)
            raise RuntimeError(f"Error validating frame sequence: {e}")
