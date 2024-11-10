from PyQt6.QtCore import QThread, pyqtSignal
from .processor import SatelliteImageProcessor
import logging

class ProcessingWorker(QThread):
    """Worker thread for handling satellite image processing"""
    
    progress_update = pyqtSignal(str, int)
    status_update = pyqtSignal(str)
    error_occurred = pyqtSignal(str)
    finished = pyqtSignal()
    
    def __init__(self, input_dir: str, output_dir: str, options: dict, parent=None):
        super().__init__(parent)
        self.logger = logging.getLogger(__name__)
        self.input_dir = input_dir
        self.output_dir = output_dir
        self.options = options
        self.processor = SatelliteImageProcessor(options)
        self.processor.status_update.connect(self.status_update)
        self.processor.error_occurred.connect(self.error_occurred)
        self.processor.finished.connect(self.finished)
    
    def run(self):
        """Execute the processing workflow"""
        self.logger.info("Processing started.")
        success = self.processor.run(input_dir=self.input_dir, output_dir=self.output_dir)
        if success:
            self.finished.emit()
        else:
            self.error_occurred.emit("Processing failed.")
    
    def cancel(self):
        """Cancel the processing operation"""
        self.processor.cancel()
        self.logger.info("Processing cancelled.")