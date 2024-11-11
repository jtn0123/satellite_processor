"""
Main Satellite Image Processing Orchestrator
-----------------------------------------
Coordinates the overall processing workflow:
- Manages the processing pipeline
- Coordinates between UI and processing components
- Handles high-level error management
- Provides progress and status updates

Does NOT directly handle:
- Video creation (handled by VideoHandler)
- Image operations (handled by ImageOperations)
- File operations (handled by FileManager)
"""

import concurrent.futures
from pathlib import Path
from typing import List, Optional, Tuple, Dict, Any
import numpy as np # type: ignore
import logging
import cv2 # type: ignore
import subprocess
import tempfile
import os
from datetime import datetime
import shutil
import re
import codecs
import sys
from PyQt6.QtCore import pyqtSignal, QObject, QThread, QTimer, QMetaObject, Qt  # Added QMetaObject and Qt imports
from PyQt6.QtWidgets import QApplication  # Added QApplication import
import argparse
import psutil  # Add this import at the top
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import multiprocessing
from typing import List, Optional, Tuple, Dict, Any, Iterator
from typing import List, Optional, Tuple, Dict, Any, Iterator
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
        self.input_dir = self.settings_manager.get('input_dir')
        self.output_dir = self.settings_manager.get('output_dir')
        
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

    def update_directories(self):
        """Update input/output directories from options or settings"""
        if 'input_dir' in self.options:
            self.set_input_directory(self.options['input_dir'])
        if 'output_dir' in self.options:
            self.set_output_directory(self.options['output_dir'])

    def update_progress(self, operation: str, progress: int):
        """Update progress with proper signal emission"""
        self.current_operation = operation
        self.progress_update.emit(operation, progress)

    def _create_progress_bar(self, operation: str, current: int, total: int, width: int = 40) -> str:
        """Create a more visually appealing progress bar with persistent operation name"""
        progress = float(current) / total
        filled = int(width * progress)
        bar = '█' * filled + '░' * (width - filled)
        percent = int(progress * 100)
        return f"{operation}: [{bar}] {percent}%"

    def process(self):
        """Main processing workflow coordinator with parallel processing"""
        try:
            # Clear any previous content
            self.status_update.emit("")
            
            # Initial header
            self.status_update.emit("🛰️ Satellite Image Processing")
            self.status_update.emit("━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            
            # Update initial messages
            self.status_update.emit("🛰️ Starting satellite image processing...")
            
            # Clear previous output
            self.status_update.emit("")
            self.update_progress("Initialization", 0)
            
            if not all([self.input_dir, self.output_dir]):
                raise ValueError("Input and output directories must be set")

            # Setup directories and get input files
            base_output = Path(self.output_dir)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            # Create step directories
            dirs = {
                'crop': base_output / f"01_cropped_{timestamp}",
                'false_color': base_output / f"02_false_color_{timestamp}",
                'timestamp': base_output / f"03_timestamp_{timestamp}",
                'final': base_output / f"04_final_{timestamp}"
            }
            
            for dir_path in dirs.values():
                dir_path.mkdir(parents=True, exist_ok=True)

            # Get and sort input files
            input_files = sorted(self.file_manager.get_input_files(self.input_dir))
            if not input_files:
                raise ValueError("No valid images found in input directory")

            num_processes = max(1, multiprocessing.cpu_count() - 1)  # Leave one core free
            current_files = input_files

            # Step 1: Parallel Cropping
            if self.options.get('crop_enabled'):
                self.status_update.emit("Starting cropping operation...")
                with multiprocessing.Pool(processes=num_processes) as pool:
                    crop_args = [(str(f), dirs['crop'], self.options) for f in current_files]
                    cropped_files = []
                    completed = 0
                    
                    for idx, result in enumerate(pool.imap_unordered(self._parallel_crop, crop_args), 1):
                        if result:
                            cropped_files.append(Path(result))
                        progress = int((idx / len(current_files)) * 100)
                        self.progress_update.emit("Cropping Images", progress)
                        self.status_update.emit(f"Cropped image {idx} of {len(current_files)}")
                        QApplication.processEvents()  # Allow UI updates
                    
                    current_files = sorted(cropped_files)  # Keep files sorted

            # Step 2: Parallel False Color
            if self.options.get('false_color_enabled'):
                operation_name = "🎨 False Color Processing"
                self.status_update.emit(operation_name)
                self.status_update.emit(f"└─ Using Sanchez: {Path(self.options['sanchez_path']).name}")
                
                with multiprocessing.Pool(processes=num_processes) as pool:
                    fc_args = [(str(f), dirs['false_color'], self.options) for f in current_files]
                    fc_files = []
                    total_files = len(current_files)
                    
                    # Show progress less frequently
                    for idx, result in enumerate(pool.imap_unordered(self._parallel_false_color, fc_args), 1):
                        if result:
                            fc_files.append(Path(result))
                        if idx == 1 or idx % 5 == 0 or idx == total_files:  # Show at start, every 5th step, and end
                            progress_bar = self._create_progress_bar(operation_name, idx, total_files)
                            self.status_update.emit(f"\r{progress_bar}")  # Will update in place
                        self.progress_update.emit("Applying False Color", int((idx / total_files) * 100))
                    
                    self.status_update.emit("✅ False color complete")
                    current_files = sorted(fc_files)

            # Step 3: Parallel Timestamp Addition
            operation_name = "⏰ Timestamp Processing"
            self.status_update.emit(f"\n{operation_name}")
            with multiprocessing.Pool(processes=num_processes) as pool:
                ts_args = [(str(f), dirs['timestamp'], self.options) for f in current_files]
                final_files = []
                total_files = len(current_files)
                
                for idx, result in enumerate(pool.imap_unordered(self._parallel_timestamp, ts_args), 1):
                    if result:
                        final_files.append(Path(result))
                    if idx == 1 or idx % 5 == 0 or idx == total_files:  # Show at start, every 5th step, and end
                        progress_bar = self._create_progress_bar(operation_name, idx, total_files)
                        self.status_update.emit(f"\r{progress_bar}")
                    self.progress_update.emit("Adding Timestamps", int((idx / total_files) * 100))
                    QApplication.processEvents()
                
                self.status_update.emit("✅ Timestamps complete")

            # Step 4: Create Video from images
            if final_files:
                operation_name = "🎥 Creating Video"
                self.status_update.emit(f"\n{operation_name}")
                self.update_progress("Creating Video", 0)
                video_path = dirs['final'] / f"animation_{timestamp}.mp4"
                
                # Read images in BGR format
                images = []
                total_files = len(final_files)
                
                for idx, img_path in enumerate(final_files, 1):
                    img = cv2.imread(str(img_path))
                    if img is not None:
                        images.append(img)
                    if idx == 1 or idx % 5 == 0 or idx == total_files:  # Show at start, every 5th step, and end
                        progress_bar = self._create_progress_bar(operation_name, idx, total_files)
                        self.status_update.emit(f"\r{progress_bar}")
                    self.progress_update.emit("Loading Images", int((idx / total_files) * 100))
                    QApplication.processEvents()
                
                if not images:
                    raise ValueError("No valid images for video creation")
                
                # Create video with proper frame handling
                success = self.video_handler.create_video(
                    images,  # Pass numpy arrays directly
                    video_path,
                    {
                        'fps': self.options.get('fps', 30),
                        'codec': self.options.get('codec', 'H.264'),
                        'bitrate': self.options.get('bitrate', '8000k'),
                        'preset': self.options.get('preset', 'slow')
                    }
                )
                
                if success:
                    # Add separator and completion message
                    self.status_update.emit("\n" + "─" * 50)  # Separator line
                    self.status_update.emit("\n✨ Processing Complete")
                    
                    # Format video path for clickable link
                    clean_path = str(video_path).replace('\\', '/')
                    filename = video_path.name
                    self.status_update.emit(
                        f"\n📁 Output: <a href=\"file:///{clean_path}\" "
                        f"style=\"color: #3498db; text-decoration: none;\">{filename}</a>"
                    )
                    self.status_update.emit("\n" + "─" * 50)  # Bottom separator
                else:
                    self.status_update.emit("\n❌ Failed to create video!")

            self.status_update.emit("\n🎉 All processing completed!")
            return True

        except Exception as e:
            self.error_occurred.emit(f"❌ Error: {str(e)}")
            return False

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
                options.get('crop_x', 0),
                options.get('crop_y', 0),
                options.get('crop_width', img.shape[1]),
                options.get('crop_height', img.shape[0])
            )
            
            output_path = Path(output_dir) / Path(input_path).name
            cv2.imwrite(str(output_path), cropped)
            return str(output_path)
        except Exception:
            return None

    @staticmethod
    def _parallel_false_color(args):
        """Parallel false color worker with progress updates"""
        try:
            input_path, output_dir, options = args
            result = ImageOperations.apply_false_color(
                str(input_path),
                Path(output_dir),
                Path(input_path).stem,
                Path(options['sanchez_path']),
                Path(options['underlay_path'])
            )
            return str(result) if result else None
        except Exception:
            return None

    @staticmethod
    def _parallel_timestamp(args):
        """Parallel timestamp worker"""
        try:
            input_path, output_dir, options = args
            img = cv2.imread(str(input_path))
            if img is None:
                return None
                
            timestamped = ImageOperations.add_timestamp(img, Path(input_path))
            output_path = Path(output_dir) / Path(input_path).name
            cv2.imwrite(str(output_path), timestamped)
            return str(output_path)
        except Exception:
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
                self.progress.update_progress("Processing Images", progress)
                
            except Exception as e:
                self.logger.error(f"Error processing {path}: {e}")
                
        return processed

    def __del__(self):
        """Safe cleanup on deletion"""
        try:
            if not hasattr(self, '_is_deleted'):
                self.cleanup()
        except Exception as e:
            # Just log the error, can't do much else during deletion
            if hasattr(self, 'logger'):
                self.logger.error(f"Deletion cleanup error: {e}")

    def cleanup(self) -> None:
        """Clean up resources safely"""
        try:
            self.file_manager.cleanup()  # This now handles all file cleanup
            self.resource_monitor.stop()
            # Stop resource monitor first
            if hasattr(self, 'resource_monitor') and self.resource_monitor is not None:
                try:
                    # Call cleanup directly instead of using invokeMethod
                    self.resource_monitor.stop()
                    if self.resource_monitor.isRunning():
                        self.resource_monitor.wait()
                    self.resource_monitor.deleteLater()
                    self.resource_monitor = None
                except Exception as e:
                    self.logger.error(f"Failed to stop resource monitor: {e}")

            # Stop timers from the main thread
            if hasattr(self, 'update_timer') and self.update_timer is not None:
                try:
                    if QThread.currentThread() != QApplication.instance().thread():
                        # Move timer operations to main thread if needed
                        QMetaObject.invokeMethod(
                            self.update_timer,
                            "stop",
                            Qt.ConnectionType.BlockingQueuedConnection
                        )
                        QMetaObject.invokeMethod(
                            self.update_timer,
                            "deleteLater",
                            Qt.ConnectionType.BlockingQueuedConnection
                        )
                    else:
                        self.update_timer.stop()
                        self.update_timer.deleteLater()
                    self.update_timer = None
                except Exception as e:
                    self.logger.error(f"Timer cleanup error: {e}")

            # Clean up temp directory if it exists
            if hasattr(self, 'temp_dir') and self.temp_dir is not None:
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
            if self.options.get('false_color', False):
                required_keys = ['sanchez_path', 'underlay_path']
                missing = [key for key in required_keys if not self.preferences.get(key)]
            # Always require temp_directory
            if not self.preferences.get('temp_directory'):
                missing.append('temp_directory')
            
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
            if self.options.get('crop_enabled'):
                img = ImageOperations.crop_image(
                    img,
                    self.options.get('crop_x', 0),
                    self.options.get('crop_y', 0),
                    self.options.get('crop_width', img.shape[1]),
                    self.options.get('crop_height', img.shape[0])
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
            img_path = str(params['img_path'])
            output_dir = str(params['output_dir'])
            options = params.get('options', {})
            settings = params.get('settings', {})
            
            # Read image
            img = cv2.imread(img_path)
            if img is None:
                raise ValueError(f"Failed to read image: {img_path}")

            # Process image based on options
            if options.get('crop_enabled'):
                img = ImageOperations.crop_image(
                    img,
                    options.get('crop_x', 0),
                    options.get('crop_y', 0),
                    options.get('crop_width', img.shape[1]),
                    options.get('crop_height', img.shape[0])
                )
                
            # Handle false color if enabled
            if options.get('false_color'):
                sanchez_path = settings.get('sanchez_path')
                underlay_path = settings.get('underlay_path')
                if sanchez_path and underlay_path:
                    # Convert paths to raw strings to handle UNC paths
                    sanchez_path = str(Path(sanchez_path))
                    underlay_path = str(Path(underlay_path))
                    img_path = str(Path(img_path))
                    
                    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
                    output_file = Path(output_dir) / f"processed_{Path(img_path).stem}_{timestamp}.jpg"
                    output_file = str(output_file)
                    
                    # Build command with proper path escaping
                    cmd = [
                        f'"{sanchez_path}"',                        '-s', f'"{img_path}"',                        '-u', f'"{underlay_path}"',                        '-o', f'"{output_file}"',                        '-nogui',
                        '-falsecolor',
                        '-format', 'jpg'
                    ]
                    
                    # Join command with spaces and run as a single string
                    cmd_str = ' '.join(cmd)
                    print(f"Running command: {cmd_str}")
                    # Execute the command
                    subprocess.run(cmd_str, shell=True, check=True)
                    
                    # Optionally, load the processed image
                    img = cv2.imread(output_file)
                    if img is None:
                        raise ValueError(f"Failed to load processed image: {output_file}")
                
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
        self.cancelled = True
        self.logger.info("Processing cancelled by user")
        if self._proc and self.__proc.poll() is None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()
        self.cleanup()

    def get_input_files(self, input_dir: str = None) -> List[Path]:
        """Retrieve and sort input image files."""
        # Use provided input_dir or fall back to instance variable
        dir_to_use = input_dir or self.input_dir
        if not dir_to_use:
            raise ValueError("No input directory specified")
            
        valid_extensions = ('.jpg', '.jpeg', '.png', '.tif', '.tiff')
        image_paths = sorted(Path(dir_to_use).glob('*'))
        return [p for p in image_paths if p.suffix.lower() in valid_extensions]

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
        # ...existing code...
        if self.parent()._is_closing:
            self.cancel()
            return
        # ...existing code...

    def update_resource_usage(self):
        """Update resource usage metrics.""" 
        try:
            data = {
                'cpu': psutil.cpu_percent(),
                'memory': psutil.virtual_memory().percent
            }
            self.resource_monitor.resource_update.emit(data)
        except Exception as e:
            self.logger.debug(f"Failed to update resource usage: {e}")

    def _setup_resource_monitoring(self):
        """Setup resource monitoring timer with improved thread safety"""
        try:
            # Create timer in the main thread
            if QThread.currentThread() != QApplication.instance().thread():
                QMetaObject.invokeMethod(self, 
                                       "_create_timer",
                                       Qt.ConnectionType.BlockingQueuedConnection)
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
        if not hasattr(self, 'preferences'):
            self.preferences = {}
        
        # Ensure temp_directory is always set
        temp_dir = self.settings_manager.get('temp_directory')
        if not temp_dir:
            temp_dir = tempfile.gettempdir()
            self.settings_manager.set('temp_directory', str(temp_dir))
        
        # Update preferences
        self.preferences.update({
            'input_dir': self.settings_manager.get('input_dir'),
            'output_dir': self.settings_manager.get('output_dir'),
            'temp_directory': temp_dir,  # Always include temp directory
        })

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
            self.settings_manager.set('input_dir', self.input_dir)
            self.options['input_dir'] = self.input_dir
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
            self.settings_manager.set('output_dir', self.output_dir)
            self.options['output_dir'] = self.output_dir
            
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
                'max_workers': self.max_workers,
                'batch_size': self.batch_size
            }
        )

    def _find_ffmpeg(self) -> Optional[Path]:
        """Find FFmpeg executable in system PATH"""
        try:
            # Check Windows-specific paths first
            common_paths = [
                Path('C:/ffmpeg/bin/ffmpeg.exe'),
                Path(os.environ.get('PROGRAMFILES', ''), 'ffmpeg/bin/ffmpeg.exe'),
                Path(os.environ.get('PROGRAMFILES(X86)', ''), 'ffmpeg/bin/ffmpeg.exe'),
                Path(os.environ.get('LOCALAPPDATA', ''), 'ffmpeg/bin/ffmpeg.exe'),
            ]
            
            for path in common_paths:
                if path.exists():
                    self.logger.debug(f"Found FFmpeg at: {path}")
                    return path

            # Try PATH environment
            try:
                result = subprocess.run(['ffmpeg', '-version'], 
                                     capture_output=True, 
                                     text=True)
                if result.returncode == 0:
                    return Path('ffmpeg')
            except Exception:
                pass

            self.logger.error("FFmpeg not found in system")
            return None
            
        except Exception as e:
            self.logger.error(f"Error finding FFmpeg: {e}")
            return None

    def save_images_parallel(self, images: List[np.ndarray], output_dir: Path, timestamp: str) -> None:
        """Save images in parallel using multiprocessing"""
        num_processes = multiprocessing.cpu_count()
        tasks = [
            (idx, img, output_dir, timestamp) 
            for idx, img in enumerate(images)
        ]
        
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

    # ...rest of the class implementation...
