from PyQt6.QtCore import QObject, pyqtSignal, QThread
from ...core.processor import SatelliteImageProcessor  # Fix the import path with correct number of dots
import logging

class ProcessingThread(QThread):
    """Thread for running the processor"""
    def __init__(self, processor, parent=None):
        super().__init__(parent)
        self.processor = processor

    def run(self):
        """Run the processing in a separate thread"""
        try:
            self.processor.process()
        except Exception as e:
            self.processor.error_occurred.emit(str(e))

class ProcessingManager(QObject):
    """Manages processing operations"""
    progress_update = pyqtSignal(str, int)
    status_update = pyqtSignal(str)
    error_occurred = pyqtSignal(str)
    finished = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.logger = logging.getLogger(__name__)
        self.processor = None
        self.processing_thread = None
        self._is_processing = False

    def processing_is_active(self) -> bool:
        """Check if processing is currently active"""
        return self._is_processing

    def start_processing(self, options: dict) -> bool:
        """Start processing with single status updates"""
        try:
            if self._is_processing:
                self.logger.warning("Processing already in progress")
                return False
                
            self._is_processing = True
            # Remove any status updates from here - let processor handle them
            
            # Create new processor instance
            self.processor = SatelliteImageProcessor(options, self)
            
            # Connect signals
            self.processor.progress_update.connect(self.progress_update)
            self.processor.status_update.connect(self.status_update)
            self.processor.error_occurred.connect(self.error_occurred)
            self.processor.finished.connect(self.finished)
            
            # Create and start processing thread
            self.processing_thread = ProcessingThread(self.processor)
            self.processing_thread.finished.connect(self._on_thread_finished)
            self.processing_thread.start()
            
            return True
            
        except Exception as e:
            self._is_processing = False
            self.logger.error(f"Failed to start processing: {e}")
            self.error_occurred.emit(str(e))
            return False

    def cancel_processing(self):
        """Cancel the current processing operation"""
        try:
            if self.processor:
                self.processor.cancel()
            if self.processing_thread:
                self.processing_thread.wait()
                self.processing_thread = None
            self._is_processing = False
        except Exception as e:
            self.logger.error(f"Error during cancellation: {e}")
            raise

    def _on_thread_finished(self):
        """Clean up after thread completion"""
        if self.processing_thread:
            self.processing_thread.wait()
            self.processing_thread = None
        self._is_processing = False