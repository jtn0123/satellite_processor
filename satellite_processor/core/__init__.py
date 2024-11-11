"""
Core module initialization
Exposes key classes and functionality
"""

from .processor import SatelliteImageProcessor
from .image_operations import ImageOperations
from .video_handler import VideoHandler
from .file_manager import FileManager
from .resource_monitor import ResourceMonitor
from .settings_manager import SettingsManager
from .worker import ProcessingWorker

__all__ = [
    'SatelliteImageProcessor',
    'ImageOperations',
    'VideoHandler',
    'FileManager',
    'ResourceMonitor',
    'SettingsManager',
    'ProcessingWorker'
]

# Version info
__version__ = '1.0.0'