"""
Widget modules for the satellite processor GUI.
"""

from .log_widget import LogWidget
from .network_widget import NetworkWidget
from .progress_widget import ProgressWidget
from .processing_options import ProcessingOptionsWidget
from .system_monitor_widget import SystemMonitorWidget
from .graphing_widget import GraphingWidget  # Add this line if not already present

__all__ = [
    'LogWidget',
    'NetworkWidget',
    'ProgressWidget',
    'ProcessingOptionsWidget',
    'SystemMonitorWidget',
    'GraphingWidget'  # Add this line if not already present
]