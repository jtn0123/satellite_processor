"""
Core module initialization
Exposes key classes and functionality
"""

from .file_manager import FileManager
from .image_operations import ImageOperations
from .processor import SatelliteImageProcessor
from .resource_monitor import ResourceMonitor
from .settings_manager import SettingsManager
from .video_handler import VideoHandler

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
