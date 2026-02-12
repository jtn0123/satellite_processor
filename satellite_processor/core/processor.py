"""
Main Processing Orchestrator
--------------------------
Coordinates the overall processing workflow:
- Processing pipeline management
- Operation sequencing
- Progress tracking
- Error handling
- Resource management

Key Responsibilities:
- Workflow coordination
- Process monitoring
- Resource management
- Error handling
- Status updates

Does NOT handle:
- File operations (use FileManager)
- Image processing (use ImageOperations)
- Video creation (use VideoHandler)
- GUI interactions
"""

from __future__ import annotations

import concurrent.futures
import logging
import multiprocessing
import multiprocessing.pool
import shutil
import subprocess
import tempfile
import threading
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

import cv2  # type: ignore
import numpy as np  # type: ignore
import psutil

from .file_manager import FileManager
from .image_operations import ImageOperations
from .pipeline import (
    CropStage,
    FalseColorStage,
    Pipeline,
    ScaleStage,
    TimestampStage,
    validate_image,
)
from .resource_monitor import ResourceMonitor
from .settings_manager import SettingsManager
from .utils import is_closing
from .video_handler import VideoHandler

logger = logging.getLogger(__name__)

# --- Constants ---
MAX_WORKERS_MULTIPLIER = 2
MAX_WORKERS_CAP = 16
MIN_CHUNK_SIZE = 5
MAX_CHUNK_SIZE = 20
DEFAULT_BATCH_SIZE = 1000
RESOURCE_MONITOR_INTERVAL_SECONDS = 1.0
PROCESS_TERMINATE_TIMEOUT_SECONDS = 5


def generate_output_filename(timestamp: str, prefix: str = "Animation", ext: str = ".mp4") -> str:
    """Generate timestamped output filename"""
    return f"{prefix}_{timestamp}{ext}"


def generate_processed_filename(original_path: Path, timestamp: str, prefix: str = "processed") -> str:
    """Generate processed image filename"""
    return f"{prefix}_{original_path.stem}_{timestamp}{original_path.suffix}"



