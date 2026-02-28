"""File storage management"""

import logging
from pathlib import Path

from ..config import settings

logger = logging.getLogger(__name__)


class StorageService:
    """Manage file storage for uploads and outputs"""

    def __init__(self):
        self.upload_dir = Path(settings.upload_dir)
        self.output_dir = Path(settings.output_dir)
        self.temp_dir = Path(settings.temp_dir)

    def get_upload_path(self, filename: str) -> Path:
        logger.debug("Resolving upload path for filename=%s", filename)
        return self.upload_dir / filename

    def delete_file(self, file_path: str) -> bool:
        """Delete a file"""
        path = Path(file_path)
        if path.exists():
            path.unlink()
            logger.info("Deleted file: %s", file_path)
            return True
        logger.warning("File not found for deletion: %s", file_path)
        return False

    def get_job_output_dir(self, job_id: str) -> Path:
        """Get/create output directory for a job"""
        job_dir = self.output_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        logger.debug("Job output directory ready: job_id=%s", job_id)
        return job_dir


storage_service = StorageService()
