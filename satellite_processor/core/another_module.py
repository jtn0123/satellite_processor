
# satellite_processor/satellite_processor/core/worker.py

import logging
from PyQt6.QtCore import QObject, pyqtSignal, QThread
from .processor import SatelliteImageProcessor

class ProcessingWorker(QThread):
    """Worker thread for processing satellite images"""
    
    progress_update = pyqtSignal(str, int)
    status_update = pyqtSignal(str)
    error_occurred = pyqtSignal(str)
    finished = pyqtSignal()
    
    def __init__(self, options: dict = None, parent=None):
        super().__init__(parent)
        self.options = options or {}
        self.processor = SatelliteImageProcessor(options)
        self.processor.progress_update.connect(self.progress_update)
        self.processor.status_update.connect(self.status_update)
        self.processor.error_occurred.connect(self.error_occurred)
        self.processor.finished.connect(self.finished)
        self.logger = logging.getLogger(__name__)
        
    def run(self):
        """Run the processing workflow"""
        try:
            self.processor.process()
        except Exception as e:
            self.logger.error(f"Processing failed: {str(e)}")
            self.error_occurred.emit(str(e))
            
    def cancel(self):
        """Cancel the processing"""
        self.processor.cancel()