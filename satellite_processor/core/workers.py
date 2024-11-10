from PyQt6.QtCore import QThread, pyqtSignal
from pathlib import Path
from typing import Dict, Any
import logging

from .processor import SatelliteImageProcessor

class ProcessingWorker(QThread):
    """Worker thread for handling image processing"""

    progress_update = pyqtSignal(str, int)
    status_update = pyqtSignal(str)
    error_occurred = pyqtSignal(str)
    finished = pyqtSignal()

    def __init__(self, options: Dict[str, Any], parent=None):
        super().__init__(parent)
        self.options = options
        self.processor = SatelliteImageProcessor(options)
        self.logger = logging.getLogger(__name__)

    def run(self):
        """Main processing method"""
        try:
            self.logger.info("Starting processing worker")

            # Connect processor signals
            self.processor.progress_update.connect(
                lambda op, prog: self.progress_update.emit(op, prog)
            )
            self.processor.status_update.connect(
                lambda status: self.status_update.emit(status)
            )

            # Run processing
            success = self.processor.process()
            if success:
                self.finished.emit()

        except Exception as e:
            self.logger.error(f"Processing failed: {str(e)}")
            self.error_occurred.emit(str(e))

    def cancel(self):
        """Cancel processing"""
        self.logger.info("Cancelling processing")
        if self.processor:
            self.processor.cancel()