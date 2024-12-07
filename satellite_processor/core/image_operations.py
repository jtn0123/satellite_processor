# satellite_processor/satellite_processor/core/image_operations.py
import cv2 # type: ignore
import numpy as np # type: ignore
from pathlib import Path
from datetime import datetime
import re
import subprocess
from typing import Optional, List, Union
import concurrent.futures
from concurrent.futures import ProcessPoolExecutor  # Change this import
import multiprocessing
from multiprocessing import shared_memory
from functools import partial
import logging
from .utils import parse_satellite_timestamp
from ..utils.helpers import parse_satellite_timestamp
import shutil
import tempfile
import os

# Add logger initialization at the top of the file
logger = logging.getLogger(__name__)

"""
Image Processing Operations
-------------------------
Responsibilities:
- Image processing and enhancement
- Batch processing optimization
- Image format conversions
- Adding timestamp overlays

Does NOT handle:
- File operations (see file_manager.py)
- Timestamp parsing (use helpers.py)
- Configuration management
"""

class ImageOperations:
    """Static methods for image processing"""
    
    @staticmethod
    def crop_image(img, x, y, width, height):
        """Crop the image to the specified rectangle."""
        return img[y:y+height, x:x+width]
        
    @staticmethod
    def apply_false_color(input_path: str, output_path: str, sanchez_path: str, underlay_path: str, method: str = "Standard") -> bool:
        """Apply false color using Sanchez"""
        temp_dir = None
        try:
            # Verify input files
            sanchez_exe = Path(sanchez_path)
            sanchez_dir = sanchez_exe.parent
            resources_dir = sanchez_dir / "Resources"
            
            if not sanchez_exe.exists():
                logger.error(f"Sanchez.exe not found at {sanchez_path}")
                return False
            if not Path(underlay_path).exists():
                logger.error(f"Underlay image not found at {underlay_path}")
                return False
            if not Path(input_path).exists():
                logger.error(f"Input image not found at {input_path}")
                return False
                
            # Create output directory
            output_dir = Path(output_path)
            output_dir.mkdir(parents=True, exist_ok=True)
            output_file = output_dir / f"{Path(input_path).stem}_sanchez.jpg"
            
            # Run Sanchez from its original directory to maintain resource paths
            cmd = [
                str(sanchez_exe),
                "-s", str(Path(input_path).absolute()),
                "-u", str(Path(underlay_path).absolute()),
                "-o", str(output_file.absolute()),
                "-F", "jpg",
                "-q",
                "-falsecolor"
            ]
            
            logger.info("Running Sanchez with paths:")
            logger.info(f"Working dir: {sanchez_dir}")
            logger.info(f"Command: {' '.join(cmd)}")
            
            # Run Sanchez from its directory
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                shell=False,
                cwd=str(sanchez_dir)  # Run from Sanchez directory
            )

            if result.returncode != 0:
                logger.error(f"Sanchez error: {result.stderr}")
                return False

            # Verify output was created
            if output_file.exists():
                logger.info(f"Successfully created: {output_file}")
                return True

            logger.error(f"Output file not created: {output_file}")
            return False

        except Exception as e:
            logger.error(f"Error in apply_false_color: {str(e)}")
            return False

        finally:
            # Clean up temp directory
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception as e:
                    logger.error(f"Error cleaning up temp directory: {e}")

    @staticmethod
    def add_timestamp(img: np.ndarray, source: Union[datetime, Path, str]) -> np.ndarray:
        """Add a timestamp overlay to the image"""
        logger = logging.getLogger(__name__)
        try:
            logger.debug(f"Starting timestamp addition for: {source}")
            
            # Verify input image
            if img is None or not isinstance(img, np.ndarray):
                logger.error("Invalid input image")
                return img

            logger.info(f"Adding timestamp to image from source: {source}")
            
            # Get timestamp from various input types
            if isinstance(source, datetime):
                timestamp = source
            elif isinstance(source, (Path, str)):
                filename = source if isinstance(source, str) else source.name
                timestamp = parse_satellite_timestamp(filename)
                if timestamp == datetime.min:
                    logger.error(f"No valid timestamp found in: {filename}")
                    return img
            else:
                logger.error(f"Invalid source type for timestamp: {type(source)}")
                return img

            # Format timestamp string
            timestamp_str = timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")
            logger.debug(f"Using timestamp string: {timestamp_str}")
            
            # Create a copy of the image to avoid modifying original
            img_copy = img.copy()
            
            # Setup text parameters
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 1.0
            color = (255, 255, 255)  # White text
            thickness = 2
            padding = 10
            
            # Calculate text size and position
            text_size = cv2.getTextSize(timestamp_str, font, font_scale, thickness)[0]
            text_x = padding
            text_y = img_copy.shape[0] - padding  # Bottom-left position
            
            # Add black background for better visibility
            cv2.rectangle(
                img_copy,
                (text_x - 2, text_y + 2),
                (text_x + text_size[0] + 2, text_y - text_size[1] - 2),
                (0, 0, 0),
                -1
            )
            
            # Add text
            cv2.putText(
                img_copy,
                timestamp_str,
                (text_x, text_y),
                font,
                font_scale,
                color,
                thickness,
                cv2.LINE_AA
            )
            
            logger.debug(f"Successfully added timestamp to image")
            return img_copy
            
        except Exception as e:
            logger.error(f"Failed to add timestamp: {e}")
            return img

    @staticmethod
    def _extract_timestamp(filename: str) -> Optional[datetime]:
        """Extract timestamp from filename"""
        return parse_satellite_timestamp(filename)  # Use helper function instead

    @staticmethod
    def process_image(img, options):
        """Process image with validation"""
        logger = logging.getLogger(__name__)
        
        try:
            if img is None or not isinstance(img, np.ndarray) or img.size == 0:
                logger.error("Invalid input image")
                return None

            # Deep copy to prevent modifications to original
            img = img.copy()

            if options.get('crop_enabled'):
                img = ImageOperations.crop_image(
                    img, 
                    options['crop_x'],
                    options['crop_y'], 
                    options['crop_width'],
                    options['crop_height']
                )
                
                # Validate crop result
                if img is None or img.size == 0:
                    logger.error("Cropping resulted in invalid image")
                    return None

            # Remove upscale section
                
            return img

        except Exception as e:
            logger.error(f"Image processing failed: {str(e)}")
            return None

    @staticmethod
    def process_image_batch(images: List[Path], options: dict) -> List[np.ndarray]:
        """Process images using real multiprocessing with parallel Sanchez"""
        if not images:
            return []

        logger.info(f"Starting batch processing with {len(images)} images")
        num_processes = max(1, multiprocessing.cpu_count() - 1)  # Leave one core free
        chunk_size = max(1, len(images) // num_processes)
        
        with multiprocessing.Pool(processes=num_processes, initializer=ImageOperations._init_worker) as pool:
            try:
                # Process images in parallel
                results = []
                total = len(images)
                
                # Create processing args
                process_args = [(img, options) for img in images]
                
                # Use imap_unordered for better performance
                for idx, result in enumerate(pool.imap_unordered(
                    ImageOperations._parallel_process_image,
                    process_args,
                    chunksize=chunk_size
                )):
                    if result is not None:
                        results.append(result)
                    logger.debug(f"Processed {idx + 1}/{total} images")

                logger.info(f"Successfully processed {len(results)}/{total} images")
                return results

            finally:
                pool.close()
                pool.join()

    @staticmethod
    def _parallel_process_image(args) -> Optional[np.ndarray]:
        """Process a single image with Sanchez in parallel worker"""
        image_path, options = args
        try:
            logger.debug(f"Processing {image_path} in worker process")
            
            # Read image
            img = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
            if img is None:
                logger.error(f"Failed to read image: {image_path}")
                return None

            # Apply false color if enabled
            if options.get('false_color_enabled'):
                logger.debug(f"Applying false color to {image_path}")
                
                # Get Sanchez paths from options
                sanchez_path = options.get('sanchez_path')
                underlay_path = options.get('underlay_path')
                output_dir = Path(options.get('temp_dir')) / "sanchez_output"
                output_dir.mkdir(parents=True, exist_ok=True)
                
                # Apply false color
                success = ImageOperations.apply_false_color(
                    str(image_path),
                    str(output_dir),
                    sanchez_path,
                    underlay_path
                )
                
                if success:
                    output_path = output_dir / f"{Path(image_path).stem}_sanchez.jpg"
                    img = cv2.imread(str(output_path))
                    if img is None:
                        logger.error(f"Failed to read Sanchez output: {output_path}")
                        return None
                else:
                    logger.error(f"Sanchez processing failed for: {image_path}")
                    return None

            # Apply other processing steps
            if options.get('crop_enabled'):
                img = ImageOperations.crop_image(
                    img,
                    options.get('crop_x', 0),
                    options.get('crop_y', 0),
                    options.get('crop_width', img.shape[1]),
                    options.get('crop_height', img.shape[0])
                )

            if options.get('add_timestamp', True):
                img = ImageOperations.add_timestamp(img, Path(image_path))

            return img

        except Exception as e:
            logger.error(f"Error processing {image_path}: {e}")
            return None

    @staticmethod
    def _init_worker():
        """Initialize worker process"""
        # Set process priority higher
        try:
            import psutil
            process = psutil.Process()
            process.nice(psutil.ABOVE_NORMAL_PRIORITY_CLASS)
        except:
            pass

    @staticmethod
    def _process_image_subprocess(image_path: str, options: dict) -> Optional[np.ndarray]:
        """Process a single image with proper dimension handling"""
        try:
            print(f"Processing {image_path} on process {multiprocessing.current_process().name}")
            
            # Read image in color mode explicitly
            img = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
            if img is None:
                print(f"Failed to read image: {image_path}")
                return None

            # Ensure image is in BGR format with 3 channels
            if len(img.shape) != 3 or img.shape[2] != 3:
                print(f"Converting image format for {image_path}")
                img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

            # Process image
            if options.get('crop_enabled'):
                img = ImageOperations.crop_image(
                    img,
                    options.get('crop_x', 0),
                    options.get('crop_y', 0),
                    options.get('crop_width', img.shape[1]),
                    options.get('crop_height', img.shape[0])
                )

            if options.get('add_timestamp', True):
                img = ImageOperations.add_timestamp(img, Path(image_path))

            # Apply Sanchez false color if enabled
            if options.get('false_color_enabled'):
                logging.info(f"Processing false color for: {image_path}")
                
                sanchez_path = Path(options.get('sanchez_path'))
                underlay_path = Path(options.get('underlay_path'))
                temp_dir = Path(options.get('temp_dir'))
                
                # Ensure directories exist
                temp_dir.mkdir(parents=True, exist_ok=True)
                
                false_color_path = ImageOperations.apply_false_color(
                    str(image_path),
                    temp_dir,
                    sanchez_path,
                    underlay_path
                )
                
                if false_color_path is None:
                    raise ValueError("Failed to apply false color")
                    
                # Read the false color result
                img = cv2.imread(str(false_color_path))
                if img is None:
                    raise ValueError("Failed to read false color output")
                    
                logging.info(f"Successfully applied false color to: {image_path}")

            # Final dimension check
            if img is None or len(img.shape) != 3 or img.shape[2] != 3:
                print(f"Invalid image dimensions after processing: {image_path}")
                return None

            return img

        except Exception as e:
            print(f"Error processing {image_path}: {e}")
            return None

    @staticmethod
    def process_image_subprocess(image_path: str, options: dict) -> Optional[np.ndarray]:
        logger = logging.getLogger(__name__)
        try:
            logger.debug(f"Processing {image_path} with options: {options}")
            
            img = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
            if img is None:
                logger.error(f"Failed to read image: {image_path}")
                return None

            # Apply Sanchez false color if enabled
            if options.get('false_color_enabled'):
                logger.debug("Applying false color with Sanchez")
                logger.debug(f"Sanchez path: {options.get('sanchez_path')}")
                logger.debug(f"Underlay path: {options.get('underlay_path')}")
                img = ImageOperations.apply_false_color(
                    img,
                    options['temp_dir'],
                    Path(image_path).stem,
                    options['sanchez_path'],
                    options['underlay_path']
                )
                if img is None:
                    logger.error("False color application failed")
                    return None

            # Apply interpolation if enabled
            if options.get('interpolation_enabled'):
                logger.debug(f"Applying interpolation: {options.get('interpolation_method')}")
                logger.debug(f"Interpolation factor: {options.get('interpolation_factor')}")
                try:
                    if options['interpolation_method'] == 'Linear':
                        img = cv2.resize(img, None, 
                            fx=options['interpolation_factor'],
                            fy=options['interpolation_factor'],
                            interpolation=cv2.INTER_LINEAR)
                    elif options['interpolation_method'] == 'Cubic':
                        img = cv2.resize(img, None,
                            fx=options['interpolation_factor'],
                            fy=options['interpolation_factor'],
                            interpolation=cv2.INTER_CUBIC)
                    # Add debug logging for AI methods
                    elif options['interpolation_method'] in ['RIFE', 'DAIN']:
                        logger.debug(f"Using AI interpolation: {options['interpolation_method']}")
                        # Implementation for AI methods
                except Exception as e:
                    logger.error(f"Interpolation failed: {e}")
                    return None

            # ...rest of processing...
            return img

        except Exception as e:
            logger.error(f"Error processing {image_path}: {e}")
            return None

    @staticmethod
    def process_single(image_path: Path, options: dict) -> Optional[np.ndarray]:
        """Process a single image - simplified"""
        try:
            # Load image
            img = cv2.imread(str(image_path))
            if img is None:
                return None

            # Make a copy to avoid modifying original
            img = img.copy()

            # Apply processing options
            if options.get('crop_enabled'):
                img = ImageOperations.crop_image(
                    img,
                    options.get('crop_x', 0),
                    options.get('crop_y', 0),
                    options.get('crop_width', img.shape[1]),
                    options.get('crop_height', img.shape[0])
                )

            return img

        except Exception:
            return None

    @staticmethod
    def process_image(img_path: str, options: dict) -> Optional[np.ndarray]:
        """Process image with interpolation support"""
        try:
            img = cv2.imread(img_path)
            if img is None:
                return None

            if options.get('interpolation_enabled'):
                factor = options.get('interpolation_factor', 2)
                method = options.get('interpolation_method', 'Linear')
                
                interpolated_frames = []
                # Assume we have previous and next frames for interpolation
                frame1 = img  # Current frame
                frame2 = img  # Next frame (placeholder)
                
                interpolated_frames = ImageOperations.interpolate_frames(frame1, frame2, factor, method)
                # Integrate interpolated frames into the video stream
                # This is a placeholder for actual integration logic
                
            return img
        except Exception as e:
            logger.error(f"Error processing image: {e}")
            return None

    @staticmethod
    def interpolate_frames(frame1: np.ndarray, frame2: np.ndarray, factor: int = 2, method: str = 'Linear') -> List[np.ndarray]:
        """Generate interpolated frames between two frames with chosen method"""
        try:
            frames = []
            # Convert to float32 for better precision
            f1 = frame1.astype(np.float32)
            f2 = frame2.astype(np.float32)
            
            for i in range(1, factor):
                alpha = i / factor
                if method == 'Linear':
                    interpolated = cv2.addWeighted(f1, 1.0 - alpha, f2, alpha, 0.0)
                elif method == 'Cubic':
                    interpolated = cv2.resize(
                        f1 + (f2 - f1) * alpha,
                        None,
                        fx=1,
                        fy=1,
                        interpolation=cv2.INTER_CUBIC
                    )
                # Add more methods if needed
                frames.append(interpolated.astype(np.uint8))
            
            return frames
        except Exception as e:
            logger.error(f"Error interpolating frames: {e}")
            return []

    def process_images(self, image_paths, options):
        """Process multiple images with the given options."""
        processed = []
        for path in image_paths:
            result = self.process_image(path, options)
            if result is not None:
                processed.append(result)
        return processed

    def interpolate_frames(self, frame_paths, options):
        """Interpolate frames based on options."""
        frames = []
        for path in frame_paths:
            frames.append(self.process_image(path, options))
        return frames

class Interpolator:
    """Handle frame interpolation."""
    def __init__(self, model_path, processing_speed):
        self.model_path = model_path
        self.processing_speed = processing_speed

    # ...rest of implementation...

# ...existing code...