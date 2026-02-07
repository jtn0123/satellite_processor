from PyQt6.QtCore import QObject, pyqtSignal, QThread
from ...core.processor import (
    SatelliteImageProcessor,
)  # Fix the import path with correct number of dots
import logging
from pathlib import Path
from satellite_processor.core.image_operations import ImageOperations
from satellite_processor.gui.managers.log_manager import sanchez_logger


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
    output_ready = pyqtSignal(Path)  # Add this signal

    def __init__(self, parent=None):
        super().__init__(parent)
        self.processor = SatelliteImageProcessor(
            parent=self
        )  # Initialize processor immediately
        self.worker = None
        self.logger = logging.getLogger(__name__)
        self.processing_thread = None
        self._is_processing = False

        # Connect processor signals
        self.processor.status_update.connect(self.status_update.emit)
        self.processor.output_ready.connect(
            self.output_ready.emit
        )  # Forward the signal

    def processing_is_active(self) -> bool:
        """Check if processing is currently active"""
        return self._is_processing

    def start_processing(self, options: dict) -> bool:
        """Start processing with options properly passed to processor"""
        try:
            if self._is_processing:
                self.logger.warning("Processing is already active.")
                return False

            # Update processor options before starting
            self.processor.options = (
                options.copy()
            )  # Add this line to ensure options are set

            # Initialize and start the processing thread
            self.processing_thread = ProcessingThread(self.processor)
            self.processing_thread.finished.connect(
                self._on_thread_finished
            )  # Add this connection
            self.processing_thread.start()
            self._is_processing = True
            self.logger.info("Processing started.")
            return True

        except Exception as e:
            self.error_occurred.emit(f"Failed to start processing: {e}")
            self.logger.error(f"Failed to start processing: {e}")
            return False

    def cancel_processing(self):
        """Cancel the current processing operation"""
        try:
            if self.processing_thread and self.processing_thread.isRunning():
                self.processor.cancel()
                self.processing_thread.quit()
                self.processing_thread.wait()
                self.logger.info("Processing cancelled.")
                self._is_processing = False
                self.status_update.emit("Processing cancelled")
        except Exception as e:
            self.error_occurred.emit(f"Failed to cancel processing: {e}")
            self.logger.error(f"Failed to cancel processing: {e}")

    def _on_thread_finished(self):
        """Clean up after thread completion"""
        if self.processing_thread:
            self.processing_thread.wait()
            self.processing_thread = None
        self._is_processing = False
        self.finished.emit()

    def apply_sanchez_false_color(
        self, input_path: str, output_path: str, sanchez_path: str, underlay_path: str
    ) -> bool:
        """Apply false color using Sanchez and log the process."""
        sanchez_logger.info(f"Applying false color to {input_path}")
        success = ImageOperations.apply_false_color(
            input_path, output_path, sanchez_path, underlay_path
        )
        if success:
            sanchez_logger.info(f"Successfully applied false color to {input_path}")
        else:
            sanchez_logger.error(f"Failed to apply false color to {input_path}")
        return success
