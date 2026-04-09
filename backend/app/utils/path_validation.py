"""Shared file path validation utilities."""

from pathlib import Path

from ..config import settings
from ..errors import PathTraversalError


def validate_file_path(file_path: str) -> Path:
    """Validate that a file path is within allowed storage directories.

    Prevents path traversal attacks by resolving symlinks and checking
    that the resolved path is under the storage or output directory.
    """
    storage_root = str(Path(settings.storage_path).resolve())
    output_root = str(Path(settings.output_dir).resolve())
    resolved = str(Path(file_path).resolve())
    in_storage = resolved == storage_root or resolved.startswith(storage_root + "/")
    in_output = resolved == output_root or resolved.startswith(output_root + "/")
    if not (in_storage or in_output):
        raise PathTraversalError("File path outside allowed directories")
    return Path(resolved)
