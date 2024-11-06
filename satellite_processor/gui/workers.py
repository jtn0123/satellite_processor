# satellite_processor/satellite_processor/gui/workers.py
from PyQt6.QtCore import QThread, pyqtSignal # type: ignore
from pathlib import Path
import psutil # type: ignore
from typing import List
import logging
import numpy as np # type: ignore
from PIL import Image # type: ignore
import cv2  # type: ignore # Ensure OpenCV is imported
from datetime import datetime
import time
from ..core.processor import SatelliteImageProcessor
from ..utils.settings import SettingsManager
from satellite_processor.utils.progress_tracker import ProgressTracker

class ProcessingWorker(QThread):
    # Define signals
    progress_update = pyqtSignal(str, int)  # operation, progress percentage
    status_update = pyqtSignal(str)
    finished = pyqtSignal(bool, str)  # success flag and message
    error_signal = pyqtSignal(str)  # Add an error signal

    def __init__(self, processor, params):
        super().__init__()
        self.processor = processor
        self.processor_params = params  # Initialize processor_params
        self._running = True

        # Initialize ProgressTracker
        self.progress_tracker = ProgressTracker()
        self.progress_tracker.start()

        # Connect processor signals to worker signals
        self.processor.status_update.connect(self.status_update.emit)
        self.processor.error_occurred.connect(self.error_signal.emit)

        # Setup logger
        self.logger = logging.getLogger(__name__)

    def run(self):
        try:
            # Update initialization status
            self.progress_update.emit("Initialization", 0)
            
            # Validate input and output directories
            input_dir = self.processor_params.get('input_dir', '').strip()
            output_dir = self.processor_params.get('output_dir', '').strip()
            
            if not input_dir or not output_dir:
                error_message = "Input and Output directories are required."
                self.error_signal.emit(error_message)
                self.logger.error(error_message)
                self.finished.emit(False, error_message)
                return
            
            if not Path(input_dir).exists():
                error_message = f"Input directory does not exist: {input_dir}"
                self.error_signal.emit(error_message)
                self.logger.error(error_message)
                self.finished.emit(False, error_message)
                return
            
            if not Path(output_dir).exists():
                error_message = f"Output directory does not exist: {output_dir}"
                self.error_signal.emit(error_message)
                self.logger.error(error_message)
                self.finished.emit(False, error_message)
                return

            # Connect processor progress signals to worker signals
            self.processor.progress_update.connect(
                lambda op, val: self.progress_update.emit(op, val)
            )
            
            # Start processing
            self.progress_update.emit("Scanning Files", 10)
            success = self.processor.process()
            
            if success:
                self.progress_update.emit("Completing", 100)
                self.finished.emit(True, "Processing completed successfully")
            else:
                self.error_signal.emit("Processing failed")
                self.finished.emit(False, "Processing failed")
                
        except Exception as e:
            self.error_signal.emit(str(e))
            self.finished.emit(False, str(e))
        finally:
            self.progress_tracker.stop()

    def stop(self):
        self._running = False

    def get_status_text(self) -> str:
        """Get the current status text from the progress tracker."""
        return self.progress_tracker.get_status_text()

    def processing_finished(self, success: bool, message: str):
        """Handle processing completion with success status and message."""
        if success:
            # Handle successful completion (e.g., update UI)
            pass  # ...existing success handling...
        else:
            # Handle failure (e.g., show error message)
            pass  # ...existing failure handling...
        self.finished.emit(success, message)  # Ensure two arguments are emitted

class NetworkActivityMonitor(QThread):
    """Monitor network activity for remote files"""
    activity_update = pyqtSignal(bool)  # Network activity status
    
    def __init__(self, path: str):
        super().__init__()
        self.path = Path(path)
        self.running = True
        self.previous_bytes = self.get_network_bytes()
        self.logger = logging.getLogger(__name__)
        
    def run(self):
        """Monitor network activity"""
        try:
            while self.running:
                current_bytes = self.get_network_bytes()
                has_activity = current_bytes != self.previous_bytes
                
                if has_activity:
                    transfer_rate = abs(current_bytes - self.previous_bytes)
                    self.logger.debug(f"Network activity detected: {transfer_rate} bytes/sec")
                    
                self.activity_update.emit(has_activity)
                self.previous_bytes = current_bytes
                
                # Check every second
                self.msleep(1000)
                
        except Exception as e:
            self.logger.error(f"Network monitoring error: {str(e)}")
            
    def get_network_bytes(self) -> int:
        """Get current network bytes transferred"""
        try:
            # Get network stats for all interfaces
            net_io = psutil.net_io_counters()
            return net_io.bytes_sent + net_io.bytes_recv
            
        except Exception as e:
            self.logger.error(f"Error getting network stats: {str(e)}")
            return 0
            
    def stop(self):
        """Stop monitoring"""
        self.running = False
        self.logger.debug("Network monitoring stopped")

class ResourceMonitor(QThread):
    """Monitor system resources during processing"""
    resource_update = pyqtSignal(dict)
    
    def __init__(self):
        super().__init__()
        self.running = True
        
    def run(self):
        while self.running:
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            
            # Memory usage
            memory = psutil.virtual_memory()
            ram_percent = memory.percent
            
            # Network IO
            net_io = psutil.net_io_counters()
            bytes_sent = net_io.bytes_sent
            bytes_recv = net_io.bytes_recv
            
            # Emit update
            self.resource_update.emit({
                'cpu': cpu_percent,
                'ram': ram_percent,
                'network_sent': bytes_sent,
                'network_recv': bytes_recv
            })
            
            time.sleep(1)  # Update every second
            
    def stop(self):
        self.running = False

class ImagePreviewWorker(QThread):
    """Worker for generating image previews"""
    preview_ready = pyqtSignal(str, object)  # filename, preview image
    
    def __init__(self, image_path: str):
        super().__init__()
        self.image_path = image_path
        self.logger = logging.getLogger(__name__)
        
    def run(self):
        """Generate image preview"""
        try:
            # Load and resize image for preview
            with Image.open(self.image_path) as img:
                # Resize to thumbnail size
                img.thumbnail((200, 200))
                # Convert to numpy array for Qt
                preview = np.array(img)
                
            self.preview_ready.emit(self.image_path, preview)
            
        except Exception as e:
            self.logger.error(f"Preview generation error: {str(e)}")