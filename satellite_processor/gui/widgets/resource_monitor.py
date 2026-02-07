from PyQt6.QtCore import QObject, pyqtSignal, QThread, QTimer
from PyQt6.QtWidgets import QWidget, QVBoxLayout, QLabel
import psutil
import time


class ResourceMonitor(QObject):
    """Monitor system resources in a separate thread"""

    resource_update = pyqtSignal(dict)

    def __init__(self):
        super().__init__()
        self._timer = QTimer()
        self._timer.timeout.connect(self._update_stats)
        self._running = False
        self._prev_net_io = None

    def start(self):
        """Start monitoring"""
        self._running = True
        self._prev_net_io = psutil.net_io_counters()
        self._timer.start(1000)  # Update every second

    def stop(self):
        """Stop monitoring"""
        self._running = False
        self._timer.stop()

    def _update_stats(self):
        """Collect and emit resource statistics"""
        if not self._running:
            return

        # Get current network stats
        net_io = psutil.net_io_counters()

        # Calculate network rates
        if self._prev_net_io:
            bytes_sent = net_io.bytes_sent - self._prev_net_io.bytes_sent
            bytes_recv = net_io.bytes_recv - self._prev_net_io.bytes_recv
        else:
            bytes_sent = bytes_recv = 0

        self._prev_net_io = net_io

        stats = {
            "cpu": psutil.cpu_percent(),
            "memory": psutil.virtual_memory().percent,
            "bytes_sent": bytes_sent,
            "bytes_recv": bytes_recv,
            "timestamp": time.time(),
        }

        self.resource_update.emit(stats)


class ResourceMonitorWidget(QWidget):
    """Widget to display resource monitoring information"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()
        self.setup_monitor()

    def init_ui(self):
        """Initialize the widget UI"""
        self.layout = QVBoxLayout(self)
        self.cpu_label = QLabel("CPU: 0%")
        self.memory_label = QLabel("Memory: 0%")
        self.network_label = QLabel("Network: ↑0 B/s ↓0 B/s")

        self.layout.addWidget(self.cpu_label)
        self.layout.addWidget(self.memory_label)
        self.layout.addWidget(self.network_label)

    def setup_monitor(self):
        """Setup the resource monitor"""
        self.monitor = ResourceMonitor()
        self.monitor_thread = QThread(self)
        self.monitor.moveToThread(self.monitor_thread)

        # Connect signals
        self.monitor_thread.started.connect(self.monitor.start)
        self.monitor.resource_update.connect(self.update_stats)

        # Start monitoring
        self.monitor_thread.start()

    def update_stats(self, stats):
        """Update displayed statistics"""
        self.cpu_label.setText(f"CPU: {stats['cpu']}%")
        self.memory_label.setText(f"Memory: {stats['memory']}%")
        self.network_label.setText(
            f"Network: ↑{self._format_bytes(stats['bytes_sent'])}/s "
            f"↓{self._format_bytes(stats['bytes_recv'])}/s"
        )

        # Forward stats to any parent widgets that might need them
        if hasattr(self.parent(), "on_resource_update"):
            self.parent().on_resource_update(stats)

    def _format_bytes(self, bytes_val):
        """Format bytes to human readable string"""
        for unit in ["B", "KB", "MB", "GB"]:
            if bytes_val < 1024:
                return f"{bytes_val:.1f} {unit}"
            bytes_val /= 1024
        return f"{bytes_val:.1f} TB"

    def closeEvent(self, event):
        """Clean up when widget is closed"""
        self.monitor.stop()
        self.monitor_thread.quit()
        self.monitor_thread.wait()
        super().closeEvent(event)
