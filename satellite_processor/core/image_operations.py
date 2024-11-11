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
    def apply_false_color(img_path: str, temp_dir: Path, image_stem: str, sanchez_path: Path, underlay_path: Path) -> Optional[Path]:
        """Apply false color to the image using Sanchez."""
        try:
            output_file = temp_dir / f"false_color_{image_stem}.jpg"
            
            # Remove any existing output file
            if output_file.exists():
                output_file.unlink()

            # Convert paths to strings without quotes - let subprocess handle escaping
            cmd = [
                str(sanchez_path),
                '-s', str(img_path),
                '-o', str(output_file),
                '-u', str(underlay_path),
                '-F', 'jpg',  # Use -F instead of -format
                '--force',    # Use long form to avoid duplicate -f
                '-v'         # Verbose output
            ]

            logging.info(f"Running Sanchez command: {' '.join(cmd)}")

            # Run process with explicit working directory
            process = subprocess.run(
                cmd,
                cwd=str(temp_dir),
                capture_output=True,
                text=True,
                shell=False
            )

            # Log full output for debugging
            if process.stdout:
                logging.debug(f"Sanchez stdout: {process.stdout}")
            if process.stderr:
                logging.error(f"Sanchez stderr: {process.stderr}")

            if process.returncode != 0:
                logging.error(f"Sanchez failed with return code: {process.returncode}")
                return None

            # Verify output file was created
            if not output_file.exists():
                logging.error("Sanchez did not create output file")
                return None

            return output_file

        except Exception as e:
            logging.error(f"Failed to apply false color: {e}")
            return None

    @staticmethod
    def add_timestamp(img: np.ndarray, source: Union[datetime, Path, str]) -> np.ndarray:
        """Add a timestamp overlay to the image"""
        try:
            # Get timestamp from various input types
            if isinstance(source, datetime):
                timestamp = source
            elif isinstance(source, (Path, str)):
                filename = source if isinstance(source, str) else source.name
                timestamp = parse_satellite_timestamp(filename)
                if timestamp == datetime.min:
                    logging.debug(f"No valid timestamp found in: {filename}")
                    return img
            else:
                logging.warning(f"Invalid source type for timestamp: {type(source)}")
                return img

            # Format timestamp string
            timestamp_str = timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")
            
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
            
            return img_copy
            
        except Exception as e:
            logging.error(f"Failed to add timestamp: {e}")
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

            if options.get('upscale_enabled'):
                img = ImageOperations.upscale_image(
                    img,
                    method=options.get('upscale_type', 'lanczos'),
                    scale=options.get('scale_factor', 2.0)
                )
                
            return img

        except Exception as e:
            logger.error(f"Image processing failed: {str(e)}")
            return None

    @staticmethod
    def process_image_batch(images: List[Path], options: dict) -> List[np.ndarray]:
        """Process images using real multiprocessing"""
        if not images:
            return []

        print(f"Starting batch processing with {len(images)} images")
        num_processes = multiprocessing.cpu_count()
        chunk_size = max(1, len(images) // num_processes)
        
        with multiprocessing.Pool(processes=num_processes) as pool:
            try:
                results = pool.imap_unordered(
                    partial(ImageOperations._process_image_subprocess, options=options),
                    images,
                    chunksize=chunk_size
                )
                
                processed_images = []
                for img in results:
                    if img is not None and isinstance(img, np.ndarray) and len(img.shape) == 3:
                        processed_images.append(img)
                
                print(f"Successfully processed {len(processed_images)} images")
                return processed_images
                
            finally:
                pool.close()
                pool.join()

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
                    Path(image_path).stem,
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