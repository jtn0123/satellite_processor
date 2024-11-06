# satellite_processor/satellite_processor/core/image_operations.py
import cv2 # type: ignore
import numpy as np # type: ignore
from pathlib import Path
from datetime import datetime
import re
import subprocess
from typing import Optional

class ImageOperations:
    """Static methods for image processing"""
    
    @staticmethod
    def crop_image(img, x, y, width, height):
        pass
        
    @staticmethod
    def upscale_image(img, method='lanczos', scale=2.0):
        pass
        
    @staticmethod
    def apply_false_color(img, temp_dir, sanchez_path):
        pass

    @staticmethod
    def add_timestamp(img: np.ndarray, image_path: Path) -> np.ndarray:
        """Add timestamp overlay to image"""
        try:
            timestamp = ImageOperations._extract_timestamp(image_path.name)
            if timestamp:
                height, width = img.shape[:2]
                timestamp_text = timestamp.strftime("%b %d %Y, Time %H%M Z")
                
                # Calculate position
                font = cv2.FONT_HERSHEY_SIMPLEX
                font_scale = 1
                thickness = 2
                text_size = cv2.getTextSize(timestamp_text, font, font_scale, thickness)[0]
                text_x = width - text_size[0] - 10
                text_y = height - 10

                # Add black outline
                cv2.putText(img, timestamp_text, (text_x, text_y), font,
                           font_scale, (0, 0, 0), thickness + 1, cv2.LINE_AA)
                # Add white text
                cv2.putText(img, timestamp_text, (text_x, text_y), font,
                           font_scale, (255, 255, 255), thickness, cv2.LINE_AA)

            return img
        except Exception as e:
            raise ValueError(f"Timestamp overlay failed: {str(e)}")

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
        """Centralized image processing"""
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