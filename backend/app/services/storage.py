"""File storage management"""

import uuid
from pathlib import Path

from ..config import settings
from ..utils.metadata import parse_satellite_metadata


class StorageService:
    """Manage file storage for uploads and outputs"""

    def __init__(self):
        self.upload_dir = Path(settings.upload_dir)
        self.output_dir = Path(settings.output_dir)
        self.temp_dir = Path(settings.temp_dir)

    def save_upload(self, filename: str, content: bytes) -> dict:
        """Save an uploaded file and return metadata"""
        file_id = str(uuid.uuid4())
        safe_name = f"{file_id}_{filename}"
        file_path = self.upload_dir / safe_name
        file_path.write_bytes(content)

        # Parse satellite metadata from filename
        meta = parse_satellite_metadata(filename)

        return {
            "id": file_id,
            "filename": safe_name,
            "original_name": filename,
            "file_path": str(file_path),
            "file_size": len(content),
            **meta,
        }

    def get_upload_path(self, filename: str) -> Path:
        return self.upload_dir / filename

    def list_uploads(self) -> list:
        """List all uploaded files. NOTE: Dead code — listing is done via DB query in the images router."""
        return [
            {"name": f.name, "size": f.stat().st_size, "path": str(f)}
            for f in self.upload_dir.iterdir()
            if f.is_file() and f.suffix.lower() in (".png", ".jpg", ".jpeg")
        ]

    def delete_file(self, file_path: str) -> bool:
        """Delete a file"""
        path = Path(file_path)
        if path.exists():
            path.unlink()
            return True
        return False

    def get_job_output_dir(self, job_id: str) -> Path:
        """Get/create output directory for a job"""
        job_dir = self.output_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        return job_dir


storage_service = StorageService()
