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
from PyQt6.QtCore import pyqtSignal, QObject, QThread, QTimer  # Added QTimer import
import argparse
import psutil  # Add this import at the top
import time

from .base_processor import BaseImageProcessor
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

class SatelliteImageProcessor(BaseImageProcessor):  # Removed QObject from inheritance
    """Main image processing class for satellite imagery"""
    
    # Add missing signals
    status_update = pyqtSignal(str)
    error_occurred = pyqtSignal(str)
    finished = pyqtSignal()
    progress_update = pyqtSignal(str, int)  # Add missing progress signal
    overall_progress = pyqtSignal(int)  # Add overall progress signal

    def __init__(self, options: dict = None, parent=None) -> None:
        super().__init__(parent)  # Initialize base class with parent
        # Initialize components
        self.video_handler = VideoHandler()
        self.file_manager = FileManager()
        self.resource_monitor = ResourceMonitor(self)
        self.settings_manager = SettingsManager()
        
        # Basic setup
        self.logger = logging.getLogger(__name__)  # Just get the logger, don't configure it
        self._load_preferences()
        self._setup_resource_monitoring()
        
        # Load directories from settings first
        self.input_dir = self.settings_manager.get('input_dir')
        self.output_dir = self.settings_manager.get('output_dir')
        self.logger.debug(f"Initialized with dirs - input: {self.input_dir}, output: {self.output_dir}")
        
        # Initialize progress tracking
        self.current_operation = ""
        self.total_operations = 0
        
        # Store options and update directories
        self.options = options or {}
        self.update_directories()
        self.cancelled = False

        # Add timestamp attribute
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.logger = logging.getLogger(__name__)
        self._load_preferences()
        self._setup_resource_monitoring()
        self.temp_dir = None
        self.current_video_path = None
        self.current_output_dir = None  # Add this to track current session output
        
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

    def process(self):
        """Process satellite images with safer status updates."""
        try:
            self.update_progress("Initialization", 0)
            self.status_update.emit("Starting processing...")

            # Create timestamped output subdirectory at the start
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            self.current_output_dir = Path(self.output_dir) / f"processed_{timestamp}"
            self.current_output_dir.mkdir(parents=True, exist_ok=True)
            
            # Log directory creation at debug level only
            self.logger.debug(f"Created output directory: {self.current_output_dir}")
            
            # Remove redundant calls
            self.update_timestamp()
            
            # Update directories from current options
            self.update_directories()
            
            if not self.input_dir or not self.output_dir:
                raise ValueError("Input/output directories required")
            
            # Initialize processed_images list
            processed_images = []
            
            # Scanning files progress with proper emission
            self.progress_update.emit("Scanning Files", 20)
            self.overall_progress.emit(10)
            input_files = self.get_input_files(self.input_dir)
            
            if not input_files:
                raise ValueError("No valid images found in input directory")
                
            # Processing images
            total_images = len(input_files)
            for idx, img_path in enumerate(input_files, 1):
                if self.cancelled:
                    return False
                
                try:
                    # Process image
                    result = self._process_single_image_static(
                        img_path=str(img_path),
                        output_dir=str(self.output_dir),
                        options=self.options,
                        settings=self.preferences
                    )
                    if result:
                        processed_images.append(result)
                    
                    # Update both progress indicators
                    progress = int((idx / total_images) * 100)
                    self.update_progress("Processing Images", progress)
                    overall = int((10 + (idx / total_images) * 80))  # 10% scanned, 80% processing
                    self.overall_progress.emit(overall)
                    
                except Exception as e:
                    self.logger.error(f"Failed to process image {idx}/{total_images}: {e}")
            
            # Video creation progress
            if processed_images:
                self.progress_update.emit("Creating Video", 0)
                self.overall_progress.emit(90)
                video_path = self.current_output_dir / f"animation_{timestamp}.mp4"
                # Create unique temp directory for this video
                temp_video_dir = Path(self.options['temp_dir']) / f"video_{timestamp}"
                temp_video_dir.mkdir(parents=True, exist_ok=True)
                
                success = self._create_video(
                    processed_images,
                    video_path,
                    temp_dir=temp_video_dir
                )
                
                # Cleanup temp directory after video creation
                if temp_video_dir.exists():
                    shutil.rmtree(temp_video_dir, ignore_errors=True)
                    
                if success:
                    self.progress_update.emit("Creating Video", 100)
                    self.overall_progress.emit(100)
            
            # Single completion message at the end only
            if not self.cancelled:
                self.progress_update.emit("Processing completed", 100)  
                self.status_update.emit("Processing completed successfully!")  # Single completion message
                self.finished.emit()
            return True
            
        except Exception as e:
            self.error_occurred.emit(str(e))
            self.status_update.emit("Processing failed.")
            self.logger.error(f"Processing failed: {str(e)}")
            raise
        finally:
            # Cleanup any temporary files
            if hasattr(self, 'temp_dir') and self.temp_dir and self.temp_dir.exists():
                try:
                    shutil.rmtree(self.temp_dir, ignore_errors=True)
                except Exception as e:
                    self.logger.error(f"Failed to cleanup temp directory: {e}")

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
            # Only attempt cleanup if not already deleted
            if hasattr(self, '_is_deleted'):
                return
            self._is_deleted = True
            self.cleanup()
        except Exception:
            # Ignore errors during deletion
            pass

    def cleanup(self) -> None:
        """Clean up resources safely"""
        try:
            # Stop resource monitoring
            if hasattr(self, 'resource_monitor'):
                try:
                    self.resource_monitor.stop()
                except Exception:
                    pass

            # Stop update timer if it exists
            timer = getattr(self, 'update_timer', None)
            if timer is not None:
                try:
                    timer.stop()
                except Exception:
                    pass

            # Clean up process
            proc = getattr(self, '_proc', None)
            if proc is not None and hasattr(proc, 'poll'):
                try:
                    if proc.poll() is None:
                        proc.terminate()
                        proc.wait(timeout=5)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass

            # Clean up temp files
            temp_files = getattr(self, '_temp_files', [])
            for temp_file in temp_files:
                try:
                    if temp_file.exists():
                        temp_file.unlink()
                except Exception:
                    pass

            # Clean up temp directory
            if hasattr(self, 'temp_dir'):
                try:
                    if self.temp_dir.exists():
                        shutil.rmtree(self.temp_dir, ignore_errors=True)
                except Exception:
                    pass

        except Exception as e:
            # Log but don't raise during cleanup
            if hasattr(self, 'logger'):
                self.logger.error(f"Error during cleanup: {e}")

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

            # Video creation
            if processed_images:
                video_output = Path(output_dir) / "output_video.mp4"
                success = self.create_video(
                    images=processed_images,
                    output_path=video_output,
                    fps=self.options.get('fps', 30),
                    encoder=self.options.get('encoder', 'H.264'),
                )
                self.progress_update.emit("Creating Video", 100)

            if not self.cancelled:
                self.finished.emit()
            return True

        except Exception as e:
            if not self.cancelled:
                self.error_occurred.emit(str(e))
                self.status_update.emit("Processing failed.")
            self.logger.error(f"Processing failed: {str(e)}")
            return False

    def create_video(
        self,
        images: List[np.ndarray],
        output_path: Path,
        fps: int = 60,  # Increased FPS for smoother video
        encoder: str = 'H.264',
        bitrate: str = '8000k',
        preset: str = 'slow'  # Use slower preset for better quality
    ) -> bool:
        """Create a video from processed images with improved smoothness."""
        try:
            if not images:
                raise ValueError("No images provided for video creation")

            # Create temp directory for frames
            temp_dir = Path(self.preferences['temp_directory']) / "frames"
            temp_dir.mkdir(parents=True, exist_ok=True)

            # Save numpy arrays as image files
            frame_paths = []
            for idx, img in enumerate(images):
                frame_path = temp_dir / f"frame_{idx:04d}.png"
                cv2.imwrite(str(frame_path), img)
                frame_paths.append(frame_path)

            # Create temp file for image list
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
                image_list_path = Path(f.name)
                for frame_path in frame_paths:
                    f.write(f"file '{frame_path.absolute()}'\n")
                    f.write(f"duration {1/fps}\n")

            # Build FFmpeg command
            cmd = [
                'ffmpeg', '-y',
                '-f', 'concat',
                '-safe', '0',
                '-i', str(image_list_path),
                '-c:v', self._get_codec(encoder),
                '-preset', preset,
                '-b:v', bitrate,
                '-r', str(fps),
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                str(output_path)
            ]

            # Run FFmpeg
            process = subprocess.run(cmd, capture_output=True, text=True)
            if process.returncode != 0:
                raise RuntimeError(f"FFmpeg error: {process.stderr}")

            return True

        except Exception as e:
            self.logger.error(f"Video creation failed: {str(e)}")
            return False
            
        finally:
            # Clean up temp files
            if 'image_list_path' in locals():
                try:
                    image_list_path.unlink(missing_ok=True)
                except Exception:
                    pass
            
            # Clean up frame files
            if 'temp_dir' in locals():
                try:
                    for frame_path in frame_paths:
                        frame_path.unlink(missing_ok=True)
                    temp_dir.rmdir()
                except Exception:
                    pass

    def _get_codec(self, encoder: str) -> str:
        """Get appropriate codec based on encoder selection"""
        if encoder.startswith("CPU"):
            if "H.264" in encoder: return "libx264"
            if "H.265" in encoder or "HEVC" in encoder: return "libx265"
            if "AV1" in encoder: return "libaom-av1"
        else:  # GPU encoders
            if "H.264" in encoder: return "h264_nvenc"
            if "H.265" in encoder or "HEVC" in encoder: return "hevc_nvenc"
            if "AV1" in encoder: return "av1_nvenc"
        return "libx264"  # Default to H.264

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
            img = self._load_image(image_path)
            if img is None:
                return None

            # Use timestamp from utils instead of local implementation
            timestamp = self.parse_satellite_timestamp(image_path.name)
            
            # Process image with options
            if self.options.get('crop_enabled'):
                img = ImageOperations.crop_image(
                    img,
                    self.options.get('crop_x', 0),
                    self.options.get('crop_y', 0),
                    self.options.get('crop_width', img.shape[1]),
                    self.options.get('crop_height', img.shape[0])
                )

            # Use timestamp utility
            if timestamp:
                img = ImageOperations.add_timestamp(img, image_path)

            return img

        except Exception as e:
            self.logger.error(f"Failed to process {image_path}: {e}")
            return None

    def process(self):
        """Process satellite images with safer status updates."""
        try:
            self.update_progress("Initialization", 0)
            self.status_update.emit("Starting processing...")

            # Get directories from options first, then fall back to preferences
            input_dir = self.options.get('input_dir') or self.preferences.get('input_dir')
            output_dir = self.options.get('output_dir') or self.preferences.get('output_dir')
            
            if not input_dir or not output_dir:
                raise ValueError("Input/output directories required")
            
            # Initialize processed_images list
            processed_images = []
            
            # Scanning files progress with proper emission
            self.progress_update.emit("Scanning Files", 20)
            self.overall_progress.emit(10)
            input_files = self.get_input_files(self.input_dir)
            
            if not input_files:
                raise ValueError("No valid images found in input directory")
                
            # Processing images
            total_images = len(input_files)
            for idx, img_path in enumerate(input_files, 1):
                if self.cancelled:
                    return False
                
                try:
                    # Process image
                    result = self._process_single_image_static(
                        img_path=str(img_path),
                        output_dir=str(self.output_dir),
                        options=self.options,
                        settings=self.preferences
                    )
                    if result:
                        processed_images.append(result)
                    
                    # Update both progress indicators
                    progress = int((idx / total_images) * 100)
                    self.update_progress("Processing Images", progress)
                    overall = int((10 + (idx / total_images) * 80))  # 10% scanned, 80% processing
                    self.overall_progress.emit(overall)
                    
                except Exception as e:
                    self.logger.error(f"Failed to process image {idx}/{total_images}: {e}")
            
            # Video creation progress
            if processed_images:
                self.progress_update.emit("Creating Video", 0)
                self.overall_progress.emit(90)
                video_path = Path(self.output_dir) / f"Animation_{self.timestamp}.mp4"
                success = self._create_video(processed_images, video_path)
                if success:
                    self.progress_update.emit("Creating Video", 100)
                    self.overall_progress.emit(100)
            
            # Remove duplicate status messages and consolidate into one final message
            self.progress_update.emit("Processing completed", 100)
            if not self._is_closing:
                self.status_update.emit("Processing completed successfully.")
                self.finished.emit()
            return True
            
        except Exception as e:
            self.error_occurred.emit(str(e))
            self.status_update.emit("Processing failed.")
            self.logger.error(f"Processing failed: {str(e)}")
            raise

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

    def _create_video(self, image_files, output_path):
        """Create video from processed images with improved cleanup"""
        temp_video = None
        video_writer = None
        temp_dir = None
        
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            # Use session-specific temp directory from options or create new one
            temp_dir = Path(self.options.get('temp_dir', tempfile.gettempdir())) / f"video_{timestamp}"
            temp_dir.mkdir(parents=True, exist_ok=True)
            
            temp_video = temp_dir / "temp_video.mp4"
            self.current_video_path = temp_video  # Store current path for cleanup

            # First verify all images can be loaded
            valid_images = []
            for img_path in image_files:
                try:
                    img = cv2.imread(str(img_path))
                    if img is not None:
                        valid_images.append((img_path, img))
                    else:
                        self.logger.warning(f"Skipping unreadable image: {img_path}")
                except Exception as e:
                    self.logger.warning(f"Failed to load image {img_path}: {e}")
                    continue

            if not valid_images:
                raise ValueError("No valid images found for video creation")

            # Use first valid image for dimensions
            height, width = valid_images[0][1].shape[:2]
            fps = self.options.get('fps', 60)
            
            # Initialize video writer
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            video_writer = cv2.VideoWriter(str(temp_video), fourcc, fps, (width, height))

            # Write frames
            for idx, (img_path, img) in enumerate(valid_images):
                if self.cancelled:
                    return False
                video_writer.write(img)
                # Use progress_update signal instead of on_progress
                progress = int((idx + 1) * 100 / len(valid_images))
                self.progress_update.emit("Creating Video", progress)

            # Properly close video writer
            if video_writer:
                video_writer.release()

            # Apply interpolation if enabled
            if self.options.get('interpolation', False):
                # ...existing interpolation code...
                pass
            else:
                # No interpolation - just copy temp video
                shutil.copy2(str(temp_video), str(output_path))

            return True

        except Exception as e:
            self.logger.error(f"Video creation failed: {str(e)}")
            return False
            
        finally:
            # Cleanup in correct order
            try:
                if video_writer:
                    video_writer.release()
                
                if temp_video and Path(temp_video).exists():
                    try:
                        # Give time for file handle to be released
                        time.sleep(1)
                        Path(temp_video).unlink()
                    except Exception as e:
                        self.logger.warning(f"Failed to remove temp video: {e}")
                
                if temp_dir and Path(temp_dir).exists():
                    try:
                        shutil.rmtree(temp_dir, ignore_errors=True)
                    except Exception as e:
                        self.logger.warning(f"Failed to remove temp directory: {e}")
                        
            except Exception as e:
                self.logger.error(f"Cleanup error: {e}")

    def _process_single_image(self, img_path: Path, output_path: Path) -> Path:
        """Process single image including false color"""
        try:
            # Apply false color if enabled
            if self.options.get('false_color'):
                sanchez_path = Path(self.preferences['sanchez_path'])
                underlay_path = Path(self.preferences['underlay_path'])
                
                if not sanchez_path.exists():
                    raise ValueError(f"Sanchez executable not found: {sanchez_path}")
                    
                if not underlay_path.exists():
                    raise ValueError(f"Underlay image not found: {underlay_path}")
                
                # Call Sanchez for false color
                output_file = output_path / f"processed_{img_path.stem}_{self.timestamp}.jpg"
                cmd = [
                    str(sanchez_path),
                    '-s', str(img_path),
                    '-v',
                    '-o', str(output_file),
                    '-u', str(underlay_path)
                ]
                
                process = subprocess.run(cmd, capture_output=True, text=True)
                if process.returncode != 0:
                    raise RuntimeError(f"Sanchez processing failed: {process.stderr}")
                    
                return output_file
                
            # Regular image processing without false color
            img = cv2.imread(str(img_path))
            if img is None:
                raise ValueError(f"Failed to read image: {img_path}")

            # Process image based on options
            if self.options.get('crop_enabled'):
                img = ImageOperations.crop_image(
                    img,
                    self.options['crop_x'],
                    self.options['crop_y'],
                    self.options['crop_width'],
                    self.options['crop_height']
                )

            # Generate output filename
            out_filename = f"processed_{img_path.stem}_{self.timestamp}.png"
            out_path = output_path / out_filename
            
            cv2.imwrite(str(out_path), img)
            return out_path

        except Exception as e:
            self.logger.error(f"Failed to process {img_path}: {e}")
            raise

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
        """Setup resource monitoring timer with better error handling"""
        try:
            self.update_timer = QTimer()  # Don't parent to self to avoid circular reference
            self.update_timer.timeout.connect(self.update_resource_usage)
            self.update_timer.start(1000)
            
            # Initialize tracking variables
            self._last_sent = 0
            self._last_recv = 0
            self._is_deleted = False  # Add deletion flag
            
        except Exception as e:
            self.logger.error(f"Failed to setup resource monitoring: {e}")

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
        if path:
            self.input_dir = str(path)
            self.settings_manager.set('input_dir', str(path))
            self.options['input_dir'] = str(path)

    def set_output_directory(self, path: str) -> None:
        """Set output directory and save immediately"""
        if path:
            self.output_dir = str(path)
            self.settings_manager.set('output_dir', str(path))
            self.options['output_dir'] = str(path)