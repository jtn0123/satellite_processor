# satellite_processor/satellite_processor/core/processor.py
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
from PyQt6.QtCore import QObject, pyqtSignal  # Updated from PyQt5.QtCore to PyQt6.QtCore

from .base_processor import BaseImageProcessor
from .image_operations import ImageOperations
from ..utils.progress_tracker import ProgressTracker

class SatelliteImageProcessor(QObject):
    """Main image processing class for satellite imagery"""
    
    # Update signal definition to accept two arguments
    progress_update = pyqtSignal(str, int)  # operation, progress percentage
    status_update = pyqtSignal(str)
    error_occurred = pyqtSignal(str)

    def __init__(self, options: dict = None, parent=None) -> None:
        """Initialize the processor with settings and validate configuration"""
        super().__init__(parent)
        self.logger = logging.getLogger(__name__)
        self._proc: Optional[subprocess.Popen] = None
        self._temp_files: List[Path] = []
        self.options = options or {}
        self.input_dir = self.options.get('input_dir')
        self.output_dir = self.options.get('output_dir')
        self.timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        
        # Load settings from the settings manager
        from ..utils.settings import SettingsManager
        settings_manager = SettingsManager()
        self.preferences: Dict[str, Any] = settings_manager.load_settings()
        
        self.logger.debug("Loaded preferences:")
        for key, value in self.preferences.items():
            self.logger.debug(f"  {key}: {value}")
        
        # Validate settings immediately
        valid, msg = self.validate_preferences()
        if not valid:
            raise RuntimeError(f"Invalid preferences: {msg}")
            
        self.logger.setLevel(logging.DEBUG)  # Set desired logging level
        
        # Configure console handler with utf-8 encoding
        ch = logging.StreamHandler(codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict'))
        ch.setLevel(logging.DEBUG)
        
        # Create formatter and add to handler
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        ch.setFormatter(formatter)
        
        # Add handler to logger if not already present
        if not self.logger.handlers:
            self.logger.addHandler(ch)
        
        self.cancelled = False
        self.on_progress = self._default_progress_callback
        self.on_status = self._default_status_callback
        self.progress = ProgressTracker(self._update_progress)
            
    def __del__(self) -> None:
        """Cleanup resources on deletion"""
        self.cleanup()
            
    def cleanup(self) -> None:
        """Clean up temporary files and processes"""
        try:
            if self._proc and self._proc.poll() is None:
                self._proc.terminate()
                try:
                    self._proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self._proc.kill()
                    
            for temp_file in self._temp_files:
                try:
                    if temp_file.exists():
                        temp_file.unlink()
                except Exception as e:
                    self.logger.warning(f"Failed to remove temp file {temp_file}: {e}")
        except Exception as e:
            self.logger.error(f"Cleanup error: {str(e)}")

    def validate_preferences(self) -> Tuple[bool, str]:
        """Validate processor preferences"""
        try:
            required_keys = ['sanchez_path', 'underlay_path', 'temp_directory']
            missing = [key for key in required_keys if key not in self.preferences]
            if missing:
                return False, f"Missing required preferences: {', '.join(missing)}"
                
            # Validate paths
            sanchez_path = Path(self.preferences['sanchez_path'])
            underlay_path = Path(self.preferences['underlay_path'])
            
            if not sanchez_path.exists():
                return False, f"Sanchez executable not found: {sanchez_path}"
                
            if not underlay_path.exists():
                return False, f"Underlay image not found: {underlay_path}"
                
            return True, "Preferences validated successfully"
            
        except Exception as e:
            return False, f"Validation error: {str(e)}"

    def run(self, input_dir: str, output_dir: str) -> bool:
        """Run the processing workflow."""
        try:
            self.temp_dir = self.create_temp_directory()
            image_paths = self.get_input_files(input_dir)
            if not image_paths:
                raise ValueError("No valid images found in the input directory.")
            
            processed_images = []
            total_images = len(image_paths)
            for idx, image_path in enumerate(image_paths, start=1):
                if self.cancelled:
                    self.logger.info("Processing cancelled.")
                    return False
                img = self.process_single_image(image_path)
                if img is not None:
                    processed_images.append(img)
                progress = int((idx / total_images) * 100)
                self.progress_update.emit("Processing Images", progress)
            
            video_output = Path(output_dir) / "output_video.mp4"
            success = self.create_video(
                images=processed_images,
                output_path=video_output,
                fps=self.options.get('fps', 30),
                scale_factor=self.options.get('scale_factor', 1),
                encoder=self.options.get('encoder', 'H.264'),
            )
            self.progress_update.emit("Creating Video", 100)
            return success
        except Exception as e:
            self.logger.error(f"Processing failed: {e}")
            return False

    def create_video(
        self,
        images: List[np.ndarray],
        output_path: Path,
        fps: int = 30,
        scale_factor: int = 1,
        encoder: str = 'H.264',
        bitrate: str = '8000k',
        preset: str = 'medium'
    ) -> bool:
        """Create a video from processed images."""
        try:
            if not images:
                raise ValueError("No images provided for video creation")
                
            # Create temp file for image list
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
                image_list_path = Path(f.name)
                # Write image paths to file
                for img_path in images:
                    f.write(f"file '{img_path.absolute()}'\n")
                    f.write(f"duration {1/self.preferences.get('fps', fps)}\n")

            # Get encoder settings
            encoder = self.preferences.get('encoder', encoder)
            quality_preset = self.preferences.get('quality_preset', preset)
            bitrate = self.preferences.get('bitrate', int(bitrate.replace('k', '')))
            fps = self.preferences.get('fps', fps)

            # Build FFmpeg command
            cmd = [
                'ffmpeg', '-y',
                '-f', 'concat',
                '-safe', '0',
                '-i', str(image_list_path),
                '-c:v', self._get_codec(encoder),
                '-preset', quality_preset,
                '-b:v', f'{bitrate}k',
                '-maxrate', f'{int(bitrate * 1.2)}k',
                '-bufsize', f'{bitrate * 2}k',
                '-r', str(fps),
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart'
            ]

            # Add output path
            cmd.extend([str(output_path)])

            # Run FFmpeg
            process = subprocess.run(cmd, capture_output=True, text=True)
            if process.returncode != 0:
                raise RuntimeError(f"FFmpeg error: {process.stderr}")

            return True

        except Exception as e:
            self.logger.error(f"Video creation failed: {str(e)}")
            return False
        finally:
            # Clean up temp file
            if 'image_list_path' in locals():
                try:
                    image_list_path.unlink(missing_ok=True)
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
                    if self.on_progress:
                        progress = int((completed / total_steps) * 100)
                        self.on_progress("Processing images", progress)
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

            # Create temporary directory for processing
            temp_dir = self.create_temp_directory()
            
            try:
                # Apply crop if selected
                if self.preferences.get('crop'):
                    img = ImageOperations.crop_image(
                        img,
                        self.preferences.get('crop_x', 0),
                        self.preferences.get('crop_y', 0),
                        self.preferences.get('crop_width', img.shape[1]),
                        self.preferences.get('crop_height', img.shape[0])
                    )

                # Apply false color if selected
                if self.preferences.get('false_color'):
                    img = ImageOperations.apply_false_color(
                        img,
                        temp_dir,
                        image_path.stem,
                        Path(self.preferences['sanchez_path']),
                        Path(self.preferences['underlay_path'])
                    )

                # Apply upscale if selected
                if self.preferences.get('upscale'):
                    img = ImageOperations.upscale_image(
                        img,
                        self.preferences.get('upscale_method', '1'),
                        self.preferences.get('scale_factor', 2.0),
                        self.preferences.get('target_width', 1920)
                    )

                # Add timestamp overlay
                img = ImageOperations.add_timestamp(img, image_path)

                # Save the processed image to the output directory
                output_path = Path(self.preferences['output_dir']) / f"processed_{image_path.name}"
                self.logger.info(f"Saving processed image to: {output_path}")
                cv2.imwrite(str(output_path), img)

                return img
                
            finally:
                # Clean up temporary directory
                self.cleanup_temp_directory(temp_dir)

        except Exception as e:
            self.progress_update.emit(f"Error processing {image_path}: {e}")
            self.logger.error(f"Error processing {image_path}: {e}")
            raise  # Re-raise the exception to be caught in the GUI

    def process(self):
        """Process satellite images."""
        try:
            self.progress_update.emit("Initialization", 0)
            
            # Get directories from options first, then fall back to preferences
            input_dir = self.options.get('input_dir') or self.preferences.get('input_dir')
            output_dir = self.options.get('output_dir') or self.preferences.get('output_dir')
            
            if not input_dir or not output_dir:
                raise ValueError("Input/output directories required")
            
            # Initialize processed_images list
            processed_images = []
            
            # Scanning files progress with proper emission
            self.progress_update.emit("Scanning Files", 20)
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
                    self.progress_update.emit("Processing Images", progress)
                    self.on_progress("Overall", progress)  # Update overall progress
                    
                except Exception as e:
                    self.logger.error(f"Failed to process image {idx}/{total_images}: {e}")
            
            # Video creation progress
            if processed_images:
                self.progress_update.emit("Creating Video", 0)
                video_path = Path(self.output_dir) / f"Animation_{self.timestamp}.mp4"
                success = self._create_video(processed_images, video_path)
                if success:
                    self.progress_update.emit("Creating Video", 100)
                    self.on_progress("Overall", 100)  # Update final progress
            
            return True
            
        except Exception as e:
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
                        f'"{sanchez_path}"',  # Quote the executable path
                        '-s', f'"{img_path}"',  # Quote the input path
                        '-u', f'"{underlay_path}"',  # Quote the underlay path
                        '-o', f'"{output_file}"',  # Quote the output path
                        '-nogui',
                        '-falsecolor',
                        '-format', 'jpg'
                    ]
                    
                    # Join command with spaces and run as a single string
                    cmd_str = ' '.join(cmd)
                    print(f"Running command: {cmd_str}")  # Debug print
                    
                    try:
                        # Run command as a single string
                        process = subprocess.run(
                            cmd_str,
                            shell=True,  # Use shell to handle path escaping
                            capture_output=True,
                            text=True,
                            check=False  # Don't raise exception on non-zero exit
                        )
                        
                        if process.returncode != 0:
                            print(f"Sanchez stderr: {process.stderr}")  # Debug print
                            raise RuntimeError(f"Sanchez failed with return code {process.returncode}")
                            
                        if os.path.exists(output_file):
                            return output_file
                            
                    except Exception as e:
                        print(f"Sanchez command failed: {e}")
                        # Fall back to normal processing if Sanchez fails
            
            # Normal image processing (if false color not enabled or failed)
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            out_filename = f"processed_{Path(img_path).stem}_{timestamp}.png"
            out_path = str(Path(output_dir) / out_filename)
            
            # Save processed image
            cv2.imwrite(out_path, img)
            
            # Log progress
            total = params.get('total_images', 0)
            current = params.get('current_index', 0)
            if total:
                print(f"Processed {current + 1}/{total} images")
                
            return out_path

        except Exception as e:
            print(f"Failed to process {params.get('img_path')}: {e}")
            return None

    def _create_video(self, image_files, output_path):
        """Create video from processed images with improved interpolation"""
        try:
            if not image_files:
                raise ValueError("No images provided for video creation")

            # Get processing parameters
            fps = self.options.get('fps', self.preferences['default_fps'])
            input_fps = max(2, min(len(image_files) / 3, 15))  # Match PowerShell timing
            
            # Create temp directory for processing
            temp_dir = Path(self.preferences['temp_directory'])
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_video = temp_dir / "temp_video.mp4"
            
            self.logger.info(f"Creating initial video at {input_fps} fps")
            
            # First pass - create base video
            first_img = cv2.imread(str(image_files[0]))
            height, width = first_img.shape[:2]
            
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(str(temp_video), fourcc, input_fps, (width, height))

            for idx, img_path in enumerate(image_files):
                if self.cancelled:
                    return False
                    
                img = cv2.imread(str(img_path))
                out.write(img)
                
                if self.on_progress:
                    progress = int((idx + 1) * 50 / len(image_files))
                    self.on_progress(f"Creating base video: {idx+1}/{len(image_files)}", progress)

            out.release()

            # Second pass - apply interpolation
            if self.options.get('interpolation', False):
                self.logger.info("Applying frame interpolation...")
                
                # FFmpeg command with improved interpolation settings
                ffmpeg_cmd = [
                    'ffmpeg', '-y',
                    '-i', str(temp_video),
                    '-filter:v', f'minterpolate=fps={fps}:mi_mode=mci:me_mode=bidir:mc_mode=obmc:vsbmc=1:mb_size=16',
                    '-c:v', 'libx264',
                    '-preset', 'slow',
                    '-crf', '18',
                    '-pix_fmt', 'yuv420p',
                    '-movflags', '+faststart',
                    str(output_path)
                ]
                
                process = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
                if process.returncode != 0:
                    raise RuntimeError(f"FFmpeg interpolation failed: {process.stderr}")
            else:
                # No interpolation - just copy temp video
                shutil.copy2(str(temp_video), str(output_path))

            return True

        except Exception as e:
            self.logger.error(f"Video creation failed: {str(e)}")
            return False
        finally:
            # Cleanup temp files
            if temp_video.exists():
                temp_video.unlink()

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
        if self._proc and self._proc.poll() is None:
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

    def _parse_satellite_timestamp(self, filename: str) -> datetime:
        """Extract timestamp from GOES satellite filename format (G16_13_YYYYMMDDTHHMMSSZ)"""
        self.logger.debug(f"Parsing timestamp from filename: {filename}")
        match = re.search(r'(\d{8}T\d{6}Z)', filename)
        if match:
            timestamp_str = match.group(1)
            return datetime.strptime(timestamp_str, '%Y%m%dT%H%M%SZ')
        self.logger.warning(f"Could not parse timestamp from filename: {filename}")
        return datetime.min

    def _get_output_filename(self, prefix="Animation", ext=".mp4"):
        """Generate timestamped output filename"""
        return f"{prefix}_{self.timestamp}{ext}"

    def _get_processed_filename(self, original_path: Path, prefix="processed"):
        """Generate processed image filename"""
        return f"{prefix}_{original_path.stem}_{self.timestamp}{original_path.suffix}"

    def _update_progress(self, progress_text: str) -> None:
        if self.on_status:
            """Handle progress updates"""
            self.on_status(progress_text)
            self.on_status(progress_text)

    def _default_progress_callback(self, operation: str, progress: int):
        """Default progress callback if none is provided."""
        self.logger.info(f"{operation}: {progress}%")

    def _default_status_callback(self, status: str):
        """Default status callback if none is provided."""
        self.logger.info(status)