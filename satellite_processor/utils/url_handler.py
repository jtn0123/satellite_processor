"""
URL Handler Module
----------------
Handles URL scheme registration and system-level file opening.
"""

import os
import sys
from pathlib import Path
from PyQt6.QtCore import QUrl
from PyQt6.QtGui import QDesktopServices


def normalize_path(path: str) -> str:
    """Normalize the given file path."""
    return str(Path(path).resolve())


def create_file_url(file_path: str) -> str:
    """Convert a file path to a file:// URL."""
    return QUrl.fromLocalFile(normalize_path(file_path)).toString()


def create_link_data(file_path: Path) -> dict:
    """Create link data dictionary for HTML formatting."""
    return {"url": create_file_url(str(file_path)), "display_name": file_path.name}


def open_file(path: str) -> bool:
    """Open the file with the default system application."""
    try:
        file_url = QUrl.fromLocalFile(normalize_path(path))
        return QDesktopServices.openUrl(file_url)
    except Exception:
        return False
