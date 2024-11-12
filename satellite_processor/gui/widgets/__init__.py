"""
Widget modules for the satellite processor GUI.
"""

from .log_widget import LogWidget
from .graphing_widget import GraphingWidget
from .network_widget import NetworkWidget
from .system_monitor_widget import SystemMonitorWidget
from .processing_options import ProcessingOptionsWidget

__all__ = [
    'LogWidget',
    'GraphingWidget',
    'NetworkWidget',
    'SystemMonitorWidget',
    'ProcessingOptionsWidget'
]