from pathlib import Path
import tempfile
import shutil
import logging
from datetime import datetime
import os

logger = logging.getLogger(__name__)

class TempManager:
    """Manages temporary files and directories"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self._temp_dirs = set()
        self._temp_files = set()
        
    def create_temp_dir(self, base_dir: Path = None, prefix: str = "temp") -> Path:
        """Create a secure temporary directory"""
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