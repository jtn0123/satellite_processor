# satellite_processor/satellite_processor/core/base_processor.py
import cv2 # type: ignore
import numpy as np # type: ignore
from pathlib import Path
import logging
from typing import Optional, Dict, Any, List, Tuple
import tempfile
import os

class BaseImageProcessor:
    """Base class for image processing operations"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.preferences = {}
        self._proc = None
        self._temp_files = []
        self.cancelled = False
        
        # Callbacks
        self.on_progress = None
        self.on_status = None
        self.on_overall_progress = None
        
        # Check for CUDA support
        self.has_cuda = cv2.cuda.getCudaEnabledDeviceCount() > 0
        if self.has_cuda:
            self.logger.info("CUDA support enabled")
            
    def _load_image(self, image_path: Path) -> Optional[np.ndarray]:
        """Load image with CUDA support if available"""
        try:
            img = cv2.imread(str(image_path))
            if img is None:
                raise ValueError(f"Failed to load image: {image_path}")
                
            if self.has_cuda:
                gpu_mat = cv2.cuda_GpuMat()
                gpu_mat.upload(img)
                return gpu_mat.download()
            return img
            
        except Exception as e:
            self.logger.error(f"Error loading image {image_path}: {str(e)}")
            return None
            
    def create_temp_directory(self) -> Path:
        """Create a secure temporary directory with appropriate permissions"""
        try:
            # Create temp directory in user's temp location
            temp_dir = Path(tempfile.mkdtemp(prefix='satellite_processor_'))
            
            # Ensure directory has correct permissions
            os.chmod(temp_dir, 0o700)  # User read/write/execute only
            
            self.logger.info(f"Created temporary directory: {temp_dir}")
            return temp_dir
            
        except Exception as e:
            self.logger.error(f"Failed to create temporary directory: {e}")
            raise
            
    def cleanup_temp_directory(self, temp_dir: Path):
        """Clean up temporary directory and its contents"""
        if temp_dir and temp_dir.exists():
            try:
                for file in temp_dir.glob("*"):
                    try:
                        file.unlink(missing_ok=True)
                    except Exception as e:
                        self.logger.error(f"Error removing temp file {file}: {e}")
                        
                temp_dir.rmdir()
                self.logger.debug(f"Cleaned up temporary directory: {temp_dir}")
            except Exception as e:
                self.logger.error(f"Error cleaning up temp directory: {str(e)}")
                
    # In base_processor.py

    def validate_preferences(self) -> Tuple[bool, str]:
        """Validate processor preferences"""
        try:
            required = ['temp_directory', 'sanchez_path', 'underlay_path']
            for key in required:
                if key not in self.preferences:
                    return False, f"Missing required preference: {key}"
            return True, ""
        except Exception as e:
            return False, str(e)

    def create_video(self, images, output_path, fps=30, scale_factor=1):
        """Base video creation - move duplicate code here"""
        try:
            if not images:
                raise ValueError("No images to process")

            first_img = images[0]
            height, width = first_img.shape[:2]
            scaled_size = (int(width * scale_factor), int(height * scale_factor))
            
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(str(output_path), fourcc, fps, scaled_size)

            total_frames = len(images)
            for idx, img in enumerate(images, start=1):
                if self.cancelled:
                    self.logger.info("Video creation cancelled.")
                    break
                    
                if scale_factor != 1:
                    img = cv2.resize(img, scaled_size)
                out.write(img)
                
                if self.on_progress:
                    progress = int((idx / total_frames) * 100)
                    self.on_progress("Creating Video", progress)

            out.release()
            return True

        except Exception as e:
            self.logger.error(f"Video creation failed: {str(e)}")
            return False