# satellite_processor/satellite_processor/core/base_processor.py
from PyQt6.QtCore import QObject, pyqtSignal
import logging
import tempfile
from .progress_tracker import ProgressTracker
from .temp_manager import TempManager
from .resource_monitor import ResourceMonitor

class BaseImageProcessor(QObject):
    """Base class for image processing with minimal shared functionality"""
    
    # Add signal for resource updates
    resource_update = pyqtSignal(dict)
    
    # Add progress signals to base class
    progress_update = pyqtSignal(str, int)
    overall_progress = pyqtSignal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.logger = logging.getLogger(__name__)
        
        # Initialize components
        self.progress = ProgressTracker(self)
        self.temp_manager = TempManager()
        self.resource_monitor = ResourceMonitor(self)
        self._is_closing = False
        
        # Initialize preferences with default temp directory
        self.preferences = {
            'temp_directory': tempfile.gettempdir()  # Add default temp directory
        }
        
        # Connect resource monitor signal to graph update
        self.resource_monitor.resource_update.connect(self.handle_resource_update)

        # Start resource monitoring
        self.resource_monitor.start()
        
        self.cancelled = False
        
    def cancel(self):
        """Cancel processing and cleanup"""
        self.cancelled = True
        self.temp_manager.cleanup()
        
    def handle_resource_update(self, stats: dict):
        """Handle resource updates for CPU/Memory only"""
        self.resource_update.emit(stats)
        # If there are slots in the UI to handle, ensure they're connected

    def update_progress(self, operation: str, progress: int):
        """Emit progress update signals"""
        self.progress_update.emit(operation, progress)
        self.overall_progress.emit(progress)

    def __del__(self):
        """Ensure cleanup on deletion"""
        self.temp_manager.cleanup()