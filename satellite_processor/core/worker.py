"""
Processing Worker Module (worker.py)
----------------------------------
Thread management and processing coordination for satellite image processing.

Primary Responsibilities:
- Execute processing operations in background threads
- Manage thread lifecycle and cleanup
- Handle progress and status updates
- Coordinate between UI and processor
- Provide cancellation support

Key Components:
- ProcessingWorker: Main worker thread for image processing
- Signal handling and propagation
- Error handling and logging
- Resource management

Dependencies:
- SatelliteImageProcessor for core processing
- PyQt6 for threading and signals
- Logging for error tracking
"""

from PyQt6.QtCore import QThread, pyqtSignal
from pathlib import Path
from typing import Dict, Any
import logging

from .processor import SatelliteImageProcessor

class ProcessingWorker(QThread):
    """Worker thread for handling satellite image processing"""
    
    # Define signals for UI communication
    progress_update = pyqtSignal(str, int)
    status_update = pyqtSignal(str)
    error_occurred = pyqtSignal(str)
    finished = pyqtSignal()

    def __init__(self, input_dir: str, output_dir: str, options: Dict[str, Any], parent=None):
        super().__init__(parent)
        self.logger = logging.getLogger(__name__)
        self.input_dir = input_dir
        self.output_dir = output_dir
        self.options = options
        
        # Initialize processor
        self.processor = SatelliteImageProcessor(options)
        
        # Connect processor signals
        self.processor.progress_update.connect(self.progress_update)
        self.processor.status_update.connect(self.status_update)
        self.processor.error_occurred.connect(self.error_occurred)
        self.processor.finished.connect(self.finished)

    def run(self):
        """Execute the processing workflow"""
        try:
            # Clear any previous status messages
            self.status_update.emit("")
            self.logger.info("Starting processing workflow")
            success = self.processor.run(
                input_dir=self.input_dir,
                output_dir=self.output_dir
            )
            
            if success and not self.processor.cancelled:
                self.finished.emit()
            elif self.processor.cancelled:
                self.status_update.emit("Processing cancelled")
            else:
                self.error_occurred.emit("Processing failed")
                
        except Exception as e:
            self.logger.error(f"Processing failed: {str(e)}")
            self.error_occurred.emit(str(e))
            
    def cancel(self):
        """Cancel the processing operation"""
        try:
            self.logger.info("Cancelling processing")
            if self.processor:
                self.processor.cancel()
            self.status_update.emit("Processing cancelled")
        except Exception as e:
            self.logger.error(f"Error during cancellation: {e}")
            
    def __del__(self):
        """Ensure cleanup on deletion"""
        try:
            self.cancel()
        except Exception:
            pass