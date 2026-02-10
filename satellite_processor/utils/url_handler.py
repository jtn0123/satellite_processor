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
