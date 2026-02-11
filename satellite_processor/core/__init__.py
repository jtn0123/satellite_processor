"""
Core module initialization
Exposes key classes and functionality
"""

from .file_manager import FileManager
from .image_operations import ImageOperations
from .pipeline import Pipeline, Stage, validate_image
from .processor import SatelliteImageProcessor
from .resource_monitor import ResourceMonitor
from .settings_manager import SettingsManager
from .settings_schema import from_core_settings, to_core_settings
from .video_handler import VideoHandler

__all__ = [
    "SatelliteImageProcessor",
    "ImageOperations",
    "VideoHandler",
    "FileManager",
    "ResourceMonitor",
    "SettingsManager",
    "Pipeline",
    "Stage",
    "validate_image",
    "to_core_settings",
    "from_core_settings",
]

# Version info
__version__ = "1.0.0"
