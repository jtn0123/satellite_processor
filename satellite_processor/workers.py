from PyQt6.QtCore import QThread, pyqtSignal  # Updated from PyQt5.QtCore to PyQt6.QtCore
from satellite_processor.utils.progress_tracker import ProgressTracker
from satellite_processor.core.processor import SatelliteImageProcessor  # Ensure correct import
import time

class ProcessingWorker(QThread):
    # Define signals
    progress_update = pyqtSignal(str, int)  # operation, progress percentage
    status_update = pyqtSignal(str)
    finished = pyqtSignal(bool, str)  # Ensure the signal expects two arguments
    error_signal = pyqtSignal(str)  # Add an error signal

    def __init__(self, processor_params):
        super().__init__()
        self.processor = SatelliteImageProcessor()
        self._running = True

        # Initialize ProgressTracker
        self.progress_tracker = ProgressTracker()
        self.progress_tracker.start()

        # Connect processor signals to worker signals
        self.processor.status_update.connect(self.status_update.emit)
        self.processor.error_occurred.connect(self.error_signal.emit)

    def run(self):
        self.progress_tracker.add_task("Processing", total=100)  # Replace total with actual total steps
        self.progress_tracker.start_task("Processing")

        success = False
        message = ""
        try:
            self.processor.process()
            success = True
            message = "Processing completed successfully."
        except Exception as e:
            error_message = f"Processing failed: {e}"
            self.error_signal.emit(error_message)
            self.logger.error(error_message)
            success = False
            message = str(e)
            self.quit()
        finally:
            self.progress_tracker.stop()
            self.finished.emit(success, message)  # Emit with required arguments

    def stop(self):
        self._running = False

    def get_status_text(self) -> str:
        """Get the current status text from the progress tracker."""
        return self.progress_tracker.get_status_text()
