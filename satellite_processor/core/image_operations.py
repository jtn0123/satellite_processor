# satellite_processor/satellite_processor/core/image_operations.py
import cv2 # type: ignore
import numpy as np # type: ignore
from pathlib import Path
from datetime import datetime
import re
import subprocess
from typing import Optional
from .base_processor import BaseImageProcessor
import logging
from .utils import parse_satellite_timestamp

class ImageOperations:
    """Static methods for image processing"""
    
    @staticmethod
    def crop_image(img, x, y, width, height):
        """Crop the image to the specified rectangle."""
        return img[y:y+height, x:x+width]
        
    @staticmethod
    def apply_false_color(img, temp_dir: Path, image_stem: str, sanchez_path: Path, underlay_path: Path) -> Optional[np.ndarray]:
        """Apply false color to the image using external Sanchez tool."""
        try:
            output_file = temp_dir / f"false_color_{image_stem}.jpg"
            cmd = [
                str(sanchez_path),
                '-s', str(img),
                '-u', str(underlay_path),
                '-o', str(output_file),
                '-falsecolor',
                '-format', 'jpg'
            ]
            subprocess.run(cmd, check=True)
            false_color_img = cv2.imread(str(output_file))
            return false_color_img
        except Exception as e:
            print(f"Failed to apply false color: {e}")
            return img  # Return original if failed

    @staticmethod
    def add_timestamp(img: np.ndarray, image_path: Path) -> np.ndarray:
        """Add a timestamp overlay to the image."""
        try:
            # Use shared utility function
            timestamp = parse_satellite_timestamp(image_path.name)
            if timestamp is None:
                timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            else:
                timestamp_str = timestamp.strftime("%Y-%m-%d %H:%M:%S")
            
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 1
            color = (255, 255, 255)
            thickness = 2
            position = (10, img.shape[0] - 10)
            
            cv2.putText(img, timestamp_str, position, font, font_scale, color, thickness, cv2.LINE_AA)
            return img
        except Exception as e:
            print(f"Failed to add timestamp: {e}")
            return img

    @staticmethod
    def _extract_timestamp(filename: str) -> Optional[datetime]:
        """Extract timestamp from filename"""
        try:
            match = re.search(r'(\d{8}T\d{6}Z)', filename)
            if match:
                return datetime.strptime(match.group(1), "%Y%m%dT%H%M%SZ")
            return None
        except Exception as e:
            raise ValueError(f"Timestamp extraction failed: {str(e)}")

    @staticmethod
    def process_image(img, options):
        # Configure logging for this module
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.INFO)  # Default to INFO level
        
        # Only log if explicitly needed
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug("Processing image with options: %s", options)
            
        if options.get('crop_enabled'):
            img = ImageOperations.crop_image(
                img, 
                options['crop_x'],
                options['crop_y'], 
                options['crop_width'],
                options['crop_height']
            )
            
        if options.get('upscale_enabled'):
            img = ImageOperations.upscale_image(
                img,
                method=options.get('upscale_type', 'lanczos'),
                scale=options.get('scale_factor', 2.0)
            )
            
        return img

class ImageProcessor(BaseImageProcessor):
    """Handles specific image processing operations for satellite images."""
    
    def __init__(self, options: dict = None):
        super().__init__()
        self.options = options or {}
        self.logger = logging.getLogger(__name__)
    
    def crop_image(self, img: np.ndarray, x: int, y: int, width: int, height: int) -> np.ndarray:
        """Crops the image to the specified dimensions."""
        self.logger.debug(f"Cropping image: x={x}, y={y}, width={width}, height={height}")
        return img[y:y+height, x:x+width]
    
    def apply_false_color(self, img: np.ndarray, colormap: int = cv2.COLORMAP_JET) -> np.ndarray:
        """Applies a false color map to the image."""
        self.logger.debug(f"Applying false color map: {colormap}")
        return cv2.applyColorMap(img, colormap)
    
    def add_timestamp(self, img: np.ndarray, timestamp: str) -> np.ndarray:
        """Adds a timestamp overlay to the image."""
        self.logger.debug(f"Adding timestamp: {timestamp}")
        font = cv2.FONT_HERSHEY_SIMPLEX
        cv2.putText(img, timestamp, (10, img.shape[0] - 10), font, 1, (255, 255, 255), 2, cv2.LINE_AA)
        return img