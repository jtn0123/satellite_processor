# satellite_processor/gui/widgets/__init__.py
from .video_options import VideoOptionsWidget
from .processing_options import ProcessingOptionsWidget
try:
    from .progress import ProgressWidget
except ImportError:
    ProgressWidget = None

__all__ = [
    'VideoOptionsWidget',
    'ProcessingOptionsWidget',
    'ProgressWidget'
]