from .main_window import SatelliteProcessorGUI
from .image_preview import ImagePreviewDialog
from PyQt6.QtCore import pyqtSignal
from PyQt6.QtWidgets import QMainWindow

__all__ = ["SatelliteProcessorGUI", "ImagePreviewDialog"]

# Remove the following redundant class definition
# class SatelliteProcessorGUI(QMainWindow):
#     status_update = pyqtSignal(str)

#     def __init__(self, parent=None):
#         super().__init__(parent)
#         self.init_ui()

#     def init_ui(self):
#         # Placeholder implementation
#         pass
