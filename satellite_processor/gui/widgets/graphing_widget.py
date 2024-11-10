from PyQt6.QtWidgets import QWidget, QVBoxLayout
from PyQt6.QtGui import QColor
import pyqtgraph as pg
import numpy as np
from collections import deque
import logging

class GraphingWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.logger = logging.getLogger(__name__)
        
        # Initialize data structures for CPU/Memory only
        self.max_points = 100
        self.cpu_data = deque([0]*self.max_points, maxlen=self.max_points)
        self.memory_data = deque([0]*self.max_points, maxlen=self.max_points)
        
        self._setup_ui()
        
    def _setup_ui(self):
        layout = QVBoxLayout(self)
        
        # Set dark theme colors
        pg.setConfigOption('background', '#1e1e1e')
        pg.setConfigOption('foreground', 'w')
        
        # Create resource plot with tooltip
        self.resource_plot = pg.PlotWidget(title="CPU & Memory Usage")
        self.resource_plot.setToolTip("Shows real-time CPU (red) and Memory (blue) usage")
        self.resource_plot.setLabel('left', 'Percentage', units='%')
        self.resource_plot.setLabel('bottom', 'Time (s)')
        self.resource_plot.showGrid(x=True, y=True, alpha=0.3)
        self.resource_plot.setYRange(0, 100)
        
        # Create plot curves with tooltips
        self.cpu_curve = self.resource_plot.plot(pen=(255, 0, 0), name='CPU')  # Red
        self.cpu_curve.setToolTip("CPU Usage (%)")
        self.memory_curve = self.resource_plot.plot(pen=(0, 0, 255), name='Memory')  # Blue
        self.memory_curve.setToolTip("Memory Usage (%)")
        
        # Add legend with tooltip
        legend = self.resource_plot.addLegend()
        legend.setToolTip("Click to show/hide curves")
        
        # Add plot to layout
        layout.addWidget(self.resource_plot)
        
    def update_resource_graph(self, stats):
        """Update CPU and memory graphs"""
        try:
            # Ensure values are numeric
            cpu_value = float(stats.get('cpu', 0)) if isinstance(stats.get('cpu'), (int, float, str)) else 0
            memory_value = float(stats.get('memory', 0)) if isinstance(stats.get('memory'), (int, float, str)) else 0
            
            # Update data
            self.cpu_data.append(cpu_value)
            self.memory_data.append(memory_value)
            
            # Update plots
            x_data = list(range(len(self.cpu_data)))
            self.cpu_curve.setData(x_data, list(self.cpu_data))
            self.memory_curve.setData(x_data, list(self.memory_data))
            
        except Exception as e:
            self.logger.error(f"Error updating resource graph: {e}", exc_info=True)

    def start_graph_update(self):
        """Initialize graph"""
        self.resource_plot.setXRange(0, self.max_points)
        self.resource_plot.setYRange(0, 100)

    def update_network_activity(self, stats: dict):
        """Update network activity graph with new data"""
        try:
            if 'network_sent' in stats and 'network_recv' in stats:
                sent = stats['network_sent'] / 1024  # Convert to KB/s
                recv = stats['network_recv'] / 1024
                # Update graph data
                self.network_sent_data.append(sent)
                self.network_recv_data.append(recv)
                # Keep only last N points
                max_points = 100
                self.network_sent_data = self.network_sent_data[-max_points:]
                self.network_recv_data = self.network_recv_data[-max_points:]
                self.update_graph()
        except Exception as e:
            logging.error(f"Error updating network activity: {e}")