_PROCESSING_IMAGES_LABEL = "Processing Images"
class SatelliteImageProcessor:
    """Main image processing class for satellite imagery"""

    def __init__(
        self, options: dict | None = None, parent: Any | None = None
    ) -> None:
        # Callback-based signals (replace pyqtSignal)
        self.on_status_update: Callable[[str], None] | None = None
        self.on_error: Callable[[str], None] | None = None
        self.on_finished: Callable[[], None] | None = None
        self.on_progress: Callable[[str, int], None] | None = None
        self.on_overall_progress: Callable[[int], None] | None = None
        self.on_resource_update: Callable[[dict], None] | None = None
        self.on_output_ready: Callable[[Path], None] | None = None

        # Initialize managers
        self.file_manager = FileManager()
        self.video_handler = VideoHandler()
        self.image_ops = ImageOperations()
        self.resource_monitor = ResourceMonitor()
        self.settings_manager = SettingsManager()

        # Connect resource monitoring
        self.resource_monitor.on_resource_update = self.handle_resource_update
        self.resource_monitor.start()

        # Basic setup
        self.logger = logging.getLogger(__name__)
        self._load_preferences()
        self._setup_resource_monitoring()

        # Load directories from settings
        self.input_dir = self.settings_manager.get("input_dir")
        self.output_dir = self.settings_manager.get("output_dir")

        # Initialize other attributes
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.current_operation = ""
        self.total_operations = 0
        self.options = options or {}
        self.cancelled = False
        self._is_deleted = False

        # Optimize thread count based on CPU cores
        cpu_count = multiprocessing.cpu_count()
        self.max_workers = min(cpu_count * MAX_WORKERS_MULTIPLIER, MAX_WORKERS_CAP)
        self.chunk_size = max(MIN_CHUNK_SIZE, min(MAX_CHUNK_SIZE, cpu_count))
        self.batch_size = DEFAULT_BATCH_SIZE

        # Add initialization of process attribute
        self._proc = None
        self._is_processing = False

        # Add FFmpeg process tracking
        self._ffmpeg_processes: set = set()

    def _emit_status(self, message: str):
        """Emit status update via callback"""
        if self.on_status_update:
            self.on_status_update(message)

    def _emit_error(self, message: str):
        """Emit error via callback"""
        if self.on_error:
            self.on_error(message)

    def _emit_progress(self, operation: str, progress: int):
        """Emit progress via callback"""
        if self.on_progress:
            self.on_progress(operation, progress)

    def _emit_overall_progress(self, progress: int):
        """Emit overall progress via callback"""
        if self.on_overall_progress:
            self.on_overall_progress(progress)

    def _emit_finished(self):
        """Emit finished via callback"""
        if self.on_finished:
            self.on_finished()

    def _emit_output_ready(self, path: Path):
        """Emit output ready via callback"""
        if self.on_output_ready:
            self.on_output_ready(path)

    def update_directories(self):
        """Update input/output directories from options or settings"""
        if "input_dir" in self.options:
            self.set_input_directory(self.options["input_dir"])
        if "output_dir" in self.options:
            self.set_output_directory(self.options["output_dir"])

    def update_progress(self, operation: str, progress: int):
        """Update progress with proper callback emission"""
        self.current_operation = operation
        self._emit_progress(operation, progress)

    def _create_progress_bar(
        self, operation: str, current: int, total: int, width: int = 40
    ) -> str:
        """Create simple progress bar string"""
        progress = float(current) / total
        filled = int(width * progress)
        bar = "█" * filled + "░" * (width - filled)
        percent = int(progress * 100)
        return f"{operation} [{bar}] {percent}%"

    def _stage_false_color(
        self, current_files: list[Path], dirs: dict[str, Path], pool: multiprocessing.pool.Pool
    ) -> list[Path]:
        """Stage 1: Apply false color processing in parallel"""
        if not self.options.get("false_color_enabled"):
            return current_files

        self.logger.info("Starting parallel false color processing stage...")
        self._emit_status("🎨 Stage 1/4: Applying false color...")

        sanchez_args = [
            (
                str(f),
                dirs["sanchez"],
                self.options.get("sanchez_path"),
                self.options.get("underlay_path"),
            )
            for f in current_files
        ]
        sanchez_files = []
        total = len(current_files)

        for idx, result in enumerate(
            pool.imap_unordered(self._parallel_sanchez, sanchez_args)
        ):
            if self.cancelled:
                return []

            if result:
                sanchez_files.append(Path(result))

            progress = int((idx + 1) / total * 100)
            self._emit_progress("False Color", progress)

        if sanchez_files:
            return self.file_manager.keep_file_order(sanchez_files)
        else:
            self.logger.warning("No files were processed with false color")
            return current_files

    def _stage_crop(
        self, current_files: list[Path], dirs: dict[str, Path], pool: multiprocessing.pool.Pool
    ) -> list[Path]:
        """Stage 2: Crop images in parallel"""
        if not self.options.get("crop_enabled"):
            return current_files

        self.logger.info("Starting parallel image cropping stage...")
        self._emit_status("📐 Stage 2/4: Cropping images...")

        crop_args = [
            (str(f), dirs["crop"], self.options) for f in current_files
        ]
        cropped_files = []
        total = len(current_files)

        for idx, result in enumerate(
            pool.imap_unordered(self._parallel_crop, crop_args)
        ):
            if self.cancelled:
                return []

            if result:
                cropped_files.append(Path(result))

            progress = int((idx + 1) / total * 100)
            self._emit_progress("Cropping", progress)

        if cropped_files:
            return self.file_manager.keep_file_order(cropped_files)
        else:
            self.logger.warning("No files were cropped, using original files")
            return current_files

    def _stage_timestamp(
        self, current_files: list[Path], dirs: dict[str, Path], pool: multiprocessing.pool.Pool
    ) -> list[Path]:
        """Stage 3: Add timestamps in parallel"""
        if not self.options.get("add_timestamp", True):
            return current_files

        self.logger.info("Starting parallel timestamp processing stage...")
        self._emit_status("⏰ Stage 3/4: Adding timestamps...")

        timestamp_args = [
            (str(f), dirs["timestamp"]) for f in current_files
        ]
        timestamped_files = []
        total = len(current_files)

        for idx, result in enumerate(
            pool.imap_unordered(self._parallel_timestamp, timestamp_args)
        ):
            if self.cancelled:
                return []

            if result:
                timestamped_files.append(Path(result))

            progress = int((idx + 1) / total * 100)
            self._emit_progress("Adding Timestamps", progress)

        if timestamped_files:
            return self.file_manager.keep_file_order(timestamped_files)
        return current_files

    def _stage_scale(
        self, current_files: list[Path], _dirs: dict[str, Path], _pool: multiprocessing.pool.Pool
    ) -> list[Path]:
        """Stage: Scale images (placeholder for future scaling stage)"""
        return current_files

    def process(self) -> bool:
        """Main processing workflow with sequential stages but parallel processing within each stage"""
        pool = None
        try:
            if self._is_processing:
                self.logger.warning("Processing is already underway.")
                return False

            self._is_processing = True
            self.cancelled = False

            self.logger.info("Starting satellite image processing workflow")
            self._emit_status("🛰️ Starting satellite image processing...")

            if not all([self.input_dir, self.output_dir]):
                self.logger.error("Input or output directory not set.")
                return False

            Path(self.output_dir).mkdir(parents=True, exist_ok=True)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            base_output = Path(self.output_dir)
            dirs = {
                "sanchez": base_output / f"01_sanchez_{timestamp}",
                "crop": base_output / f"02_cropped_{timestamp}",
                "timestamp": base_output / f"03_timestamp_{timestamp}",
                "final": base_output / f"04_final_{timestamp}",
            }

            for dir_path in dirs.values():
                dir_path.mkdir(parents=True, exist_ok=True)

            current_files = self.file_manager.get_input_files(self.input_dir)
            if not current_files:
                raise ValueError("No valid images found in input directory")

            # Validate images before processing (#15)
            current_files = [f for f in current_files if validate_image(f)]
            if not current_files:
                raise ValueError("No valid/readable images found after validation")

            num_processes = min(
                len(current_files), max(1, multiprocessing.cpu_count() - 1)
            )
            self.logger.info(f"Using {num_processes} processes for parallel operations")

            pool = multiprocessing.Pool(processes=num_processes)

            # Build and run the processing pipeline (#13)
            order_fn = self.file_manager.keep_file_order
            pipeline = Pipeline(resource_monitor=self.resource_monitor)
            pipeline.add_stage(FalseColorStage(self.options, dirs, self._parallel_sanchez, order_fn))
            pipeline.add_stage(CropStage(self.options, dirs, self._parallel_crop, order_fn))
            pipeline.add_stage(TimestampStage(self.options, dirs, self._parallel_timestamp, order_fn))
            pipeline.add_stage(ScaleStage())

            current_files = pipeline.run(current_files, pool, self._emit_progress)
            if self.cancelled or not current_files:
                return False

            # STAGE 4: Video Creation (single process)
            if self.cancelled:
                return False

            if current_files:
                self.logger.info("Starting video creation stage...")
                self._emit_status("🎥 Stage 4/4: Creating video...")
                success = self._create_video(current_files, dirs["final"])
                if success:
                    video_path = next(dirs["final"].glob("*.mp4"))
                    self._emit_output_ready(video_path)
                    self._emit_status("✨ Processing completed successfully!")
                    return True

            return False

        except Exception as e:
            self.logger.error(f"Processing error: {e}", exc_info=True)
            self._emit_error(f"Error: {e}")
            return False
        finally:
            if pool is not None:
                pool.close()
                pool.join()
            self._is_processing = False

    @staticmethod
    def _parallel_crop(args):
        """Parallel cropping worker"""
        try:
            input_path, output_dir, options = args
            img = cv2.imread(input_path)
            if img is None:
                return None

            cropped = ImageOperations.crop_image(
                img,
                options.get("crop_x", 0),
                options.get("crop_y", 0),
                options.get("crop_width", img.shape[1]),
                options.get("crop_height", img.shape[0]),
            )

            output_path = Path(output_dir) / Path(input_path).name
            cv2.imwrite(str(output_path), cropped)
            return str(output_path)
        except Exception as e:
            logger.error(f"Error in parallel crop: {e}", exc_info=True)
            return None

    @staticmethod
    def _parallel_sanchez(args):
        """Worker function for parallel Sanchez processing"""
        input_path, output_dir, sanchez_path, underlay_path = args
        try:
            success = ImageOperations.apply_false_color(
                input_path, output_dir, sanchez_path, underlay_path
            )
            if success:
                output_file = Path(output_dir) / f"{Path(input_path).stem}_sanchez.jpg"
                return str(output_file) if output_file.exists() else None
        except Exception as e:
            logger.error(f"Error in parallel sanchez: {e}", exc_info=True)
            return None

    @staticmethod
    def _parallel_timestamp(args):
        """Parallel timestamp worker with enhanced logging"""
        try:
            input_path, output_dir = args
            logger.debug(f"Processing timestamp for: {Path(input_path).name}")

            img = cv2.imread(str(input_path))
            if img is None:
                logger.error(f"Failed to read input image: {input_path}")
                return None

            timestamped = ImageOperations.add_timestamp(img, Path(input_path))
            output_path = Path(output_dir) / Path(input_path).name

            if cv2.imwrite(str(output_path), timestamped):
                logger.debug(
                    f"Successfully saved timestamped image: {output_path.name}"
                )
                return str(output_path)
            else:
                logger.error(f"Failed to save timestamped image: {output_path}")
                return None

        except Exception as e:
            logger.error(f"Error in timestamp processing: {e}", exc_info=True)
            return None

    def update_timestamp(self):
        """Update the timestamp for new operations"""
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    def _process_images(self, image_paths):
        """Process multiple images"""
        processed = []
        total = len(image_paths)

        for idx, path in enumerate(image_paths):
            if self.cancelled:
                break

            try:
                result = self.image_ops.process_image(path, self.options)
                if result is not None:
                    processed.append(result)

                progress = int((idx + 1) / total * 100)
                self._emit_progress(_PROCESSING_IMAGES_LABEL, progress)

            except Exception as e:
                self.logger.error(f"Error processing {path}: {e}", exc_info=True)

        return processed

    def __del__(self):
        """Safe cleanup on deletion"""
        try:
            if not hasattr(self, "_is_deleted"):
                self.cleanup()
        except Exception as e:
            if hasattr(self, "logger"):
                self.logger.error(f"Deletion cleanup error: {e}", exc_info=True)

    def cleanup(self) -> None:
        """Clean up resources safely"""
        try:
            # Terminate any running FFmpeg processes first
            for process in self._ffmpeg_processes.copy():
                try:
                    if process.poll() is None:
                        process.terminate()
                        process.wait(timeout=PROCESS_TERMINATE_TIMEOUT_SECONDS)
                        self._ffmpeg_processes.remove(process)
                except Exception as e:
                    self.logger.error(f"Error terminating FFmpeg process: {e}", exc_info=True)

            # Clean up file manager
            self.file_manager.cleanup()

            # Stop resource monitor
            if hasattr(self, "resource_monitor") and self.resource_monitor is not None:
                try:
                    self.resource_monitor.stop()
                    self.resource_monitor = None
                except Exception as e:
                    self.logger.error(f"Failed to stop resource monitor: {e}", exc_info=True)

            # Stop update timer if exists
            if hasattr(self, "update_timer") and self.update_timer is not None:
                try:
                    self.update_timer.cancel()
                    self.update_timer = None
                except Exception as e:
                    self.logger.error(f"Timer cleanup error: {e}", exc_info=True)

            # Clean up temp directory if it exists
            if hasattr(self, "temp_dir") and self.temp_dir is not None:
                try:
                    temp_dir = Path(self.temp_dir)
                    if temp_dir.exists():
                        shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception as e:
                    self.logger.error(f"Failed to cleanup temp directory: {e}", exc_info=True)

        except Exception as e:
            self.logger.error(f"Cleanup error: {e}", exc_info=True)
        finally:
            self._is_deleted = True

    def cleanup_temp_directory(self, temp_dir: Path):
        """Clean up a specific temporary directory."""
        self.file_manager.cleanup_temp_directory(temp_dir)

    def validate_preferences(self) -> tuple[bool, str]:
        """Validate processor preferences based on options."""
        try:
            missing = []
            if self.options.get("false_color", False):
                required_keys = ["sanchez_path", "underlay_path"]
                missing = [
                    key for key in required_keys if not self.preferences.get(key)
                ]
            if not self.preferences.get("temp_directory"):
                missing.append("temp_directory")

            if missing:
                msg = f"Missing required preferences: {', '.join(missing)}"
                self.logger.error(msg)
                return False, msg
            return True, "Preferences validated successfully"

        except Exception as e:
            return False, f"Validation error: {e}"

    def run(self, input_dir: str, output_dir: str) -> bool:
        """Run the processing workflow."""
        try:
            if not output_dir:
                raise ValueError("Output directory not specified.")

            progress = 0
            self._emit_progress("Initializing", progress)

            image_paths = self.get_input_files(input_dir)
            if not image_paths:
                raise ValueError("No valid images found in the input directory.")

            processed_images = []
            total_images = len(image_paths)

            for idx, image_path in enumerate(image_paths, start=1):
                if self.cancelled:
                    self._emit_status("Processing cancelled.")
                    return False

                img = self.process_single_image(image_path)
                if img is not None:
                    processed_images.append(img)

                progress = int((idx / total_images) * 100)
                self._emit_progress(_PROCESSING_IMAGES_LABEL, progress)
                self._emit_overall_progress(progress)

            if not self.cancelled:
                self._emit_finished()
            return True

        except Exception as e:
            if not self.cancelled:
                self._emit_error(str(e))
                self._emit_status("Processing failed.")
            self.logger.error(f"Processing failed: {e}", exc_info=True)
            return False

    def process_images(self, image_paths: list[Path]) -> list[np.ndarray]:
        """Process multiple images with progress tracking and cancellation support"""
        processed_images = []
        total_steps = len(image_paths)

        with concurrent.futures.ThreadPoolExecutor() as executor:
            futures = {
                executor.submit(self.process_single_image, path): path
                for path in image_paths
            }

            completed = 0
            for future in concurrent.futures.as_completed(futures):
                if self.cancelled:
                    for f in futures:
                        f.cancel()
                    break

                path = futures[future]
                try:
                    result = future.result()
                    if result is not None:
                        processed_images.append(result)
                    completed += 1
                    progress = int((completed / total_steps) * 100)
                    self._emit_progress(_PROCESSING_IMAGES_LABEL, progress)
                except Exception as e:
                    self.logger.error(f"Error processing {path}: {e}", exc_info=True)

        return processed_images

    def process_single_image(self, image_path: Path) -> np.ndarray | None:
        """Process a single image"""
        try:
            img = cv2.imread(str(image_path))
            if img is None:
                return None

            if self.options.get("crop_enabled"):
                img = ImageOperations.crop_image(
                    img,
                    self.options.get("crop_x", 0),
                    self.options.get("crop_y", 0),
                    self.options.get("crop_width", img.shape[1]),
                    self.options.get("crop_height", img.shape[0]),
                )

            img = ImageOperations.add_timestamp(img, image_path)
            return img

        except Exception as e:
            self.logger.error(f"Failed to process {image_path}: {e}", exc_info=True)
            return None

    @staticmethod
    def _process_single_image_static(**params):
        """Static method for parallel processing"""
        try:
            img_path = str(params["img_path"])
            output_dir = str(params["output_dir"])
            options = params.get("options", {})
            settings = params.get("settings", {})

            img = cv2.imread(img_path)
            if img is None:
                raise ValueError(f"Failed to read image: {img_path}")

            if options.get("crop_enabled"):
                img = ImageOperations.crop_image(
                    img,
                    options.get("crop_x", 0),
                    options.get("crop_y", 0),
                    options.get("crop_width", img.shape[1]),
                    options.get("crop_height", img.shape[0]),
                )

            if options.get("false_color"):
                sanchez_path = settings.get("sanchez_path")
                underlay_path = settings.get("underlay_path")
                if sanchez_path and underlay_path:
                    sanchez_path = str(Path(sanchez_path))
                    underlay_path = str(Path(underlay_path))
                    img_path = str(Path(img_path))

                    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
                    output_file = (
                        Path(output_dir)
                        / f"processed_{Path(img_path).stem}_{timestamp}.jpg"
                    )
                    output_file = str(output_file)

                    cmd = [
                        f'"{sanchez_path}"',
                        "-s", f'"{img_path}"',
                        "-u", f'"{underlay_path}"',
                        "-o", f'"{output_file}"',
                        "-nogui", "-falsecolor",
                        "-format", "jpg",
                    ]

                    cmd_str = " ".join(cmd)
                    logger.debug(f"Running command: {cmd_str}")
                    subprocess.run(cmd_str, shell=True, check=True)

                    img = cv2.imread(output_file)
                    if img is None:
                        raise ValueError(
                            f"Failed to load processed image: {output_file}"
                        )

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            out_filename = generate_processed_filename(
                Path(img_path), timestamp, "processed"
            ).replace(Path(img_path).suffix, ".png")
            output_path = Path(output_dir)
            output_path.mkdir(parents=True, exist_ok=True)
            out_path = output_path / out_filename

            if not cv2.imwrite(str(out_path), img):
                raise OSError(f"Failed to save image to {out_path}")

            if not out_path.exists():
                raise OSError(f"Output file was not created: {out_path}")

            return str(out_path)

        except Exception as e:
            logger.error(f"Failed to process {params.get('img_path')}: {e}", exc_info=True)
            return None

    def cancel(self) -> None:
        """Cancel ongoing processing"""
        try:
            self.cancelled = True
            self.logger.info("Processing cancelled by user")
            self._is_processing = False

            if hasattr(self, "_proc") and self._proc and self._proc.poll() is None:
                try:
                    self._proc.terminate()
                    self._proc.wait(timeout=PROCESS_TERMINATE_TIMEOUT_SECONDS)
                except subprocess.TimeoutExpired:
                    self._proc.kill()
                except Exception as e:
                    self.logger.error(f"Error terminating process: {e}", exc_info=True)

            self.cleanup()
            self._emit_status("Processing cancelled")

        except Exception as e:
            self.logger.error(f"Error during cancellation: {e}", exc_info=True)
            self._emit_error(f"Failed to cancel processing: {e}")

    def get_input_files(self, input_dir: str | Path | None = None) -> list[Path]:
        """Get ordered input files using FileManager"""
        dir_to_use = str(input_dir) if input_dir else self.input_dir
        return self.file_manager.get_input_files(dir_to_use)

    def _get_output_filename(self, prefix="Animation", ext=".mp4"):
        """Generate timestamped output filename"""
        return generate_output_filename(self.timestamp, prefix, ext)

    def _get_processed_filename(self, original_path: Path, prefix="processed"):
        """Generate processed image filename"""
        return generate_processed_filename(original_path, self.timestamp, prefix)

    def _update_progress(self, operation: str, progress: int) -> None:
        """Update progress using callbacks"""
        self._emit_progress(operation, progress)
        self._emit_overall_progress(progress)

    def _default_progress_callback(self, operation: str, progress: int):
        """Default progress callback if none is provided."""
        self.logger.info(f"{operation}: {progress}%")

    def _default_status_callback(self, status: str):
        """Default status callback if none is provided."""
        self.logger.info(status)

    def some_other_method(self):
        """Example method where callbacks are invoked."""
        try:
            self._emit_status("Processing started.")
            self._emit_progress("Loading images", 10)
            self._emit_progress("Processing images", 50)
            self._emit_progress("Finalizing", 90)
            self._emit_status("Processing finished.")
            self._emit_finished()
        except Exception as e:
            self._emit_error(str(e))

    def run_processing(self):
        """Run processing with closing check"""
        if is_closing(None):
            self.cancel()

    def some_method(self):
        """No-op placeholder for future extension."""

    def update_resource_usage(self):
        """Update resource usage metrics."""
        try:
            data = {
                "cpu": psutil.cpu_percent(),
                "memory": psutil.virtual_memory().percent,
            }
            if self.on_resource_update:
                self.on_resource_update(data)
        except Exception as e:
            self.logger.debug(f"Failed to update resource usage: {e}")

    def _setup_resource_monitoring(self):
        """Setup resource monitoring timer using threading"""
        try:
            self._resource_timer_running = True
            self._resource_timer = threading.Timer(
                RESOURCE_MONITOR_INTERVAL_SECONDS, self._resource_timer_tick
            )
            self._resource_timer.daemon = True
            self._resource_timer.start()
        except Exception as e:
            self.logger.error(f"Failed to setup resource monitoring: {e}", exc_info=True)

    def _resource_timer_tick(self):
        """Periodic resource monitoring tick"""
        if not self._resource_timer_running:
            return
        self.update_resource_usage()
        if self._resource_timer_running:
            self._resource_timer = threading.Timer(
                RESOURCE_MONITOR_INTERVAL_SECONDS, self._resource_timer_tick
            )
            self._resource_timer.daemon = True
            self._resource_timer.start()

    def _load_preferences(self) -> None:
        """Load processor preferences"""
        if not hasattr(self, "preferences"):
            self.preferences = {}

        temp_dir = self.settings_manager.get("temp_directory")
        if not temp_dir:
            temp_dir = tempfile.gettempdir()
            self.settings_manager.set("temp_directory", str(temp_dir))

        self.preferences.update(
            {
                "input_dir": self.settings_manager.get("input_dir"),
                "output_dir": self.settings_manager.get("output_dir"),
                "temp_directory": temp_dir,
            }
        )

    def set_input_directory(self, path: str | Path) -> None:
        """Set input directory and save immediately"""
        if not path:
            self.logger.error("Attempted to set empty input directory")
            return

        try:
            input_path = Path(path)
            if not input_path.exists():
                self.logger.error(f"Input directory does not exist: {path}")
                return

            self.input_dir = str(input_path)
            self.settings_manager.set("input_dir", self.input_dir)
            self.options["input_dir"] = self.input_dir
        except Exception as e:
            self.logger.error(f"Failed to set input directory: {e}", exc_info=True)

    def set_output_directory(self, path: str | Path) -> None:
        """Set output directory and save immediately"""
        if not path:
            self.logger.error("Attempted to set empty output directory")
            return

        try:
            output_path = Path(path).resolve()
            output_path.mkdir(parents=True, exist_ok=True)
            self.output_dir = str(output_path)
            self.settings_manager.set("output_dir", self.output_dir)
            self.options["output_dir"] = self.output_dir
            self.logger.debug(f"Set output directory to: {self.output_dir}")
        except Exception as e:
            self.logger.error(f"Failed to set output directory: {e}", exc_info=True)
            raise

    def process_images_parallel(self, image_paths: list[Path]) -> list[np.ndarray]:
        """Process images in parallel with improved batching"""
        if not image_paths:
            return []

        return self.image_ops.process_image_batch(
            image_paths,
            {
                **self.options,
                "max_workers": self.max_workers,
                "batch_size": self.batch_size,
            },
        )

    def _find_ffmpeg(self) -> Path | None:
        """Find FFmpeg executable in system PATH"""
        from .ffmpeg import find_ffmpeg

        return find_ffmpeg()

    def save_images_parallel(
        self, images: list[np.ndarray], output_dir: Path, timestamp: str
    ) -> None:
        """Save images in parallel using multiprocessing"""
        num_processes = multiprocessing.cpu_count()
        tasks = [(idx, img, output_dir, timestamp) for idx, img in enumerate(images)]

        with multiprocessing.Pool(processes=num_processes) as pool:
            total = len(images)
            completed = 0

            results = pool.imap_unordered(self._save_single_image, tasks)
            for _ in results:
                completed += 1
                progress = int((completed / total) * 100)
                self._emit_progress("Saving processed images", progress)

    @staticmethod
    def _save_single_image(args) -> bool:
        """Save a single image (called by multiprocessing pool)"""
        # TODO (#18): Preserve EXIF metadata from source image using PIL/Pillow
        idx, img, output_dir, timestamp = args
        try:
            output_filename = f"processed_image_{idx:04d}_{timestamp}.png"
            output_path = output_dir / output_filename
            return cv2.imwrite(str(output_path), img)
        except Exception as e:
            logger.error(f"Error saving image {idx}: {e}", exc_info=True)
            return False

    def handle_resource_update(self, stats: dict):
        """Forward resource updates"""
        if self.on_resource_update:
            self.on_resource_update(stats)

    def _create_video(self, input_files, output_dir):
        """Create video from processed images with enhanced settings"""
        try:
            if not input_files:
                return False

            video_path = (
                output_dir / f"animation_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
            )

            if isinstance(input_files, list):
                if not input_files[0]:
                    return False
                input_dir = Path(input_files[0]).parent
            else:
                input_dir = Path(input_files)

            success = self.video_handler.create_video(
                input_dir,
                video_path,
                {
                    **self.options,
                    "input_files": [str(f) for f in input_files],
                },
            )

            if success:
                self._emit_output_ready(video_path)
                self._emit_status("Video creation completed successfully!")

            return success

        except Exception as e:
            self.logger.error(f"Video creation error: {e}", exc_info=True)
            return False

    def _process_image_subprocess(
        self, image_path: Path, options: dict
    ) -> np.ndarray | None:
        """Process a single image with proper dimension handling"""
        try:
            output_dir = str(Path(options["temp_dir"]) / "sanchez_outputs")
            img = ImageOperations.apply_false_color_and_read(
                str(image_path),
                output_dir,
                options.get("sanchez_path", ""),
                options.get("underlay_path", ""),
            )
            return img

        except Exception as e:
            self.logger.error(f"Error processing {image_path}: {e}", exc_info=True)
            return None

    def configure_encoder(self, options):
        """Configure encoder with the specified options."""
        encoder = options.get("encoder", "H.264")
        self.video_handler.configure_encoder(encoder, options)

    def encode_video(self, options: dict):
        """Encode video with the specified options."""
        fps = options.get("fps", 30)
        bitrate = options.get("bitrate", 5000)
        self.configure_encoder(options)
        self.video_handler.encode_video(fps, bitrate)

    def create_video(self, input_files, output_path, options):
        """Create video from processed images."""
        try:
            options.setdefault("encoder", "H.264")
            video_handler = VideoHandler()
            video_handler.testing = getattr(self, "testing", False)
            return video_handler.create_video(input_files, output_path, options)

        except Exception as e:
            self.logger.error(f"Video creation error: {e}", exc_info=True)
            raise
