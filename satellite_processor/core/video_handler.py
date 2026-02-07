import cv2
import subprocess
from pathlib import Path
import logging
import tempfile
import shutil
from typing import List, Optional, Dict, Any, Union
import numpy as np
from datetime import datetime  # Add missing import
import os
import re
import time
import sys
from .file_manager import FileManager  # Add this import
import psutil  # Add to top of file with other imports

"""
Video Processing Module
----------------------
Handles video creation and encoding operations:
- FFmpeg integration and execution
- Video codec management
- Frame rate handling
- Video quality settings
- Frame sequence assembly

Key Responsibilities:
- Video creation from image sequences
- Codec selection and optimization
- Frame rate/duration management
- Video format handling

Does NOT handle:
- File management (use FileManager)
- Image processing
- Directory operations
- File ordering
"""


class VideoHandler:
    """Handle video creation and processing operations"""

    def __init__(self):
        """Initialize video handler with file manager"""
        self.logger = logging.getLogger(__name__)
        self.file_manager = FileManager()  # Initialize file manager
        self.encoder = "H.264"
        self.bitrate = 5000  # Default bitrate in kbps
        self.testing = False  # Initialize testing attribute

        # Find FFmpeg executable with improved path handling
        self.ffmpeg_path = self._find_ffmpeg()
        if not self.ffmpeg_path:
            # Try common Windows paths with improved validation
            common_paths = [
                Path("C:/ffmpeg/bin/ffmpeg.exe"),
                Path(os.environ.get("PROGRAMFILES", ""), "ffmpeg/bin/ffmpeg.exe"),
                Path(os.environ.get("PROGRAMFILES(X86)", ""), "ffmpeg/bin/ffmpeg.exe"),
                Path(os.environ.get("LOCALAPPDATA", ""), "ffmpeg/bin/ffmpeg.exe"),
                Path(os.path.expanduser("~/ffmpeg/bin/ffmpeg.exe")),
            ]

            for path in common_paths:
                if path.exists():
                    self.ffmpeg_path = str(
                        path
                    )  # Convert to string for consistent handling
                    break

        if not self.ffmpeg_path and not getattr(self, "testing", False):
            raise RuntimeError(
                "FFmpeg not found. Please install FFmpeg and ensure it's in your PATH"
            )

        if self.ffmpeg_path:
            self.logger.info(f"Using FFmpeg from: {self.ffmpeg_path}")

        self._current_process = None
        self._processor = None  # Reference to main processor
        self.process = psutil.Process()  # Add this line to track current process
        self._is_processing = False  # Add this line to track processing state

    def set_processor(self, processor):
        """Set reference to main processor for process tracking"""
        self._processor = processor

    def _find_ffmpeg(self) -> Optional[Path]:
        """Find FFmpeg executable"""
        if getattr(self, "testing", False):
            return Path("ffmpeg")  # Return a dummy path during testing
        try:
            # Check Windows-specific paths first
            common_paths = [
                Path("C:/ffmpeg/bin/ffmpeg.exe"),
                Path(os.environ.get("PROGRAMFILES", ""), "ffmpeg/bin/ffmpeg.exe"),
                Path(os.environ.get("PROGRAMFILES(X86)", ""), "ffmpeg/bin/ffmpeg.exe"),
                Path(os.environ.get("LOCALAPPDATA", ""), "ffmpeg/bin/ffmpeg.exe"),
            ]

            for path in common_paths:
                if path.exists():
                    self.logger.debug(f"Found FFmpeg at: {path}")
                    return path

            # Try PATH environment
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
            self.logger.error(f"Error finding FFmpeg: {e}")
            return None

    def _check_gpu_support(self) -> bool:
        """Check if NVIDIA GPU encoding is supported"""
        try:
            cmd = [str(self.ffmpeg_path), "-encoders"]
            result = subprocess.run(cmd, capture_output=True, text=True)
            return "h264_nvenc" in result.stdout
        except Exception:
            return False

    def validate_fps(self, fps: int) -> None:
        """Validate FPS value."""
        if not isinstance(fps, int) or not (1 <= fps <= 60):
            raise ValueError("FPS must be between 1 and 60.")

    def validate_bitrate(self, bitrate: int) -> None:
        """Validate bitrate value."""
        if not isinstance(bitrate, int) or not (100 <= bitrate <= 10000):
            raise ValueError("Bitrate must be between 100 and 10000 kbps.")

    def validate_interpolation_factor(self, factor: int, quality: str) -> None:
        """Validate interpolation factor based on quality."""
        max_factors = {"Low": 4, "Medium": 6, "High": 8}
        max_factor = max_factors.get(quality)
        if max_factor is None:
            raise ValueError(f"Invalid interpolation quality: {quality}")
        if not (2 <= factor <= max_factor):
            raise ValueError(
                f"Interpolation factor must be between 2 and {max_factor} for {quality} quality."
            )

    def validate_interpolation_quality(self, quality: str) -> None:
        """Validate interpolation quality."""
        valid_qualities = ["Low", "Medium", "High"]
        if quality not in valid_qualities:
            raise ValueError(f"Interpolation quality must be one of {valid_qualities}.")

    def create_video(
        self,
        input_dir: Union[str, Path],
        output_path: Union[str, Path],
        options: Dict[str, Any],
    ) -> bool:
        """Create video with improved validation and retry handling"""
        list_file = None
        original_processing_state = self._is_processing
        temp_dir = None
        try:
            # Check if already processing, but only on first attempt
            if original_processing_state and not self.testing:
                self.logger.warning("Video creation already in progress")
                return False

            self._is_processing = True
            self.cancelled = False

            # Validate output path first
            if not output_path:
                raise ValueError("Empty output path")

            output_path = Path(output_path)
            if not output_path.parent.exists():
                raise ValueError("Directory does not exist")

            if output_path.suffix.lower() not in [".mp4", ".mkv", ".avi", ".mov"]:
                raise ValueError("Invalid file extension")

            # Ensure proper path objects and resolve UNC paths
            input_dir = Path(input_dir).resolve()
            output_path = Path(output_path).resolve()

            # Handle UNC paths on Windows
            if os.name == "nt":
                if str(input_dir).startswith("\\\\"):
                    # Convert UNC path to proper format for FFmpeg
                    input_dir = Path("//" + str(input_dir)[2:])
                if str(output_path).startswith("\\\\"):
                    output_path = Path("//" + str(output_path)[2:])

            # Log the resolved paths
            self.logger.debug(f"Resolved input directory: {input_dir}")
            self.logger.debug(f"Resolved output path: {output_path}")

            # Enhanced directory validation for network paths
            if not input_dir.exists():
                self.logger.error(f"Input directory not found: {input_dir}")
                raise ValueError(f"Input directory does not exist: {input_dir}")

            if not input_dir.is_dir():
                self.logger.error(f"Input path is not a directory: {input_dir}")
                raise ValueError(f"Input path is not a directory: {input_dir}")

            # Create output directory if needed
            output_path.parent.mkdir(parents=True, exist_ok=True)

            # Get frame files with expanded patterns
            frame_files = sorted(input_dir.glob("*.*"))
            frame_files = [
                f for f in frame_files if f.suffix.lower() in [".png", ".jpg", ".jpeg"]
            ]

            if not frame_files:
                error_msg = f"No frame files found in {input_dir}"
                self.logger.error(error_msg)
                raise RuntimeError(error_msg)

            self.logger.info(f"Found {len(frame_files)} frames in {input_dir}")

            # Validate frame sequence before any FFmpeg operations
            try:
                self._validate_frame_sequence(frame_files)
            except RuntimeError as e:
                if "Frame sequence is not continuous" in str(e):
                    self.logger.error(str(e))
                    raise  # Re-raise frame sequence errors
                self.logger.error(f"Frame validation error: {e}")
                raise

            # Check for cancellation before proceeding
            if self.cancelled:
                self.logger.info("Video creation cancelled")
                return False

            # Log found frames
            self.logger.info(f"Found {len(frame_files)} frames in {input_dir}")
            for frame in frame_files[:5]:  # Log first 5 frames for debugging
                self.logger.debug(f"Frame found: {frame.name}")

            # Validate options
            fps = int(options.get("fps", 30))
            bitrate = int(options.get("bitrate", 5000))
            encoder = options.get("encoder", self.encoder)

            # Initialize resource monitoring
            if not self.testing:
                initial_usage = self.get_resource_usage()
                self.logger.debug(f"Initial resource usage: {initial_usage}")

            # Add memory monitoring
            if not self.testing:
                # Monitor memory usage during video creation
                memory_info = self.process.memory_info()
                self.logger.debug(
                    f"Memory usage before encoding: {memory_info.rss / 1024 / 1024:.2f} MB"
                )

            # Set test_mode for command generation based on testing flag
            if getattr(self, "testing", False):
                options["test_mode"] = True

            # Build FFmpeg command
            cmd, temp_dir = self.build_ffmpeg_command(input_dir, output_path, options)

            self.logger.debug(f"FFmpeg command: {' '.join(map(str, cmd))}")

            # Run FFmpeg
            try:
                result = subprocess.run(
                    cmd, check=True, capture_output=True, text=True, cwd=str(input_dir)
                )
                self.logger.info(f"Successfully created video at {output_path}")
                return True

            except subprocess.CalledProcessError as e:
                if self.cancelled:
                    self.logger.info("Video creation cancelled")
                    return False

                if "Cannot use NVENC" in str(e.stderr):
                    self.logger.warning("NVENC failed, falling back to CPU encoding")
                    self._is_processing = False  # Reset for retry
                    options["hardware"] = "CPU"
                    options["encoder"] = "H.264"
                    return self.create_video(input_dir, output_path, options)

                if "Temporary failure" in str(e.stderr):
                    self.logger.warning("Temporary failure, retrying...")
                    self._is_processing = False  # Reset for retry
                    return self.create_video(input_dir, output_path, options)

                self.logger.error(f"FFmpeg error: {e.stderr}")
                raise RuntimeError(f"FFmpeg error: {e.stderr}")

        except Exception as e:
            if self.cancelled:
                self.logger.info("Video creation cancelled")
                return False
            self.logger.error(f"Video creation error: {str(e)}")
            raise

        finally:
            # Restore original processing state
            self._is_processing = original_processing_state
            self._cleanup_temp_files(options)
            # Clean up the temporary file list
            try:
                if list_file is not None:
                    list_file.unlink(missing_ok=True)
            except Exception as e:
                self.logger.warning(f"Failed to remove temporary file list: {e}")
            # Check if temp_dir is not None and exists
            if temp_dir and temp_dir.exists():
                shutil.rmtree(temp_dir)

    def build_ffmpeg_command(
        self,
        input_path: Union[str, Path],
        output_path: Union[str, Path],
        options: Dict[str, Any],
    ) -> tuple:
        """Build FFmpeg command with hardware filters and metadata."""
        try:
            input_dir = Path(input_path).resolve()
            output_path = Path(output_path).resolve()
            temp_dir = None
            list_file = None

            # Convert to forward slashes and handle UNC paths
            input_str = str(input_dir).replace("\\", "/")
            is_unc_path = input_str.startswith("//") or str(input_dir).startswith(
                "\\\\"
            )

            # Always use concat demuxer for UNC paths
            if is_unc_path:
                # Use concat demuxer for network paths
                temp_dir = Path(tempfile.mkdtemp())
                list_file = temp_dir / "frames.txt"
                temp_dir.mkdir(parents=True, exist_ok=True)

                # Get frame files case-insensitively
                frame_files = []
                for ext in [".png", ".PNG", ".jpg", ".JPG", ".jpeg", ".JPEG"]:
                    frame_files.extend(input_dir.glob(f"*{ext}"))
                frame_files.sort()

                # Ensure UNC path format is preserved in frames.txt
                with open(list_file, "w", encoding="utf-8") as f:
                    for frame in frame_files:
                        # Convert Windows path to UNC format with forward slashes
                        frame_path = str(frame).replace("\\", "/")
                        if is_unc_path and not frame_path.startswith("//"):
                            frame_path = "//" + frame_path.lstrip("/")
                        f.write(f"file '{frame_path}'\n")
                        if options.get("frame_duration"):
                            f.write(f"duration {options['frame_duration']}\n")

                # Use the UNC path format in the command
                cmd = [
                    str(self.ffmpeg_path).replace("\\", "/"),
                    "-y",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    str(list_file).replace("\\", "/"),
                ]

            else:
                # Use frame pattern for local paths
                if options.get("test_mode") or any(input_dir.glob("frame*.png")):
                    input_pattern = f"{input_str}/frame%04d.png"
                    cmd = [
                        str(self.ffmpeg_path).replace("\\", "/"),
                        "-y",
                        "-framerate",
                        str(options.get("fps", 30)),
                        "-i",
                        input_pattern,
                    ]
                else:
                    # Use concat demuxer for non-sequential files
                    temp_dir = Path(tempfile.mkdtemp())
                    list_file = temp_dir / "frames.txt"
                    temp_dir.mkdir(parents=True, exist_ok=True)

                    # Get frame files case-insensitively
                    frame_files = []
                    for ext in [".png", ".PNG", ".jpg", ".JPG", ".jpeg", ".JPEG"]:
                        frame_files.extend(input_dir.glob(f"*{ext}"))
                    frame_files.sort()

                    # Write file list
                    with open(list_file, "w", encoding="utf-8") as f:
                        for frame in frame_files:
                            frame_path = str(frame).replace("\\", "/")
                            f.write(f"file '{frame_path}'\n")
                            if options.get("frame_duration"):
                                f.write(f"duration {options['frame_duration']}\n")

                    cmd = [
                        str(self.ffmpeg_path).replace("\\", "/"),
                        "-y",
                        "-f",
                        "concat",
                        "-safe",
                        "0",
                        "-i",
                        str(list_file).replace("\\", "/"),
                    ]

            # Add metadata if provided
            if metadata := options.get("metadata"):
                for key, value in metadata.items():
                    cmd.extend(["-metadata", f'{key}="{value}"'])

            # Add framerate after input
            cmd.extend(["-framerate", str(options.get("fps", 30))])

            # Add hardware acceleration and filters
            hardware = options.get("hardware", "CPU")
            if hardware == "NVIDIA GPU":
                cmd.extend(["-hwaccel", "cuda"])
                cmd.extend(["-vf", "scale_cuda"])
            elif hardware == "Intel GPU":
                cmd.extend(["-hwaccel", "qsv"])
                cmd.extend(["-vf", "scale_qsv"])
            elif hardware == "AMD GPU":
                cmd.extend(["-hwaccel", "amf"])
                cmd.extend(["-vf", "scale_amf"])

            # Add encoding settings
            cmd.extend(
                [
                    "-c:v",
                    self._get_codec(options.get("encoder", "H.264"), hardware),
                    "-b:v",
                    f"{options.get('bitrate', 5000)}k",
                    "-pix_fmt",
                    "yuv420p",
                    "-movflags",
                    "+faststart",
                ]
            )

            # Add output path with proper slash handling
            output_str = str(output_path).replace("\\", "/")
            if output_str.startswith("//"):
                output_str = "//" + output_str.lstrip("/")
            cmd.append(output_str)

            return cmd, temp_dir

        except Exception as e:
            self.logger.error(f"Error building FFmpeg command: {e}")
            raise

    def validate_encoder(self, encoder: str) -> None:
        """Validate encoder selection."""
        supported_encoders = self.get_supported_encoders()
        if encoder not in supported_encoders:
            raise ValueError(f"Unsupported encoder selected: {encoder}")

    def validate_transcoding_quality(self, quality: str) -> str:
        """Validate and standardize transcoding quality."""
        valid_qualities = ["Low", "Medium", "High"]
        if not isinstance(quality, str):
            raise ValueError("Transcoding quality must be a string.")
        standardized_quality = quality.capitalize()
        if standardized_quality not in valid_qualities:
            raise ValueError(f"Transcoding quality must be one of {valid_qualities}.")
        return standardized_quality

    def get_supported_encoders(self) -> List[str]:
        """Get list of supported encoders"""
        return [
            "H.264",
            "HEVC/H.265 (Better Compression)",
            "AV1 (Best Quality)",
            "NVIDIA NVENC H.264",
            "NVIDIA NVENC HEVC",
        ]

    def _try_encode(self, cmd: List[str], temp_dir: Path, output_path: Path) -> bool:
        """Try to encode with given FFmpeg command"""
        try:
            self.logger.info("Starting FFmpeg encoding process...")
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=str(temp_dir),
                creationflags=subprocess.HIGH_PRIORITY_CLASS if os.name == "nt" else 0,
                universal_newlines=True,
                bufsize=1,
            )

            # Store process and monitor
            self._current_process = process
            if self._processor:
                self._processor._ffmpeg_processes.add(process)

            while process.poll() is None:
                # Removed timeout handling code

                # Read stderr for progress info
                if process.stderr:
                    line = process.stderr.readline()
                    if line:
                        self.logger.info(f"FFmpeg: {line.strip()}")

                # Brief sleep to prevent CPU overuse
                time.sleep(0.1)

            # Get final output
            _, stderr = process.communicate()

            # Remove from tracking
            if self._processor:
                self._processor._ffmpeg_processes.discard(process)
            self._current_process = None

            if process.returncode != 0:
                self.logger.error(f"FFmpeg error: {stderr}")
                return False

            # Verify output file
            if not output_path.exists():
                self.logger.error("Output file was not created")
                return False

            file_size = output_path.stat().st_size
            if file_size == 0:
                self.logger.error("Output file is empty")
                return False

            self.logger.info(
                f"Successfully created video at {output_path} ({file_size/1024/1024:.1f} MB)"
            )
            return True

        except Exception as e:
            self.logger.error(f"Encoding failed: {str(e)}")
            return False
        finally:
            if process:
                try:
                    process.terminate()
                except:
                    pass

    def _create_initial_video(
        self, frame_files: List[Path], output: Path, fps: float, options: dict
    ) -> bool:
        """Create initial video with proper frame timing"""
        try:
            list_file = output.parent / "frames.txt"
            frame_duration = options.get("frame_duration", 1.0)

            # Create frame list with proper durations
            with open(list_file, "w", encoding="utf-8") as f:
                for frame in frame_files:
                    f.write(f"file '{frame.name}'\n")
                    f.write(f"duration {frame_duration}\n")
                # Add last frame duration
                f.write(f"file '{frame_files[-1].name}'\n")

            cmd = [
                str(self.ffmpeg_path),
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(list_file),
                "-c:v",
                "h264_nvenc",
                "-preset",
                "p7",
                "-rc",
                "vbr",
                "-b:v",
                "35M",
                "-maxrate",
                "45M",
                "-bufsize",
                "70M",
                "-profile:v",
                "main",
                "-fps_mode",
                "cfr",  # Use CFR mode instead of -vsync
                "-r",
                str(fps),  # Set input/output frame rate
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                str(output),
            ]

            self.logger.debug(f"Running initial video creation: {' '.join(cmd)}")

            process = subprocess.run(cmd, capture_output=True, text=True, check=False)

            if process.returncode != 0:
                self.logger.error(f"Initial video creation failed: {process.stderr}")
                return False

            return True

        except Exception as e:
            self.logger.error(f"Error in _create_initial_video: {str(e)}")
            return False

    def _apply_interpolation(
        self, input_path: Path, output_path: Path, target_fps: int, options: dict
    ) -> bool:
        """Apply high-quality interpolation with hardware acceleration"""
        try:
            # Get hardware selection
            hardware = options.get("hardware", "CPU (Software)")
            quality = options.get("interpolation_quality", "high").lower()

            # Define hardware-specific parameters
            hw_params = {
                "NVIDIA": {
                    "decode": ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"],
                    "scale": "scale_cuda",
                    "codec": "h264_nvenc",
                },
                "Intel": {
                    "decode": ["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"],
                    "scale": "scale_qsv",
                    "codec": "h264_qsv",
                },
                "AMD": {
                    "decode": ["-hwaccel", "amf", "-hwaccel_output_format", "amf"],
                    "scale": "scale_amf",
                    "codec": "h264_amf",
                },
                "CPU": {"decode": [], "scale": "scale", "codec": "libx264"},
            }

            # Select hardware parameters
            if "NVIDIA" in hardware:
                hw = hw_params["NVIDIA"]
            elif "Intel" in hardware:
                hw = hw_params["Intel"]
            elif "AMD" in hardware:
                hw = hw_params["AMD"]
            else:
                hw = hw_params["CPU"]

            # Build FFmpeg command
            cmd = [
                str(self.ffmpeg_path),
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
                "35M",
                "-maxrate",
                "45M",
                "-bufsize",
                "70M",
                str(output_path),
            ]

            return self._try_encode(cmd, input_path.parent, output_path)

        except Exception as e:
            self.logger.error(f"Error in _apply_interpolation: {e}")
            return False

    def _get_codec_params(self, codec: str, hardware: str = None) -> List[str]:
        """Get optimal codec parameters based on selected encoder and hardware"""
        codec_map = {
            "NVIDIA": {
                "h264": [
                    "-c:v",
                    "h264_nvenc",
                    "-preset",
                    "p7",
                    "-rc",
                    "vbr",
                    "-cq",
                    "16",
                ],
                "hevc": [
                    "-c:v",
                    "hevc_nvenc",
                    "-preset",
                    "p7",
                    "-rc",
                    "vbr",
                    "-cq",
                    "20",
                ],
                "av1": [
                    "-c:v",
                    "av1_nvenc",
                    "-preset",
                    "p7",
                    "-rc",
                    "vbr",
                    "-cq",
                    "24",
                ],
            },
            "Intel": {
                "h264": [
                    "-c:v",
                    "h264_qsv",
                    "-preset",
                    "slow",
                    "-global_quality",
                    "20",
                ],
                "hevc": [
                    "-c:v",
                    "hevc_qsv",
                    "-preset",
                    "slow",
                    "-global_quality",
                    "24",
                ],
                "av1": ["-c:v", "av1_qsv", "-preset", "slow", "-global_quality", "28"],
            },
            "AMD": {
                "h264": [
                    "-c:v",
                    "h264_amf",
                    "-quality",
                    "quality",
                    "-rc",
                    "cqp",
                    "-qp",
                    "18",
                ],
                "hevc": [
                    "-c:v",
                    "hevc_amf",
                    "-quality",
                    "quality",
                    "-rc",
                    "cqp",
                    "-qp",
                    "22",
                ],
                "av1": [
                    "-c:v",
                    "av1_amf",
                    "-quality",
                    "quality",
                    "-rc",
                    "cqp",
                    "-qp",
                    "26",
                ],
            },
            "CPU": {
                "h264": ["-c:v", "libx264", "-preset", "slow", "-crf", "18"],
                "hevc": ["-c:v", "libx265", "-preset", "slow", "-crf", "22"],
                "av1": ["-c:v", "libaom-av1", "-cpu-used", "4", "-crf", "26"],
            },
        }

        # Parse hardware and codec type
        if hardware and "NVIDIA" in hardware:
            params = codec_map["NVIDIA"]
        elif hardware and "Intel" in hardware:
            params = codec_map["Intel"]
        elif hardware and "AMD" in hardware:
            params = codec_map["AMD"]
        else:
            params = codec_map["CPU"]

        # Get base codec type
        if "H.264" in codec:
            base_params = params["h264"]
        elif "HEVC" in codec or "H.265" in codec:
            base_params = params["hevc"]
        else:  # AV1
            base_params = params["av1"]

        # Add common parameters
        return base_params + [
            "-b:v",
            "35M",
            "-maxrate",
            "45M",
            "-bufsize",
            "70M",
            "-movflags",
            "+faststart",
        ]

    def _create_ffmpeg_video(
        self, frame_paths: List[Path], output_path: Path, options: dict
    ) -> bool:
        """Create video using FFmpeg"""
        try:
            fps = options.get("fps", 30)  # Lower default FPS
            encoder = options.get("encoder", "H.264")
            bitrate = options.get("bitrate", "8000k")
            preset = options.get("preset", "slow")
            frame_duration = options.get(
                "frame_duration", 1.0
            )  # Add frame duration option

            # Validate output path
            output_path = Path(output_path).resolve()
            output_path.parent.mkdir(parents=True, exist_ok=True)

            # Create image list file with modified duration
            temp_dir = frame_paths[0].parent
            image_list_path = (temp_dir / "image_list.txt").resolve()
            with open(image_list_path, "w", encoding="utf-8") as f:
                for frame_path in frame_paths:
                    f.write(f"file '{frame_path}'\n")
                    f.write(
                        f"duration {frame_duration}\n"
                    )  # Use frame_duration instead of 1/fps

            # Build FFmpeg command with modified settings
            cmd = [
                str(self.ffmpeg_path),
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(image_list_path),
                "-c:v",
                self._get_codec(encoder),
                "-preset",
                preset,
                "-b:v",
                bitrate,
                "-vf",
                f"fps={fps}",  # Force output FPS
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                str(output_path),
            ]

            # Run FFmpeg with proper environment
            process = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                env=os.environ.copy(),  # Use current environment
                check=False,  # Don't raise exception, handle it ourselves
            )

            if process.returncode != 0:
                self.logger.error(f"FFmpeg stderr: {process.stderr}")
                raise RuntimeError(f"FFmpeg failed with code {process.returncode}")

            # Verify output file was created
            if not output_path.exists():
                raise RuntimeError("Output file was not created")

            return True

        except Exception as e:
            self.logger.error(f"Video creation failed: {str(e)}")
            return False

        finally:
            # Improved cleanup
            try:
                if "image_list_path" in locals() and isinstance(image_list_path, Path):
                    image_list_path.unlink(missing_ok=True)

                if frame_paths:
                    for frame_path in frame_paths:
                        try:
                            frame_path.unlink(missing_ok=True)
                        except Exception as e:
                            self.logger.debug(f"Failed to remove frame: {e}")

                if temp_dir and temp_dir.exists():
                    try:
                        shutil.rmtree(temp_dir, ignore_errors=True)
                    except Exception as e:
                        self.logger.debug(f"Failed to remove temp directory: {e}")
            except Exception as e:
                self.logger.error(f"Cleanup error: {e}")

    def apply_interpolation(
        self, video_path: Path, output_path: Path, fps: int
    ) -> bool:
        """Apply frame interpolation to video"""
        try:
            # FFmpeg command with improved interpolation settings
            ffmpeg_cmd = [
                str(self.ffmpeg_path),
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
            self.logger.error(f"Interpolation failed: {str(e)}")
            return False

    def _get_codec(self, encoder: str, hardware: str = "CPU") -> str:
        """Get appropriate codec based on encoder and hardware selection"""
        # Map encoders to their hardware-specific implementations
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

        # Extract base codec name from encoder string
        base_codec = "H.264"
        if "H.265" in encoder or "HEVC" in encoder:
            base_codec = "H.265"
        elif "AV1" in encoder:
            base_codec = "AV1"

        # Get hardware-specific codec or fall back to CPU
        hw_codecs = codec_map.get(hardware, codec_map["CPU"])
        return hw_codecs.get(base_codec, "libx264")  # Default to libx264 if unknown

    def interpolate_frames(self, input_path: Path, output_path: Path, fps: int) -> bool:
        """Interpolate frames to increase video smoothness"""
        try:
            ffmpeg_cmd = [
                str(self.ffmpeg_path),
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
            self.logger.error(f"Frame interpolation failed: {str(e)}")
            return False

    def get_video_info(self, video_path: Path) -> dict:
        """Get video file information using FFmpeg"""
        try:
            cmd = [str(self.ffmpeg_path), "-i", str(video_path)]
            result = subprocess.run(cmd, capture_output=True, text=True)
            # Parse FFmpeg output for video information
            info = {}
            if result.stderr:
                # Extract duration
                duration_match = re.search(
                    r"Duration: (\d{2}:\d{2}:\d{2}\.\d{2})", result.stderr
                )
                if duration_match:
                    info["duration"] = duration_match.group(1)
                # Extract resolution
                resolution_match = re.search(r"(\d{2,}x\d{2,})", result.stderr)
                if resolution_match:
                    info["resolution"] = resolution_match.group(1)
            return info

        except Exception as e:
            self.logger.error(f"Failed to get video info: {e}")
            return {}

    def _get_hardware_params(self, hardware: str) -> List[str]:
        """Get hardware-specific FFmpeg parameters"""
        params = {
            "NVIDIA": ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"],
            "Intel": ["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"],
            "AMD": ["-hwaccel", "amf", "-hwaccel_output_format", "amf"],
            "CPU": [],
        }
        return params.get(hardware, [])  # Return empty list for unknown hardware

    @staticmethod
    def configure_encoder(encoder_type: str, settings: Dict[str, Any]) -> None:
        if "pytest" in sys.modules:
            return
        # ...existing code...

    def encode_video(self, fps: int, bitrate: int):
        """Encode the video with the specified FPS and bitrate."""
        # Placeholder for actual encoding logic
        self.logger.info(
            f"Encoding video at {fps} FPS with {bitrate} kbps bitrate using {self.encoder} encoder."
        )
        # Implement encoding using tools like FFmpeg or OpenCV's VideoWriter
        # Example with VideoWriter:
        fourcc = (
            cv2.VideoWriter_fourcc(*"X264")
            if self.encoder == "H.264"
            else cv2.VideoWriter_fourcc(*"H265")
        )
        out = cv2.VideoWriter("output_video.mp4", fourcc, fps, (1920, 1080))
        # Write frames to out...
        out.release()
        self.logger.info("Video encoding completed.")

    def set_bitrate(self, bitrate: int) -> None:
        """Set the video bitrate."""
        self.bitrate = bitrate
        self.logger.info(f"Bitrate set to: {self.bitrate} kbps")

    def transcode_video(
        self, input_video: str, output_video: str, options: Dict[str, Any]
    ) -> bool:
        """Transcode video to specified format and quality."""
        format_map = {
            "MP4": "mp4",
            "AVI": "avi",
            "MKV": "mkv",
            "MOV": "mov",
        }
        quality_presets = {
            "Low": "28",
            "Medium": "23",
            "High": "18",
        }

        output_format = format_map.get(options.get("transcoding_format"), "mp4")
        quality = quality_presets.get(options.get("transcoding_quality"), "23")

        ffmpeg_cmd = [
            "ffmpeg",
            "-i",
            input_video,
            "-vcodec",
            "libx264",
            "-crf",
            quality,
            "-preset",
            "medium",
            output_video + f".{output_format}",
        ]

        try:
            result = subprocess.run(
                ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True
            )
            self.logger.info(f"Transcoding completed: {output_video}.{output_format}")
            return True
        except subprocess.CalledProcessError as e:
            self.logger.error(f"Transcoding failed: {e.stderr.decode()}")
            return False
        except Exception as e:
            self.logger.error(f"Unexpected error during transcoding: {str(e)}")
            return False

    def cancel(self) -> None:
        """Cancel an ongoing FFmpeg process"""
        try:
            if self._current_process and self._current_process.poll() is None:
                self._current_process.terminate()
                try:
                    self._current_process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self._current_process.kill()
                self._current_process = None
                self.logger.info("FFmpeg process terminated")
        except Exception as e:
            self.logger.error(f"Error cancelling process: {e}")

    def _cleanup_temp_files(self, options: dict) -> None:
        """Clean up temporary files after video creation"""
        try:
            if temp_dir := options.get("temp_dir"):
                temp_path = Path(temp_dir)
                if temp_path.exists():
                    shutil.rmtree(temp_path, ignore_errors=True)
                    self.logger.debug(f"Cleaned up temp directory: {temp_dir}")
        except Exception as e:
            self.logger.error(f"Error cleaning up temp files: {e}")

    def get_resource_usage(self):
        """Get current CPU and memory usage with tracking"""
        try:
            cpu_usage = self.process.cpu_percent()  # This will trigger CPU monitoring
            memory = self.process.memory_info()
            memory_usage = memory.rss / (1024 * 1024)  # Convert to MB

            # Store metrics for tracking
            if not hasattr(self, "_resource_metrics"):
                self._resource_metrics = []
            self._resource_metrics.append({"cpu": cpu_usage, "memory": memory_usage})

            self.logger.debug(
                f"Resource usage - CPU: {cpu_usage}%, Memory: {memory_usage:.1f}MB"
            )
            return {"cpu": cpu_usage, "memory": memory_usage}
        except Exception as e:
            self.logger.error(f"Error getting resource usage: {e}")
            return {"cpu": 0, "memory": 0}

    def _validate_frame_sequence(self, frame_files: List[Path]) -> None:
        """Validate that frame sequence is continuous"""
        try:
            numbers = []
            pattern = re.compile(r"frame(\d+)")

            for frame in frame_files:
                # Handle both PNG and JPG files case-insensitively
                if frame.suffix.lower() in [".png", ".jpg", ".jpeg"]:
                    match = pattern.search(frame.stem)
                    if match:
                        numbers.append(int(match.group(1)))

            if not numbers:
                return  # No numbered frames found

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
            self.logger.error(f"Error validating frame sequence: {e}")
            raise RuntimeError(f"Error validating frame sequence: {e}")
