"""
Widget for monitoring and displaying network activity.
Tracks upload/download rates and provides visual feedback through progress bars.
Updates network statistics in real-time.
"""

from PyQt6.QtWidgets import QWidget, QVBoxLayout, QGridLayout, QLabel, QProgressBar
from PyQt6.QtCore import QTimer, pyqtSignal
import psutil

class NetworkWidget(QWidget):
    """Widget for displaying network activity"""
    
    network_update = pyqtSignal(dict)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.prev_sent = 0
        self.prev_recv = 0
        self.prev_time = 0
        self.init_ui()
        
        # Start monitoring
        self.timer = QTimer()
        self.timer.timeout.connect(self.update_stats)
        self.timer.start(1000)  # Update every second
        
    def init_ui(self):
        layout = QGridLayout()
        
        # Upload widgets
        self.upload_label = QLabel("Upload:")
        self.upload_bar = QProgressBar()
        self.upload_speed = QLabel("0 B/s")
        
        # Download widgets
        self.download_label = QLabel("Download:")
        self.download_bar = QProgressBar()
        self.download_speed = QLabel("0 B/s")
        
        # Add widgets to layout
        layout.addWidget(self.upload_label, 0, 0)
        layout.addWidget(self.upload_bar, 0, 1)
        layout.addWidget(self.upload_speed, 0, 2)
        
        layout.addWidget(self.download_label, 1, 0)
        layout.addWidget(self.download_bar, 1, 1)
        layout.addWidget(self.download_speed, 1, 2)
        
        self.setLayout(layout)
        
    def update_stats(self):
        """Update network statistics"""
        try:
            net_io = psutil.net_io_counters()
            now = psutil.time.time()
            
            # Calculate rates and update UI
            time_delta = now - self.prev_time if self.prev_time else 1
            upload_rate = (net_io.bytes_sent - self.prev_sent) / time_delta
            download_rate = (net_io.bytes_recv - self.prev_recv) / time_delta
            
            # Update network stats
            self.update_network_stats(upload_rate, download_rate, net_io)
            
            # Store values for next update
            self.prev_sent = net_io.bytes_sent
            self.prev_recv = net_io.bytes_recv
            self.prev_time = now
            
        except Exception as e:
            print(f"Failed to update network stats: {e}")

    def update_network_stats(self, upload_rate, download_rate, net_io):
        """Update network statistics display"""
        MAX_RATE = 100 * 1024 * 1024  # 100 MB/s
        
        # Update progress bars
        self.upload_bar.setValue(int((upload_rate / MAX_RATE) * 100))
        self.download_bar.setValue(int((download_rate / MAX_RATE) * 100))
        
        # Update speed labels
        self.upload_speed.setText(self._format_bytes(upload_rate) + "/s")
        self.download_speed.setText(self._format_bytes(download_rate) + "/s")
        
        # Emit network update signal
        self.network_update.emit({
            'sent_rate': upload_rate,
            'recv_rate': download_rate,
            'total_sent': net_io.bytes_sent,
            'total_recv': net_io.bytes_recv
        })
            
    def _format_bytes(self, bytes_value):
        """Format bytes to human readable string"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if bytes_value < 1024:
                return f"{bytes_value:.1f} {unit}"
            bytes_value /= 1024
        return f"{bytes_value:.1f} TB"