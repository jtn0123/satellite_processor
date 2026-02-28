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

    @staticmethod
    def _is_within(path: Path, base: Path) -> bool:
        """Check if resolved path is within base directory."""
        try:
            path.relative_to(base)
            return True
        except ValueError:
            return False

    def _validate_path(self, path: Path, base_dir: Path) -> Path:
        """Ensure resolved path stays within the expected base directory."""
        resolved = path.resolve()
        base_resolved = base_dir.resolve()
        if not str(resolved).startswith(str(base_resolved) + "/") and resolved != base_resolved:
            raise ValueError(f"Path traversal detected: {path}")
        return resolved

    def get_upload_path(self, filename: str) -> Path:
        logger.debug("Resolving upload path for filename=%s", filename)
        path = self.upload_dir / filename
        return self._validate_path(path, self.upload_dir)

    def delete_file(self, file_path: str) -> bool:
        """Delete a file, validating it resides within allowed directories."""
        resolved = Path(file_path).resolve()
        # Allow deletion from upload, output, or temp directories
        allowed_dirs = [
            d for d in (
                getattr(self, "upload_dir", None),
                getattr(self, "output_dir", None),
                getattr(self, "temp_dir", None),
            ) if d is not None
        ]
        if not allowed_dirs:
            logger.warning("No allowed directories configured; blocking deletion: %s", file_path)
            return False
        allowed = any(
            self._is_within(resolved, d.resolve()) for d in allowed_dirs
        )
        if not allowed:
            logger.warning("Blocked deletion outside allowed dirs: %s", file_path)
            return False
        if resolved.exists():
            resolved.unlink()
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
