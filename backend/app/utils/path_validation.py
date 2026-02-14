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
    if not (str(resolved).startswith(str(storage_root)) or str(resolved).startswith(str(output_root))):
        raise APIError(403, "forbidden", "File path outside allowed directories")
    return resolved
