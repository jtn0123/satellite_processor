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

import concurrent.futures
from pathlib import Path
from typing import List, Optional, Tuple, Dict, Any, Iterator
import numpy as np  # type: ignore
import logging
import cv2  # type: ignore
import subprocess
import tempfile
import os
from datetime import datetime
import shutil
import re
import sys
from PyQt6.QtCore import (
    pyqtSignal,
    QObject,
    QThread,
    QTimer,
    QMetaObject,
    Qt,
)
from PyQt6.QtWidgets import QApplication
import argparse
import psutil
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import multiprocessing
from functools import partial

from .image_operations import ImageOperations
from .video_handler import VideoHandler
from .file_manager import FileManager
from .resource_monitor import ResourceMonitor
from .progress_tracker import ProgressTracker  # Changed from ..utils.progress_tracker
from .utils import parse_satellite_timestamp, is_closing
from .settings_manager import SettingsManager

# Additional imports as needed

logger = logging.getLogger(__name__)

# Remove any logging configuration here to prevent duplication
# Ensure that logging is configured only in the main application or a central module


class SatelliteImageProcessor(QObject):  # Change from BaseImageProcessor to QObject
    """Main image processing class for satellite imagery"""

    # Define all signals here
    status_update = pyqtSignal(str)
    error_occurred = pyqtSignal(str)
    finished = pyqtSignal()
    progress_update = pyqtSignal(str, int)
    overall_progress = pyqtSignal(int)
    resource_update = pyqtSignal(dict)
    output_ready = pyqtSignal(Path)  # Add this with other signals

    def __init__(self, options: dict = None, parent=None) -> None:
        super().__init__(parent)

        # Initialize managers (removed duplicate initializations)
        self.file_manager = FileManager()  # Handles both file and temp operations
        self.video_handler = VideoHandler()
        self.image_ops = ImageOperations()
        self.resource_monitor = ResourceMonitor(self)
        self.settings_manager = SettingsManager()

        # Connect resource monitoring
        self.resource_monitor.resource_update.connect(self.handle_resource_update)
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
        self.max_workers = min(cpu_count * 2, 16)
        self.chunk_size = max(5, min(20, cpu_count))
        self.batch_size = 1000

        # Add initialization of process attribute
        self._proc = None
        self._is_processing = False

        # Add FFmpeg process tracking
        self._ffmpeg_processes = set()

    def update_directories(self):
        """Update input/output directories from options or settings"""
        if "input_dir" in self.options:
            self.set_input_directory(self.options["input_dir"])
        if "output_dir" in self.options:
            self.set_output_directory(self.options["output_dir"])

    def update_progress(self, operation: str, progress: int):
        """Update progress with proper signal emission"""
        self.current_operation = operation
        self.progress_update.emit(operation, progress)

    def _create_progress_bar(
        self, operation: str, current: int, total: int, width: int = 40
    ) -> str:
        """Create simple progress bar string"""
        progress = float(current) / total
        filled = int(width * progress)
        bar = "█" * filled + "░" * (width - filled)
        percent = int(progress * 100)
        return f"{operation} [{bar}] {percent}%"

    def _emit_status(self, message: str):
        """Emit status without formatting"""
        self.status_update.emit(message)

    def process(self):
        """Main processing workflow with sequential stages but parallel processing within each stage"""
        try:
            if self._is_processing:
                self.logger.warning("Processing is already underway.")
                return

            self._is_processing = True
            self.cancelled = False

            # Initial setup
            self.logger.info("Starting satellite image processing workflow")
            self.status_update.emit("🛰️ Starting satellite image processing...")

            if not all([self.input_dir, self.output_dir]):
                self.logger.error("Input or output directory not set.")
                return

            # Ensure output directories exist
            Path(self.output_dir).mkdir(parents=True, exist_ok=True)

            # Setup stage directories
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

            # Get input files
            current_files = self.file_manager.get_input_files(self.input_dir)
            if not current_files:
                raise ValueError("No valid images found in input directory")

            # Configure optimal number of processes
            num_processes = min(
                len(current_files), max(1, multiprocessing.cpu_count() - 1)
            )
            self.logger.info(f"Using {num_processes} processes for parallel operations")

            # STAGE 1: Sanchez (False Color) with parallel processing
            if self.options.get("false_color_enabled"):
                self.logger.info("Starting parallel false color processing stage...")
                self.status_update.emit("🎨 Stage 1/4: Applying false color...")

                with multiprocessing.Pool(processes=num_processes) as pool:
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
                            return False

                        if result:
                            sanchez_files.append(Path(result))

                        progress = int((idx + 1) / total * 100)
                        self.progress_update.emit("False Color", progress)

                if sanchez_files:
                    current_files = self.file_manager.keep_file_order(sanchez_files)
                else:
                    self.logger.warning("No files were processed with false color")

            # STAGE 2: Cropping with parallel processing
            if self.options.get("crop_enabled"):
                self.logger.info("Starting parallel image cropping stage...")
                self.status_update.emit("📐 Stage 2/4: Cropping images...")

                with multiprocessing.Pool(processes=num_processes) as pool:
                    crop_args = [
                        (str(f), dirs["crop"], self.options) for f in current_files
                    ]
                    cropped_files = []
                    total = len(current_files)

                    for idx, result in enumerate(
                        pool.imap_unordered(self._parallel_crop, crop_args)
                    ):
                        if self.cancelled:
                            return False

                        if result:
                            cropped_files.append(Path(result))

                        progress = int((idx + 1) / total * 100)
                        self.progress_update.emit("Cropping", progress)

                if cropped_files:
                    current_files = self.file_manager.keep_file_order(cropped_files)
                else:
                    self.logger.warning("No files were cropped, using original files")

            # STAGE 3: Timestamp with parallel processing
            if self.options.get("add_timestamp", True):
                self.logger.info("Starting parallel timestamp processing stage...")
                self.status_update.emit("⏰ Stage 3/4: Adding timestamps...")

                with multiprocessing.Pool(processes=num_processes) as pool:
                    timestamp_args = [
                        (str(f), dirs["timestamp"]) for f in current_files
                    ]
                    timestamped_files = []
                    total = len(current_files)

                    for idx, result in enumerate(
                        pool.imap_unordered(self._parallel_timestamp, timestamp_args)
                    ):
                        if self.cancelled:
                            return False

                        if result:
                            timestamped_files.append(Path(result))

                        progress = int((idx + 1) / total * 100)
                        self.progress_update.emit("Adding Timestamps", progress)

                if timestamped_files:
                    current_files = self.file_manager.keep_file_order(timestamped_files)

            # STAGE 4: Video Creation (single process)
            if current_files:
                self.logger.info("Starting video creation stage...")
                self.status_update.emit("🎥 Stage 4/4: Creating video...")
                success = self._create_video(current_files, dirs["final"])
                if success:
                    video_path = next(dirs["final"].glob("*.mp4"))
                    self.output_ready.emit(video_path)
                    self.status_update.emit("✨ Processing completed successfully!")
                    return True

            return False

        except Exception as e:
            self.logger.error(f"Processing error: {str(e)}")
            self.error_occurred.emit(f"Error: {str(e)}")
            return False
        finally:
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
        except Exception:
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
        except Exception:
            return None

    @staticmethod
    def _parallel_timestamp(args):
        """Parallel timestamp worker with enhanced logging"""
        logger = logging.getLogger(__name__)
        try:
            # Fix argument unpacking - only need input_path and output_dir
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
            logger.error(f"Error in timestamp processing: {e}")
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
                self.progress_update.emit("Processing Images", progress)

            except Exception as e:
                self.logger.error(f"Error processing {path}: {e}")

        return processed

    def __del__(self):
        """Safe cleanup on deletion"""
        try:
            if not hasattr(self, "_is_deleted"):
                self.cleanup()
        except Exception as e:
            # Just log the error, can't do much else during deletion
            if hasattr(self, "logger"):
                self.logger.error(f"Deletion cleanup error: {e}")

    def cleanup(self) -> None:
        """Clean up resources safely"""
        try:
            # Terminate any running FFmpeg processes first
            for process in self._ffmpeg_processes.copy():
                try:
                    if process.poll() is None:
                        process.terminate()
                        process.wait(timeout=5)
                        self._ffmpeg_processes.remove(process)
                except Exception as e:
                    self.logger.error(f"Error terminating FFmpeg process: {e}")

            # Continue with existing cleanup
            self.file_manager.cleanup()  # This now handles all file cleanup
            self.resource_monitor.stop()
            # Stop resource monitor first
            if hasattr(self, "resource_monitor") and self.resource_monitor is not None:
                try:
                    # Call cleanup directly instead of using invokeMethod
                    self.resource_monitor.stop()
                    if self.resource_monitor.isRunning():
                        self.resource_monitor.terminate()
                    self.resource_monitor.deleteLater()
                    self.resource_monitor = None
                except Exception as e:
                    self.logger.error(f"Failed to stop resource monitor: {e}")

            # Stop timers from the main thread
            if hasattr(self, "update_timer") and self.update_timer is not None:
                try:
                    if QThread.currentThread() != QApplication.instance().thread():
                        QMetaObject.invokeMethod(
                            self.update_timer,
                            "stop",
                            Qt.ConnectionType.QueuedConnection,
                        )
                    else:
                        self.update_timer.stop()
                    self.update_timer = None
                except Exception as e:
                    self.logger.error(f"Timer cleanup error: {e}")

            # Clean up temp directory if it exists
            if hasattr(self, "temp_dir") and self.temp_dir is not None:
                try:
                    temp_dir = Path(self.temp_dir)
                    if temp_dir.exists():
                        shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception as e:
                    self.logger.error(f"Failed to cleanup temp directory: {e}")

        except Exception as e:
            self.logger.error(f"Cleanup error: {e}")
        finally:
            self._is_deleted = True

    def cleanup_temp_directory(self, temp_dir: Path):
        """Clean up a specific temporary directory."""
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception as e:
            self.logger.warning(f"Failed to remove temp directory {temp_dir}: {e}")

    def validate_preferences(self) -> Tuple[bool, str]:
        """Validate processor preferences based on options."""
        try:
            missing = []
            if self.options.get("false_color", False):
                required_keys = ["sanchez_path", "underlay_path"]
                missing = [
                    key for key in required_keys if not self.preferences.get(key)
                ]
            # Always require temp_directory
            if not self.preferences.get("temp_directory"):
                missing.append("temp_directory")

            if missing:
                msg = f"Missing required preferences: {', '.join(missing)}"
                self.logger.error(msg)
                return False, msg
            return True, "Preferences validated successfully"

        except Exception as e:
            return False, f"Validation error: {str(e)}"

    def run(self, input_dir: str, output_dir: str) -> bool:
        """Run the processing workflow."""
        try:
            if not output_dir:
                raise ValueError("Output directory not specified.")

            # Initialize progress tracking
            progress = 0
            self.progress_update.emit("Initializing", progress)

            # Create output directory and setup
            # ...existing code...

            image_paths = self.get_input_files(input_dir)
            if not image_paths:
                raise ValueError("No valid images found in the input directory.")

            processed_images = []
            total_images = len(image_paths)

            # Process images with proper progress tracking
            for idx, image_path in enumerate(image_paths, start=1):
                if self.cancelled:
                    self.status_update.emit("Processing cancelled.")
                    return False

                img = self.process_single_image(image_path)
                if img is not None:
                    processed_images.append(img)

                progress = int((idx / total_images) * 100)
                self.progress_update.emit("Processing Images", progress)
                self.overall_progress.emit(progress)

            if not self.cancelled:
                self.finished.emit()
            return True

        except Exception as e:
            if not self.cancelled:
                self.error_occurred.emit(str(e))
                self.status_update.emit("Processing failed.")
            self.logger.error(f"Processing failed: {str(e)}")
            return False

    def process_images(self, image_paths: List[Path]) -> List[np.ndarray]:
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
                    # Cancel remaining futures
                    for f in futures:
                        f.cancel()
                    break

                path = futures[future]
                try:
                    result = future.result()
                    if result is not None:
                        processed_images.append(result)
                    completed += 1
                    # Replace on_progress with signal emission
                    progress = int((completed / total_steps) * 100)
                    self.progress_update.emit("Processing Images", progress)
                except Exception as e:
                    self.logger.error(f"Error processing {path}: {str(e)}")

        return processed_images

    def process_single_image(self, image_path: Path) -> Optional[np.ndarray]:
        """Process a single image"""
        try:
            # Load image
            img = cv2.imread(str(image_path))
            if img is None:
                return None

            # Process image with options
            if self.options.get("crop_enabled"):
                img = ImageOperations.crop_image(
                    img,
                    self.options.get("crop_x", 0),
                    self.options.get("crop_y", 0),
                    self.options.get("crop_width", img.shape[1]),
                    self.options.get("crop_height", img.shape[0]),
                )

            # Let ImageOperations handle the timestamp
            img = ImageOperations.add_timestamp(img, image_path)

            return img

        except Exception as e:
            self.logger.error(f"Failed to process {image_path}: {e}")
            return None

    @staticmethod
    def _process_single_image_static(**params):
        """Static method for parallel processing"""
        try:
            img_path = str(params["img_path"])
            output_dir = str(params["output_dir"])
            options = params.get("options", {})
            settings = params.get("settings", {})

            # Read image
            img = cv2.imread(img_path)
            if img is None:
                raise ValueError(f"Failed to read image: {img_path}")

            # Process image based on options
            if options.get("crop_enabled"):
                img = ImageOperations.crop_image(
                    img,
                    options.get("crop_x", 0),
                    options.get("crop_y", 0),
                    options.get("crop_width", img.shape[1]),
                    options.get("crop_height", img.shape[0]),
                )

            # Handle false color if enabled
            if options.get("false_color"):
                sanchez_path = settings.get("sanchez_path")
                underlay_path = settings.get("underlay_path")
                if sanchez_path and underlay_path:
                    # Convert paths to raw strings to handle UNC paths
                    sanchez_path = str(Path(sanchez_path))
                    underlay_path = str(Path(underlay_path))
                    img_path = str(Path(img_path))

                    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
                    output_file = (
                        Path(output_dir)
                        / f"processed_{Path(img_path).stem}_{timestamp}.jpg"
                    )
                    output_file = str(output_file)

                    # Build command with proper path escaping
                    cmd = [
                        f'"{sanchez_path}"',
                        "-s",
                        f'"{img_path}"',
                        "-u",
                        f'"{underlay_path}"',
                        "-o",
                        f'"{output_file}"',
                        "-nogui",
                        "-falsecolor",
                        "-format",
                        "jpg",
                    ]

                    # Join command with spaces and run as a single string
                    cmd_str = " ".join(cmd)
                    print(f"Running command: {cmd_str}")
                    # Execute the command
                    subprocess.run(cmd_str, shell=True, check=True)

                    # Optionally, load the processed image
                    img = cv2.imread(output_file)
                    if img is None:
                        raise ValueError(
                            f"Failed to load processed image: {output_file}"
                        )

            # Normal image processing (if false color not enabled or failed)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            out_filename = f"processed_{Path(img_path).stem}_{timestamp}.png"
            output_path = Path(output_dir)
            output_path.mkdir(parents=True, exist_ok=True)
            out_path = output_path / out_filename

            # Save with error checking
            if not cv2.imwrite(str(out_path), img):
                raise IOError(f"Failed to save image to {out_path}")

            # Verify the file was written
            if not out_path.exists():
                raise IOError(f"Output file was not created: {out_path}")

            return str(out_path)  # Return string path for compatibility

        except Exception as e:
            print(f"Failed to process {params.get('img_path')}: {e}")
            return None

    def cancel(self) -> None:
        """Cancel ongoing processing"""
        try:
            self.cancelled = True
            self.logger.info("Processing cancelled by user")
            self._is_processing = False

            # Handle subprocess termination if it exists
            if hasattr(self, "_proc") and self._proc and self._proc.poll() is None:
                try:
                    self._proc.terminate()
                    self._proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self._proc.kill()
                except Exception as e:
                    self.logger.error(f"Error terminating process: {e}")

            self.cleanup()
            self.status_update.emit("Processing cancelled")

        except Exception as e:
            self.logger.error(f"Error during cancellation: {e}")
            self.error_occurred.emit(f"Failed to cancel processing: {str(e)}")

    def get_input_files(self, input_dir: str = None) -> List[Path]:
        """Get ordered input files using FileManager"""
        dir_to_use = input_dir or self.input_dir
        return self.file_manager.get_input_files(dir_to_use)

    def _get_output_filename(self, prefix="Animation", ext=".mp4"):
        """Generate timestamped output filename"""
        return f"{prefix}_{self.timestamp}{ext}"

    def _get_processed_filename(self, original_path: Path, prefix="processed"):
        """Generate processed image filename"""
        return f"{prefix}_{original_path.stem}_{self.timestamp}{original_path.suffix}"

    def _update_progress(self, operation: str, progress: int) -> None:
        """Update progress using signals"""
        self.progress_update.emit(operation, progress)
        self.overall_progress.emit(progress)

    def _default_progress_callback(self, operation: str, progress: int):
        """Default progress callback if none is provided."""
        self.logger.info(f"{operation}: {progress}%")

    def _default_status_callback(self, status: str):
        """Default status callback if none is provided."""
        self.logger.info(status)

    def some_other_method(self):
        """Example method where signals are emitted."""
        try:
            # ... some processing ...
            self.status_update.emit("Processing started.")
            self.progress_update.emit("Loading images", 10)
            # ... more processing ...
            self.progress_update.emit("Processing images", 50)
            # ... more processing ...
            self.progress_update.emit("Finalizing", 90)
            self.status_update.emit("Processing finished.")
            self.finished.emit()
        except Exception as e:
            self.error_occurred.emit(str(e))

    def run_processing(self):
        """Run processing with closing check"""
        if is_closing(self.parent()):
            self.cancel()
            return
        # ...existing code...

    def some_method(self):
        from satellite_processor.gui.widgets.video_options import (
            VideoOptionsWidget,
        )  # Moved import

        # ...use VideoOptionsWidget here...
        # ...existing code...
        if self.parent()._is_closing:
            self.cancel()
            return
        # ...existing code...

    def update_resource_usage(self):
        """Update resource usage metrics."""
        try:
            data = {
                "cpu": psutil.cpu_percent(),
                "memory": psutil.virtual_memory().percent,
            }
            self.resource_monitor.resource_update.emit(data)
        except Exception as e:
            self.logger.debug(f"Failed to update resource usage: {e}")

    def _setup_resource_monitoring(self):
        """Setup resource monitoring timer with improved thread safety"""
        try:
            # Create timer in the main thread
            if QThread.currentThread() != QApplication.instance().thread():
                QMetaObject.invokeMethod(
                    self, "_create_timer", Qt.ConnectionType.BlockingQueuedConnection
                )
            else:
                self._create_timer()
        except Exception as e:
            self.logger.error(f"Failed to setup resource monitoring: {e}")

    def _create_timer(self):
        """Create and setup timer in the main thread"""
        self.update_timer = QTimer()
        self.update_timer.timeout.connect(self.update_resource_usage)
        self.update_timer.start(1000)
        self._last_sent = 0
        self._last_recv = 0
        self._is_deleted = False

    def _load_preferences(self) -> None:
        """Load processor preferences"""
        if not hasattr(self, "preferences"):
            self.preferences = {}

        # Ensure temp_directory is always set
        temp_dir = self.settings_manager.get("temp_directory")
        if not temp_dir:
            temp_dir = tempfile.gettempdir()
            self.settings_manager.set("temp_directory", str(temp_dir))

        # Update preferences
        self.preferences.update(
            {
                "input_dir": self.settings_manager.get("input_dir"),
                "output_dir": self.settings_manager.get("output_dir"),
                "temp_directory": temp_dir,  # Always include temp directory
            }
        )

    def set_input_directory(self, path: str) -> None:
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
            self.logger.error(f"Failed to set input directory: {e}")

    def set_output_directory(self, path: str) -> None:
        """Set output directory and save immediately"""
        if not path:
            self.logger.error("Attempted to set empty output directory")
            return

        try:
            # Convert to Path and resolve
            output_path = Path(path).resolve()

            # Ensure directory exists
            output_path.mkdir(parents=True, exist_ok=True)

            # Store as string but only after validation
            self.output_dir = str(output_path)
            self.settings_manager.set("output_dir", self.output_dir)
            self.options["output_dir"] = self.output_dir

            self.logger.debug(f"Set output directory to: {self.output_dir}")
        except Exception as e:
            self.logger.error(f"Failed to set output directory: {e}")
            raise

    def process_images_parallel(self, image_paths: List[Path]) -> List[np.ndarray]:
        """Process images in parallel with improved batching"""
        if not image_paths:
            return []

        # Use optimized batch processing from ImageOperations
        return self.image_ops.process_image_batch(
            image_paths,
            {
                **self.options,
                "max_workers": self.max_workers,
                "batch_size": self.batch_size,
            },
        )

    def _find_ffmpeg(self) -> Optional[Path]:
        """Find FFmpeg executable in system PATH"""
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
                    return path

            # Try PATH environment
            ffmpeg_path = shutil.which("ffmpeg")
            if ffmpeg_path:
                return Path(ffmpeg_path)

            self.logger.error("FFmpeg not found in system")
            return None

        except Exception as e:
            self.logger.error(f"Error finding FFmpeg: {e}")
            return None

    def save_images_parallel(
        self, images: List[np.ndarray], output_dir: Path, timestamp: str
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
                self.progress_update.emit("Saving processed images", progress)

    @staticmethod
    def _save_single_image(args) -> bool:
        """Save a single image (called by multiprocessing pool)"""
        idx, img, output_dir, timestamp = args
        try:
            output_filename = f"processed_image_{idx:04d}_{timestamp}.png"
            output_path = output_dir / output_filename
            return cv2.imwrite(str(output_path), img)
        except Exception:
            return False

    def handle_resource_update(self, stats: dict):
        """Forward resource updates"""
        self.resource_update.emit(stats)

    def _create_video(self, input_files, output_dir):
        """Create video from processed images with enhanced settings"""
        try:
            if not input_files:
                return False

            # Create video path
            video_path = (
                output_dir / f"animation_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
            )

            # Create input directory path
            if isinstance(input_files, list):
                if not input_files[0]:
                    return False
                input_dir = Path(input_files[0]).parent
            else:
                input_dir = Path(input_files)

            # Create video with proper input directory
            success = self.video_handler.create_video(
                input_dir,  # Path object of input directory
                video_path,  # Path object for output
                {
                    **self.options,
                    "input_files": [
                        str(f) for f in input_files
                    ],  # Add list of files to options
                },
            )

            if success:
                self.output_ready.emit(video_path)
                self.status_update.emit("Video creation completed successfully!")

            return success

        except Exception as e:
            self.logger.error(f"Video creation error: {e}")
            return False

    def _process_image_subprocess(
        self, image_path: Path, options: dict
    ) -> Optional[np.ndarray]:
        """Process a single image with proper dimension handling"""
        try:
            # ...existing code...

            # Define output directory and file
            output_dir = Path(options["temp_dir"]) / "sanchez_outputs"
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = output_dir / f"{Path(image_path).stem}_sanchez.jpg"

            # Define underlay path
            underlay_path = options.get("underlay_path", "")

            false_color_path = ImageOperations.apply_false_color(
                str(image_path),
                str(output_path),  # Pass the full output file path
                options.get("sanchez_path"),
                str(underlay_path),
            )

            if not false_color_path:
                raise ValueError("Failed to apply false color")

            # Read the false color result
            img = cv2.imread(str(false_color_path))
            if img is None:
                raise ValueError("Failed to read false color output")

            logging.info(f"Successfully applied false color to: {image_path}")

            # ...existing code...

            return img

        except Exception as e:
            print(f"Error processing {image_path}: {e}")
            return None

    def configure_encoder(self, options):
        """Configure encoder with the specified options."""
        encoder = options.get("encoder", "H.264")
        self.video_handler.configure_encoder(encoder, options)

    def encode_video(self, options: dict):
        """Encode video with the specified options."""
        fps = options.get("fps", 30)
        bitrate = options.get("bitrate", 5000)
        # Configure encoder before encoding
        self.configure_encoder(options)
        self.video_handler.encode_video(fps, bitrate)

    def create_video(self, input_files, output_path, options):
        """Create video from processed images."""
        try:
            # ...existing code...

            # Ensure 'encoder' is set in options
            options.setdefault("encoder", "H.264")  # Set default encoder if not present

            video_handler = VideoHandler()
            video_handler.testing = getattr(
                self, "testing", False
            )  # Ensure testing is set
            return video_handler.create_video(input_files, output_path, options)

        except Exception as e:
            self.logger.error(f"Video creation error: {str(e)}")
            raise

    # ...rest of the class implementation...
