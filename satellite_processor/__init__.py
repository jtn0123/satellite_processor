"""
Core module initialization
"""

# This file makes satellite_processor a Python package

from .core.file_manager import FileManager
from .core.image_operations import ImageOperations
from .core.processor import SatelliteImageProcessor
from .core.resource_monitor import ResourceMonitor
from .core.settings_manager import SettingsManager
from .core.video_handler import VideoHandler

__all__ = [
    "ImageOperations",
    "SatelliteImageProcessor",
    "VideoHandler",
    "FileManager",
    "ResourceMonitor",
    "SettingsManager",
]
