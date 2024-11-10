import psutil
from PyQt6.QtCore import QThread, pyqtSignal
import time
import logging
from datetime import datetime  # Add missing import

class ResourceMonitor(QThread):
    """Monitor system resources"""
    
    resource_update = pyqtSignal(dict)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.logger = logging.getLogger(__name__)
        self._running = True
        self._interval = 1.0  # Default to 1 second
        self._last_net_io = psutil.net_io_counters()
        self._last_check = time.time()
        
    def setInterval(self, msec: int):
        """Set the update interval in milliseconds"""
        self._interval = msec / 1000.0  # Convert to seconds
        
    def run(self):
        while self._running:
            try:
                stats = {
                    'cpu': psutil.cpu_percent(interval=None),
                    'memory': psutil.virtual_memory().percent,
                    'timestamp': datetime.now().timestamp()
                }
                
                # Emit update
                self.resource_update.emit(stats)
                time.sleep(self._interval)
                
            except Exception as e:
                self.logger.error(f"Resource monitor error: {e}")
                time.sleep(1)

    def stop(self):
        self._running = False
        self.wait()