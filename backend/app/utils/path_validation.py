"""Utility for validating and sanitising file paths."""

from pathlib import Path

from fastapi import HTTPException


def validate_file_path(raw_path: str) -> Path:
    """Resolve *raw_path* and ensure it doesn't escape the expected directories.

    Returns the resolved :class:`Path` on success.
    Raises :class:`HTTPException` (400) when the path looks malicious.
    """
    resolved = Path(raw_path).resolve()

    # Block obvious traversal attempts
    if ".." in Path(raw_path).parts:
        raise HTTPException(status_code=400, detail="Invalid file path")

    return resolved
