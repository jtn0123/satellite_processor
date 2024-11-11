"""
File System Operations Manager
----------------------------
Single source of truth for all file operations:
- File discovery and sorting
- Directory creation and cleanup
- Temporary file management
- Path resolution and validation
- File ordering by timestamp
- Input/output path management

Key Responsibilities:
- Maintain chronological file ordering
- Handle all temporary storage
- Manage file cleanup
- Ensure path security
- Track file operations

Does NOT handle:
- Image processing/manipulation
- Video encoding
- Business logic
- GUI operations
"""

from pathlib import Path
import logging
import shutil
from typing import List
from datetime import datetime
from ..utils.helpers import parse_satellite_timestamp
import os
import tempfile

logger = logging.getLogger(__name__)

class FileManager:
    """Handle file and directory operations including temporary storage"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self._temp_dirs = set()
        self._temp_files = set()
        
    def get_input_files(self, input_dir: str) -> List[Path]:
        """Get chronologically sorted list of input image files"""
        if not input_dir:
            self.logger.error("Input directory is None or empty")
            return []

        try:
            input_path = Path(input_dir)
            if not input_path.exists():
                self.logger.error(f"Input directory does not exist: {input_dir}")
                return []
                
            valid_extensions = ('.jpg', '.jpeg', '.png', '.tif', '.tiff')
            image_paths = [p for p in input_path.glob('*') if p.suffix.lower() in valid_extensions]
            
            # Sort files chronologically
            sorted_paths = sorted(image_paths, key=lambda p: parse_satellite_timestamp(p.name))
            
            # Log the actual order being used
            self.logger.info(f"Processing {len(sorted_paths)} files in chronological order:")
            for path in sorted_paths[:5]:  # Log first 5 files
                timestamp = parse_satellite_timestamp(path.name)
                self.logger.info(f"{path.name}: {timestamp}")
                
            return sorted_paths
        except Exception as e:
            self.logger.error(f"Error accessing input directory: {e}")
            return []
        
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
        return parse_satellite_timestamp(filename)  # Use helper function instead

    def get_output_path(self, output_dir) -> Path:
        """Generate output video path"""
        if not output_dir:
            raise ValueError("Output directory cannot be None")
            
        try:
            output_path = Path(output_dir)
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            return output_path / f"Animation_{timestamp}.mp4"
        except Exception as e:
            self.logger.error(f"Failed to create output path: {e}")
            raise

    def ensure_directory(self, path: str) -> Path:
        """Ensure directory exists and return Path object"""
        if not path:
            raise ValueError("Directory path cannot be None or empty")
            
        try:
            dir_path = Path(path)
            dir_path.mkdir(parents=True, exist_ok=True)
            return dir_path
        except Exception as e:
            self.logger.error(f"Failed to ensure directory exists: {e}")
            raise

    def get_processed_filename(self, original_path: Path, timestamp: str) -> str:
        """Generate processed image filename"""
        return f"processed_{original_path.stem}_{timestamp}{original_path.suffix}"

    def create_temp_dir(self, base_dir: Path = None, prefix: str = "temp") -> Path:
        """Create a secure temporary directory"""
        try:
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            if base_dir:
                temp_dir = base_dir / f"{prefix}_{timestamp}"
            else:
                temp_dir = Path(tempfile.mkdtemp(prefix=f"{prefix}_{timestamp}_"))
            
            temp_dir.mkdir(parents=True, exist_ok=True)
            os.chmod(temp_dir, 0o700)  # Secure permissions
            
            self._temp_dirs.add(temp_dir)
            self.logger.debug(f"Created temporary directory: {temp_dir}")
            return temp_dir
            
        except Exception as e:
            self.logger.error(f"Failed to create temp directory: {e}")
            raise

    def cleanup(self):
        """Clean up all temporary files and directories"""
        for path in self._temp_files:
            try:
                path.unlink(missing_ok=True)
                self.logger.debug(f"Removed temporary file: {path}")
            except Exception as e:
                self.logger.error(f"Error removing temp file {path}: {e}")
                
        for path in self._temp_dirs:
            try:
                shutil.rmtree(path, ignore_errors=True)
                self.logger.debug(f"Removed temporary directory: {path}")
            except Exception as e:
                self.logger.error(f"Error removing temp directory {path}: {e}")
                
        self._temp_files.clear()
        self._temp_dirs.clear()

    def track_temp_file(self, file_path: Path):
        """Add a file to be tracked for cleanup"""
        self._temp_files.add(Path(file_path))

    def track_temp_dir(self, dir_path: Path):
        """Add a directory to be tracked for cleanup"""
        self._temp_dirs.add(Path(dir_path))

    def keep_file_order(self, files: List[Path]) -> List[Path]:
        """Maintain chronological order of files"""
        return sorted(files, key=lambda p: parse_satellite_timestamp(p.name))

    def create_frame_filename(self, index: int, timestamp: str = None) -> str:
        """Create standardized frame filename"""
        if timestamp is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        return f"frame_{index:08d}_{timestamp}.png"

    def get_sequential_path(self, base_dir: Path, prefix: str, ext: str) -> Path:
        """Get sequential path for output files"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return base_dir / f"{prefix}_{timestamp}{ext}"

    def __del__(self):
        """Ensure cleanup on deletion"""
        try:
            self.cleanup()
        except Exception as e:
            self.logger.error(f"Error during cleanup in destructor: {e}")