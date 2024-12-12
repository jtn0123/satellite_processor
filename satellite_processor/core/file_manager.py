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
import re  # Add this import

logger = logging.getLogger(__name__)

class FileManager:
    """Handle file and directory operations including temporary storage"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self._temp_dirs = set()
        self._temp_files = set()
        
    def get_input_files(self, input_dir: str = None) -> List[Path]:
        """Get ordered input files with improved UNC and case handling"""
        try:
            dir_to_use = Path(input_dir) if input_dir else Path(self.default_input_dir)
            dir_to_use = dir_to_use.resolve()
            self.logger.info(f"Searching for frame files in {dir_to_use}")

            # Handle UNC paths
            str_path = str(dir_to_use)
            if str_path.startswith('\\\\'):
                str_path = '//' + str_path[2:]
                dir_to_use = Path(str_path)

            # Case-insensitive glob patterns
            patterns = ['*.png', '*.PNG', '*.jpg', '*.JPG', '*.jpeg', '*.JPEG']
            frame_files = set()  # Use set to avoid duplicates
            
            for pattern in patterns:
                frame_files.update(dir_to_use.glob(pattern))

            if not frame_files:
                self.logger.error(f"No frame files found in {dir_to_use}")
                return []

            frame_list = list(frame_files)  # Convert set back to list

            # Sort numerically by frame number
            def get_frame_number(path):
                match = re.search(r'frame(\d+)', path.stem.lower())  # Case-insensitive match
                return int(match.group(1)) if match else float('inf')

            frame_list.sort(key=get_frame_number)
            
            self.logger.info(f"Found {len(frame_list)} frame files")
            return frame_list

        except Exception as e:
            self.logger.error(f"Error getting input files: {e}")
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
        """Ensure files stay in chronological order"""
        self.logger.info(f"Sorting {len(files)} files chronologically")
        
        # Verify input files
        valid_files = []
        for f in files:
            if f.exists():
                valid_files.append(f)
            else:
                self.logger.error(f"Missing file during sorting: {f}")
        
        if len(valid_files) != len(files):
            self.logger.warning(f"Found {len(valid_files)}/{len(files)} valid files")
        
        # Sort files by timestamp in filename
        sorted_files = sorted(valid_files, key=lambda x: parse_satellite_timestamp(x.name))
        
        self.logger.info(f"Completed sorting {len(sorted_files)} files")
        return sorted_files

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