"""
URL Handler Module
----------------
Handles URL opening and file launching using stdlib.
"""

import webbrowser
from pathlib import Path


def open_url(url: str):
    webbrowser.open(url)


def open_file(path: str):
    webbrowser.open(Path(path).as_uri())


def normalize_path(path: str) -> str:
    """Normalize a path to an absolute path."""
    return str(Path(path).resolve())


def create_file_url(path: str) -> str:
    """Create a file:// URL from a filesystem path."""
    return Path(path).resolve().as_uri()


def create_link_data(path: str, label: str = "") -> dict:
    """Create a link data dictionary with a file URL and optional label."""
    url = create_file_url(path)
    return {"url": url, "display_name": label or Path(path).name, "path": str(Path(path).resolve())}
