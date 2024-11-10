# satellite_processor/gui/widgets/__init__.py
from .graphing_widget import GraphingWidget
from .processing_options import ProcessingOptionsWidget
from .status_widget import StatusWidget
from .progress_widget import ProgressWidget
from .resource_monitor_widget import ResourceMonitorWidget
from .network_widget import NetworkWidget
from .log_widget import LogWidget

__all__ = [
    'GraphingWidget',
    'ProcessingOptionsWidget',
    'StatusWidget',
    'ProgressWidget',
    'ResourceMonitorWidget',
    'NetworkWidget',
    'LogWidget'
]