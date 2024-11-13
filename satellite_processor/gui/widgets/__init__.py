"""
Widget modules for the satellite processor GUI.
"""

from .log_widget import LogWidget
from .network_widget import NetworkWidget
from .system_monitor_widget import SystemMonitorWidget
from .processing_options import ProcessingOptionsWidget

__all__ = [
    'SystemMonitorWidget',
    'NetworkWidget',
    'LogWidget',
    'ProcessingOptionsWidget'
]