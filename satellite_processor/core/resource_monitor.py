"""
Resource Monitoring Module
Responsibilities:
- Monitor system CPU usage
- Track memory consumption
- Provide real-time resource metrics
- Emit resource updates via callbacks
- Handle monitoring intervals
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from datetime import datetime

import psutil

logger = logging.getLogger(__name__)

# --- Constants ---
DEFAULT_MONITOR_INTERVAL_SECONDS = 1.0
ERROR_RETRY_DELAY_SECONDS = 1.0


class ResourceMonitor:
    """Monitor system resources using a background thread"""

    def __init__(self, parent=None):
        self.logger = logging.getLogger(__name__)
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._interval = DEFAULT_MONITOR_INTERVAL_SECONDS
        self._last_net_io = psutil.net_io_counters()
        self._last_check = time.time()
        self._thread: threading.Thread | None = None

        # Callback-based signal replacement
        self.on_resource_update: Callable[[dict], None] | None = None

    def set_interval(self, msec: int):
        """Set the update interval in milliseconds"""
        if msec <= 0:
            raise ValueError("Interval must be positive")
        self._interval = msec / 1000.0

    def start(self):
        """Start monitoring in a background thread"""
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            # If a previous thread exists, ensure it has fully exited before
            # clearing the stop signal — otherwise the old thread could see the
            # cleared event and keep running.
            if self._thread is not None:
                self._thread.join(timeout=2)
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._run, daemon=True)
            self._thread.start()

    def _run(self):
        """Main monitoring loop"""
        while not self._stop_event.is_set():
            try:
                stats = {
                    "cpu": psutil.cpu_percent(interval=None),
                    "memory": psutil.virtual_memory().percent,
                    "timestamp": datetime.now().timestamp(),
                }

                if self.on_resource_update:
                    self.on_resource_update(stats)
                self._stop_event.wait(self._interval)

            except Exception as e:
                self.logger.error(f"Resource monitor error: {e}", exc_info=True)
                self._stop_event.wait(ERROR_RETRY_DELAY_SECONDS)

    def should_throttle(self) -> bool:
        """Return True if system resources are under pressure (#17).

        Thresholds: CPU > 90 % or memory > 85 %.
        """
        try:
            return psutil.cpu_percent(interval=None) > 90 or psutil.virtual_memory().percent > 85
        except Exception:
            return False

    def stop(self):
        """Stop monitoring safely"""
        with self._lock:
            self._stop_event.set()
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
            logger.debug("Error during ResourceMonitor cleanup in __del__", exc_info=True)
