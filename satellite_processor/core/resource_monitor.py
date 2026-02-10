"""
Resource Monitoring Module
Responsibilities:
- Monitor system CPU usage
- Track memory consumption
- Provide real-time resource metrics
- Emit resource updates via callbacks
- Handle monitoring intervals
Dependencies:
- None (uses standard psutil library)
Used by:
- Processor for resource tracking
- UI for system monitoring displays
"""

import psutil
import threading
import time
import logging
from datetime import datetime
from typing import Optional, Callable


class ResourceMonitor:
    """Monitor system resources using a background thread"""

    def __init__(self, parent=None):
        self.logger = logging.getLogger(__name__)
        self._running = False
        self._interval = 1.0  # Default to 1 second
        self._last_net_io = psutil.net_io_counters()
        self._last_check = time.time()
        self._thread: Optional[threading.Thread] = None

        # Callback-based signal replacement
        self.on_resource_update: Optional[Callable[[dict], None]] = None

    def setInterval(self, msec: int):
        """Set the update interval in milliseconds"""
        self._interval = msec / 1000.0

    def start(self):
        """Start monitoring in a background thread"""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        """Main monitoring loop"""
        while self._running:
            try:
                stats = {
                    "cpu": psutil.cpu_percent(interval=None),
                    "memory": psutil.virtual_memory().percent,
                    "timestamp": datetime.now().timestamp(),
                }

                if self.on_resource_update:
                    self.on_resource_update(stats)
                time.sleep(self._interval)

            except Exception as e:
                self.logger.error(f"Resource monitor error: {e}")
                time.sleep(1)

    def stop(self):
        """Stop monitoring safely"""
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)

    def cleanup(self):
        """Clean up resources"""
        self.stop()

    def __del__(self):
        """Ensure cleanup on deletion"""
        try:
            self.cleanup()
        except Exception:
            pass
