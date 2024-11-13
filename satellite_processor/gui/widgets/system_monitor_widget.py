"""
System resource monitoring widget.
Displays real-time CPU, memory, and network usage statistics.
Provides visual feedback through progress bars and updates metrics periodically.
"""

from PyQt6.QtWidgets import QWidget, QVBoxLayout, QGridLayout, QLabel, QProgressBar
from PyQt6.QtCore import QTimer, pyqtSignal
import psutil
import time
import logging
try:
    import pynvml  # For NVIDIA GPU
    pynvml.nvmlInit()
    NVIDIA_AVAILABLE = True
except:
    NVIDIA_AVAILABLE = False
    
# Remove Intel GPU imports and checks
INTEL_AVAILABLE = False  # Just set this to False since we're not using it

class SystemMonitorWidget(QWidget):  # Just rename the class from ResourceMonitorWidget
    """Widget for displaying system resource usage"""
    
    resource_update = pyqtSignal(dict)
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()
        self.prev_net_io = psutil.net_io_counters()
        self.prev_time = time.time()
        
        # Update max network rate to be percentage-based
        self.max_network_rate = 10 * 1024 * 1024  # 10 MB/s as max
        
        # Set progress bar maximums
        self.cpu_bar.setMaximum(100)
        self.ram_bar.setMaximum(100)
        self.upload_bar.setMaximum(100)
        self.download_bar.setMaximum(100)
        
        # Initialize decay factors
        self.decay_factor = 0.85  # Increased decay factor for smoother drops (was 0.8)
        self.last_values = {
            'cpu': 0,
            'ram': 0,
            'upload': 0,
            'download': 0,
            'nvidia': 0
        }
        
        # Single update interval
        self.update_interval = 800  # Changed from 600ms to 800ms
        
        # Initialize timer with single interval
        self.update_timer = QTimer()
        self.update_timer.timeout.connect(self.update_stats)
        self.update_timer.start(self.update_interval)
        
        # Adjust smoothing factors for 800ms interval
        self.smoothing_factor = 0.4  # Made transitions even smoother (was 0.6)
        
        # Enable smooth progress bar animations
        self._setup_progress_bars()
        
        # Value smoothing
        self.smoothing_factor = 0.4  # Made transitions even smoother (was 0.6)
        self.value_history = {
            'cpu': [],
            'ram': [],
            'gpu_nvidia': [],
            'network_up': [],
            'network_down': []
        }
        self.history_size = 5  # Increased from 3 for smoother transitions

        # Initialize all bars to 0
        for bar in [self.cpu_bar, self.ram_bar, self.upload_bar, self.download_bar]:
            bar.setValue(0)
            bar.setMaximum(100)
            bar.setTextVisible(True)
            bar.setFormat("%p%")

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
        
        # Add GPU monitoring if available (NVIDIA only)
        row = 4  # Start after existing widgets
        
        if NVIDIA_AVAILABLE:
            self.nvidia_label = QLabel("NVIDIA GPU:")
            self.nvidia_bar = QProgressBar()
            self.nvidia_value = QLabel("0%")
            layout.addWidget(self.nvidia_label, row, 0)
            layout.addWidget(self.nvidia_bar, row, 1)
            layout.addWidget(self.nvidia_value, row, 2)
        
        # Remove Intel GPU widget creation
        
        self.setLayout(layout)
        
        # Apply enhanced styling
        self._setup_progress_bars()

    def _setup_progress_bars(self):
        """Enhanced progress bar styling"""
        base_style = """
            QProgressBar {
                border: 1px solid #2c3e50;
                border-radius: 5px;
                text-align: center;
                background-color: #34495e;
                font-weight: bold;
                height: 20px;
                margin: 2px;
                padding: 0px;
                min-width: 200px;
            }
            QProgressBar::chunk {
                background-color: #27ae60;
                border-radius: 4px;
                margin: 0.5px;
                min-width: 10px;
            }
        """
        
        # Apply consistent style to all bars
        all_bars = [self.cpu_bar, self.ram_bar, self.upload_bar, self.download_bar]
        if hasattr(self, 'nvidia_bar'):
            all_bars.append(self.nvidia_bar)
            
        for bar in all_bars:
            bar.setStyleSheet(base_style)

    def _get_gradient_color(self, value: float) -> str:
        """Get gradient color based on value with smoother transitions"""
        if value < 40:
            # Stay green up to 40%
            return "#27ae60"  # Solid green
        elif value < 75:
            # Green to Yellow gradient (40-75%)
            ratio = (value - 40) / 35
            r = int(39 + (255 - 39) * ratio)
            g = int(174)  # Keep green component strong
            b = int(96 * (1 - ratio))
        else:
            # Yellow to Red gradient (75-100%)
            ratio = (value - 75) / 25
            r = 255
            g = int(174 * (1 - ratio))
            b = 0
        
        return f"#{r:02x}{g:02x}{b:02x}"

    def _apply_bar_style(self, bar, value: float, key: str):
        """Apply gradient style with enhanced smoothing"""
        value = max(0, min(100, value))
        
        # Enhanced smoothing logic
        if key in self.last_values:
            current = self.last_values[key]
            # More sophisticated smoothing calculation
            if value > current:
                # Faster response to increases
                decayed_value = current + (value - current) * self.smoothing_factor
            else:
                # Slower decay for decreases
                decayed_value = current + (value - current) * (self.smoothing_factor * 0.7)
        else:
            decayed_value = value
            
        self.last_values[key] = decayed_value
        
        # Get colors for gradient
        color = self._get_gradient_color(decayed_value)
        
        # Apply style with new color
        bar.setStyleSheet(f"""
            QProgressBar {{
                border: 1px solid #2c3e50;
                border-radius: 5px;
                text-align: center;
                background-color: #34495e;
                font-weight: bold;
                height: 20px;
                margin: 2px;
                padding: 0px;
                min-width: 200px;
            }}
            QProgressBar::chunk {{
                background-color: {color};
                border-radius: 4px;
                margin: 0.5px;
                min-width: 10px;
            }}
        """)
        
        # Update value with smoother animation
        bar.setValue(int(decayed_value))
        
        return decayed_value

    def _smooth_value(self, key: str, new_value: float) -> float:
        """Enhanced moving average smoothing"""
        history = self.value_history[key]
        history.append(new_value)
        
        # Keep history size limited
        if len(history) > self.history_size:
            history.pop(0)
            
        # Weighted average - recent values have more impact
        weights = [0.5 + (i * 0.5 / len(history)) for i in range(len(history))]
        weighted_sum = sum(v * w for v, w in zip(history, weights))
        weight_sum = sum(weights)
        
        return weighted_sum / weight_sum

    def _format_value(self, value: float) -> str:
        """Format numeric values with consistent precision"""
        if value < 10:
            return f"{value:.2f}"
        elif value < 100:
            return f"{value:.1f}"
        return f"{int(value)}"

    def update_stats(self):
        """Update resource statistics with enhanced smoothing"""
        try:
            # Get current values using non-blocking calls
            current_cpu = psutil.cpu_percent(interval=None)
            current_ram = psutil.virtual_memory().percent
            
            # Enhanced smoothing transitions
            if hasattr(self, '_last_cpu'):
                # Asymmetric smoothing - faster response to increases, slower to decreases
                cpu_diff = current_cpu - self._last_cpu
                ram_diff = current_ram - self._last_ram
                
                if cpu_diff > 0:
                    cpu = self._last_cpu + cpu_diff * self.smoothing_factor
                else:
                    cpu = self._last_cpu + cpu_diff * (self.smoothing_factor * 0.7)
                    
                if ram_diff > 0:
                    ram = self._last_ram + ram_diff * self.smoothing_factor
                else:
                    ram = self._last_ram + ram_diff * (self.smoothing_factor * 0.7)
            else:
                cpu = current_cpu
                ram = current_ram
            
            # Store values for next transition
            self._last_cpu = cpu
            self._last_ram = ram
            
            # Update CPU and RAM displays
            self._update_cpu_ram(cpu, ram)
            
            # Update GPU if available
            self._update_gpu()
            
            # Update network stats
            self._update_network()
            
            # Emit update signal
            self._emit_stats()
            
        except Exception as e:
            logging.error(f"Error updating stats: {e}")

    def _update_cpu_ram(self, cpu: float, ram: float):
        """Update CPU and RAM displays"""
        # Update CPU
        self.cpu_bar.setValue(int(cpu))
        self.cpu_value.setText(f"{self._format_value(cpu)}%")
        self._apply_bar_style(self.cpu_bar, cpu, 'cpu')
        
        # Update RAM
        self.ram_bar.setValue(int(ram))
        self.ram_value.setText(f"{self._format_value(ram)}%")
        self._apply_bar_style(self.ram_bar, ram, 'ram')

    def _update_gpu(self):
        """Update GPU stats if available"""
        gpu_stats = {}
        
        # NVIDIA GPU
        if NVIDIA_AVAILABLE:
            try:
                handle = pynvml.nvmlDeviceGetHandleByIndex(0)
                gpu_util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                nvidia_usage = self._smooth_value('gpu_nvidia', gpu_util.gpu)
                gpu_stats['nvidia'] = nvidia_usage
                self.nvidia_bar.setValue(int(nvidia_usage))
                self.nvidia_value.setText(f"{self._format_value(nvidia_usage)}%")
                
                # Update bar color
                self._apply_bar_style(self.nvidia_bar, nvidia_usage, 'nvidia')
            except Exception as e:
                self.nvidia_value.setText("N/A")
                gpu_stats['nvidia'] = 0

    def _update_network(self):
        """Update network stats with higher precision"""
        net_io = psutil.net_io_counters()
        current_time = time.time()
        time_diff = current_time - self.prev_time
        
        bytes_sent = net_io.bytes_sent - self.prev_net_io.bytes_sent
        bytes_recv = net_io.bytes_recv - self.prev_net_io.bytes_recv
        
        send_rate = bytes_sent / time_diff
        recv_rate = bytes_recv / time_diff
        
        # Calculate percentages
        send_percent = min((send_rate / self.max_network_rate) * 100, 100)
        recv_percent = min((recv_rate / self.max_network_rate) * 100, 100)
        
        # Update progress bars with percentages
        self.upload_bar.setValue(int(send_percent))
        self.download_bar.setValue(int(recv_percent))
        
        # Apply color styling using percentages
        self._apply_bar_style(self.upload_bar, send_percent, 'upload')
        self._apply_bar_style(self.download_bar, recv_percent, 'download')
        
        # Update labels with actual rates instead of percentages
        self.upload_value.setText(f"{self._format_bytes(send_rate)}/s")
        self.download_value.setText(f"{self._format_bytes(recv_rate)}/s")
        
        # Store values for next update
        self.prev_net_io = net_io
        self.prev_time = current_time

    def _emit_stats(self):
        """Emit resource update signal with current stats"""
        self.resource_update.emit({
            'cpu': self.cpu_bar.value(),
            'ram': self.ram_bar.value(),
            'network_sent': self.upload_value.text(),
            'network_recv': self.download_value.text(),
            'gpu_nvidia': self.nvidia_bar.value() if NVIDIA_AVAILABLE else 0,
            'timestamp': time.time()  # Add timestamp for graphing
        })

    def _format_bytes(self, bytes_value):
        """Format bytes to human readable string"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if bytes_value < 1024:
                return f"{bytes_value:.1f} {unit}"
            bytes_value /= 1024
        return f"{bytes_value:.1f} TB"