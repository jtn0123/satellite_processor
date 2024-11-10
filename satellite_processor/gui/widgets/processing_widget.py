from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QGroupBox, QLabel,
    QCheckBox, QSpinBox, QDoubleSpinBox, QComboBox,
    QGridLayout
)
from PyQt6.QtCore import pyqtSignal  # Add this import

class ProcessingWidget(QWidget):
    finished = pyqtSignal()  # Add this signal

    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()
        
    def init_ui(self):
        layout = QVBoxLayout()
        
        # Crop settings
        self.crop_group = QGroupBox("Crop Settings")
        crop_layout = QGridLayout()
        
        self.crop_checkbox = QCheckBox("Enable Cropping")
        self.crop_checkbox.toggled.connect(self.toggle_crop_controls)
        crop_layout.addWidget(self.crop_checkbox, 0, 0, 1, 2)
        
        # Crop coordinates
        crop_layout.addWidget(QLabel("X:"), 1, 0)
        self.crop_x = QSpinBox()
        self.crop_x.setRange(0, 10000)
        crop_layout.addWidget(self.crop_x, 1, 1)
        
        crop_layout.addWidget(QLabel("Y:"), 2, 0)
        self.crop_y = QSpinBox()
        self.crop_y.setRange(0, 10000)
        crop_layout.addWidget(self.crop_y, 2, 1)
        
        crop_layout.addWidget(QLabel("Width:"), 3, 0)
        self.crop_width = QSpinBox()
        self.crop_width.setRange(1, 10000)
        crop_layout.addWidget(self.crop_width, 3, 1)
        
        crop_layout.addWidget(QLabel("Height:"), 4, 0)
        self.crop_height = QSpinBox()
        self.crop_height.setRange(1, 10000)
        crop_layout.addWidget(self.crop_height, 4, 1)
        
        self.crop_group.setLayout(crop_layout)
        layout.addWidget(self.crop_group)
        
        # Image processing options
        self.false_color = QCheckBox("Enable False Color")
        layout.addWidget(self.false_color)
        
        self.interpolation = QCheckBox("Enable Frame Interpolation")
        layout.addWidget(self.interpolation)
        
        self.setLayout(layout)
        
        # Initially disable crop controls
        self.toggle_crop_controls(False)
        
    def toggle_crop_controls(self, enabled: bool):
        """Enable/disable crop controls"""
        self.crop_x.setEnabled(enabled)
        self.crop_y.setEnabled(enabled)
        self.crop_width.setEnabled(enabled)
        self.crop_height.setEnabled(enabled)
        
    def get_options(self) -> dict:
        """Get current processing options"""
        return {
            'crop_enabled': self.crop_checkbox.isChecked(),
            'crop_x': self.crop_x.value(),
            'crop_y': self.crop_y.value(),
            'crop_width': self.crop_width.value(),
            'crop_height': self.crop_height.value(),
            'false_color': self.false_color.isChecked(),
            'interpolation': self.interpolation.isChecked()
        }

    def start_processing(self):
        """Start processing tasks"""
        # ...processing logic...
        # After processing is done:
        self.finished.emit()  # Emit the finished signal