import logging
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGroupBox,
    QLabel, QCheckBox, QSpinBox, QDoubleSpinBox, QComboBox,
    QProgressBar, QTextEdit, QPushButton, QGridLayout
)
from PyQt6.QtCore import Qt
from ..core.processor import SatelliteImageProcessor  # Adjust the import path as necessary

class ProcessingOptionsWidget(QGroupBox):
    """Widget for processing options."""
    
    def __init__(self):
        super().__init__("Processing Options")
        self.init_ui()
        print("ProcessingOptionsWidget attributes:", dir(self))

    def init_ui(self):
        layout = QVBoxLayout()

        # Initialize crop controls
        self.init_crop_controls(layout)

        # Initialize other controls (remove upscale controls)
        self.init_other_controls(layout)

        # Overall Progress Bar (if not added in main_window.py)
        self.overall_progress_bar = QProgressBar()
        self.overall_progress_bar.setRange(0, 100)
        layout.addWidget(QLabel("Overall Progress"))
        layout.addWidget(self.overall_progress_bar)

        self.setLayout(layout)

        # Ensure all necessary attributes are initialized
        self.false_color_check = QCheckBox("Enable False Color")
        self.interpolation = QCheckBox("Enable Frame Interpolation")

    def init_crop_controls(self, parent_layout):
        # Crop Group
        crop_group = QGroupBox("Crop Settings")
        crop_layout = QGridLayout()

        # Crop enable checkbox
        self.crop_checkbox = QCheckBox("Enable Cropping")
        self.crop_checkbox.toggled.connect(self.toggle_crop_controls)
        crop_layout.addWidget(self.crop_checkbox, 0, 0, 1, 2)

        # Labels and spin boxes for crop parameters
        crop_layout.addWidget(QLabel("X:"), 1, 0)
        self.crop_x = QSpinBox()
        self.crop_x.setRange(0, 10000)
        self.crop_x.setValue(0)
        crop_layout.addWidget(self.crop_x, 1, 1)

        crop_layout.addWidget(QLabel("Y:"), 2, 0)
        self.crop_y = QSpinBox()
        self.crop_y.setRange(0, 10000)
        self.crop_y.setValue(0)
        crop_layout.addWidget(self.crop_y, 2, 1)

        crop_layout.addWidget(QLabel("Width:"), 3, 0)
        self.crop_width = QSpinBox()
        self.crop_width.setRange(1, 10000)
        self.crop_width.setValue(640)
        crop_layout.addWidget(self.crop_width, 3, 1)

        crop_layout.addWidget(QLabel("Height:"), 4, 0)
        self.crop_height = QSpinBox()
        self.crop_height.setRange(1, 10000)
        self.crop_height.setValue(480)
        crop_layout.addWidget(self.crop_height, 4, 1)

        crop_group.setLayout(crop_layout)
        parent_layout.addWidget(crop_group)

        # Initially disable crop controls
        self.toggle_crop_controls(False)

    def toggle_crop_controls(self, enabled):
        self.crop_x.setEnabled(enabled)
        self.crop_y.setEnabled(enabled)
        self.crop_width.setEnabled(enabled)
        self.crop_height.setEnabled(enabled)

    def init_other_controls(self, parent_layout):
        # Remove upscale options group completely
        pass  # Add any other controls you want to keep here

    def some_widget_method(self):
        # ...existing code...
        if self.parent() and getattr(self.parent(), '_is_closing', False):
            # Handle accordingly
            pass
        # ...existing code...
        options = {
            'input_dir': self.input_dir,
            'output_dir': self.output_dir,
            # Add other necessary options here
        }
        processor = SatelliteImageProcessor(options=options, parent=self)
        # ...existing code...

class VideoOptionsWidget(QGroupBox):
    def __init__(self):
        super().__init__("Video Options")
        self.init_ui()
        
    def init_ui(self):
        layout = QVBoxLayout()
        
        # Encoder selection
        encoder_layout = QHBoxLayout()
        encoder_label = QLabel("Encoder:")
        self.encoder = QComboBox()
        self.encoder.addItems([
            "H.264 (Maximum Compatibility)",
            "HEVC/H.265 (Better Compression)",
            "AV1 (Best Quality)"
        ])
        encoder_layout.addWidget(encoder_label)
        encoder_layout.addWidget(self.encoder)
        layout.addLayout(encoder_layout)
        
        # FPS and interpolation
        fps_layout = QHBoxLayout()
        fps_label = QLabel("FPS:")
        self.fps = QSpinBox()
        self.fps.setRange(1, 60)
        self.fps.setValue(30)
        
        self.interpolation = QCheckBox("Enable Frame Interpolation")
        
        fps_layout.addWidget(fps_label)
        fps_layout.addWidget(self.fps)
        fps_layout.addWidget(self.interpolation)
        layout.addLayout(fps_layout)
        
        # Quality settings
        quality_layout = QHBoxLayout()
        quality_label = QLabel("Quality Preset:")
        self.quality_preset = QComboBox()
        self.quality_preset.addItems(["High", "Medium", "Low"])
        quality_layout.addWidget(quality_label)
        quality_layout.addWidget(self.quality_preset)
        layout.addLayout(quality_layout)
        
        self.setLayout(layout)

    def get_options(self):
        """Get current video options"""
        return {
            'encoder': self.encoder.currentText(),
            'fps': self.fps.value(),
            'interpolation': self.interpolation.isChecked(),
            'quality_preset': self.quality_preset.currentText()
        }

class ProgressWidget(QWidget):
    """Custom Progress Bar Widget"""

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout()
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 100)
        layout.addWidget(QLabel("Processing Progress"))
        layout.addWidget(self.progress_bar)
        self.setLayout(layout)

    def update_progress(self, value: int):
        self.progress_bar.setValue(value)