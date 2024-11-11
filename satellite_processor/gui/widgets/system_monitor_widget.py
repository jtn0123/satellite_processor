"""
System resource monitoring widget.
Displays real-time CPU, memory, and network usage statistics.
Provides visual feedback through progress bars and updates metrics periodically.
"""

from PyQt6.QtWidgets import QWidget, QVBoxLayout, QGridLayout, QLabel, QProgressBar
from PyQt6.QtCore import QTimer, pyqtSignal
import psutil
import time

class SystemMonitorWidget(QWidget):  # Just rename the class from ResourceMonitorWidget
    """Widget for displaying system resource usage"""
    
    resource_update = pyqtSignal(dict)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()
        self.prev_net_io = psutil.net_io_counters()
        self.prev_time = time.time()
        
        # Start monitoring timer
        self.update_timer = QTimer()
        self.update_timer.timeout.connect(self.update_stats)
        self.update_timer.start(1000)  # Update every second

    def init_ui(self):
        layout = QGridLayout()
        
        # CPU Usage
        self.cpu_label = QLabel("CPU Usage:")
        self.cpu_bar = QProgressBar()
        self.cpu_value = QLabel("0%")
        
        # RAM Usage
        self.ram_label = QLabel("RAM Usage:")
        self.ram_bar = QProgressBar()
        self.ram_value = QLabel("0%")
        
        # Network Upload
        self.upload_label = QLabel("Upload:")
        self.upload_bar = QProgressBar()
        self.upload_value = QLabel("0 B/s")
        
        # Network Download
        self.download_label = QLabel("Download:")
        self.download_bar = QProgressBar()
        self.download_value = QLabel("0 B/s")
        
        # Add widgets to layout
        layout.addWidget(self.cpu_label, 0, 0)
        layout.addWidget(self.cpu_bar, 0, 1)
        layout.addWidget(self.cpu_value, 0, 2)
        
        layout.addWidget(self.ram_label, 1, 0)
        layout.addWidget(self.ram_bar, 1, 1)
        layout.addWidget(self.ram_value, 1, 2)
        
        layout.addWidget(self.upload_label, 2, 0)
        layout.addWidget(self.upload_bar, 2, 1)
        layout.addWidget(self.upload_value, 2, 2)
        
        layout.addWidget(self.download_label, 3, 0)
        layout.addWidget(self.download_bar, 3, 1)
        layout.addWidget(self.download_value, 3, 2)
        
        self.setLayout(layout)

    def update_stats(self):
        """Update resource statistics"""
        # Get CPU and memory stats
        cpu = psutil.cpu_percent()
        memory = psutil.virtual_memory()
        
        # Get network stats
        net_io = psutil.net_io_counters()
        current_time = time.time()
        time_diff = current_time - self.prev_time
        
        # Calculate network rates
        bytes_sent = net_io.bytes_sent - self.prev_net_io.bytes_sent
        bytes_recv = net_io.bytes_recv - self.prev_net_io.bytes_recv
        
        send_rate = bytes_sent / time_diff
        recv_rate = bytes_recv / time_diff
        
        # Update UI
        self.cpu_bar.setValue(int(cpu))
        self.cpu_value.setText(f"{cpu:.1f}%")
        
        self.ram_bar.setValue(int(memory.percent))
        self.ram_value.setText(f"{memory.percent:.1f}%")
        
        self.upload_value.setText(self._format_bytes(send_rate) + "/s")
        self.download_value.setText(self._format_bytes(recv_rate) + "/s")
        
        # Store values for next update
        self.prev_net_io = net_io
        self.prev_time = current_time
        
        # Emit update signal
        self.resource_update.emit({
            'cpu': cpu,
            'ram': memory.percent,
            'network_sent': net_io.bytes_sent,
            'network_recv': net_io.bytes_recv,
            'current_sent': send_rate,
            'current_recv': recv_rate
        })

    def _format_bytes(self, bytes_value):
        """Format bytes to human readable string"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if bytes_value < 1024:
                return f"{bytes_value:.1f} {unit}"
            bytes_value /= 1024
        return f"{bytes_value:.1f} TB"