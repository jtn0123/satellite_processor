"""
Core module initialization
Exposes key classes and functionality

NOTE: This module uses legacy typing style (e.g., Optional[], Union[], List[] from typing
instead of PEP 604 X | Y syntax). Modernizing type annotations is deferred due to 238+
existing ruff errors — see audit #3 finding #9.
"""

from .processor import SatelliteImageProcessor
from .image_operations import ImageOperations
from .video_handler import VideoHandler
from .file_manager import FileManager
from .resource_monitor import ResourceMonitor
from .settings_manager import SettingsManager

__all__ = [
    "SatelliteImageProcessor",
    "ImageOperations",
    "VideoHandler",
    "FileManager",
    "ResourceMonitor",
    "SettingsManager",
]

# Version info
__version__ = "1.0.0"
