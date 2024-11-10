from pathlib import Path
import logging
import shutil
from typing import List
from datetime import datetime
import re
from .utils import parse_satellite_timestamp

logger = logging.getLogger(__name__)

class FileManager:
    """Handle file operations and path management"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        
    def get_input_files(self, input_dir: str) -> List[Path]:
        """Get sorted list of input image files"""
        valid_extensions = ('.jpg', '.jpeg', '.png', '.tif', '.tiff')
        image_paths = sorted(Path(input_dir).glob('*'))
        return [p for p in image_paths if p.suffix.lower() in valid_extensions]
        
    def create_temp_directory(self, base_dir: Path, prefix: str = "temp") -> Path:
        """Create and manage temporary directories"""
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        temp_dir = base_dir / f"{prefix}_{timestamp}"
        temp_dir.mkdir(parents=True, exist_ok=True)
        self.logger.info(f"Created temporary directory: {temp_dir}")
        return temp_dir
        
    def cleanup_temp_directory(self, temp_dir: Path) -> None:
        """Clean up temporary directory"""
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
        
    def parse_satellite_timestamp(self, filename: str) -> datetime:
        """Parse timestamp from satellite image filename"""
        self.logger.debug(f"Parsing timestamp from filename: {filename}")
        return parse_satellite_timestamp(filename)

    def get_output_path(self, output_dir):
        """Generate output video path"""
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        return Path(output_dir) / f"Animation_{timestamp}.mp4"