"""
Resource Monitoring Module
Responsibilities:
- Monitor system CPU usage
- Track memory consumption
- Provide real-time resource metrics
- Emit resource updates to UI
- Handle monitoring intervals
Dependencies:
- None (uses standard psutil library)
Used by:
- Processor for resource tracking
- UI for system monitoring displays
"""

import psutil
from PyQt6.QtCore import QThread, pyqtSignal, pyqtSlot  # Add pyqtSlot import
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
                    "cpu": psutil.cpu_percent(interval=None),
                    "memory": psutil.virtual_memory().percent,
                    "timestamp": datetime.now().timestamp(),
                }

                # Emit update
                self.resource_update.emit(stats)
                time.sleep(self._interval)

            except Exception as e:
                self.logger.error(f"Resource monitor error: {e}")
                time.sleep(1)

    @pyqtSlot()  # Add slot decorator
    def stop(self):
        """Stop monitoring safely"""
        self._running = False
        if self.isRunning():
            self.wait()

    def cleanup(self):
        """Clean up resources"""
        self.stop()
        self.wait()

    def __del__(self):
        """Ensure cleanup on deletion"""
        try:
            self.cleanup()
        except Exception:
            pass
