"""Shared file path validation utilities."""

from pathlib import Path

from ..config import settings
from ..errors import APIError


def validate_file_path(file_path: str) -> Path:
    """Validate that a file path is within allowed storage directories.

    Prevents path traversal attacks by resolving symlinks and checking
    that the resolved path is under the storage or output directory.
    """
    storage_root = Path(settings.storage_path).resolve()
    output_root = Path(settings.output_dir).resolve()
    resolved = Path(file_path).resolve()
    try:
        resolved.relative_to(storage_root)
    except ValueError:
        try:
            resolved.relative_to(output_root)
        except ValueError:
            raise APIError(403, "forbidden", "File path outside allowed directories")
    return resolved
