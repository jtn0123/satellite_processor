import logging
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGroupBox,
    QLabel, QCheckBox, QSpinBox, QDoubleSpinBox, QComboBox,
    QProgressBar, QTextEdit, QPushButton, QGridLayout
)
from PyQt6.QtCore import Qt

class ProcessingOptionsWidget(QGroupBox):
    def __init__(self):
        super().__init__("Processing Options")
        self.init_ui()
        print("ProcessingOptionsWidget attributes:", dir(self))

    def init_ui(self):
        layout = QVBoxLayout()

        # Initialize crop controls
        self.init_crop_controls(layout)

        # Initialize other controls
        self.init_other_controls(layout)

        self.setLayout(layout)

    def init_crop_controls(self, parent_layout):
        # Crop Group
        crop_group = QGroupBox("Crop Settings")
        crop_layout = QGridLayout()

        # Crop enable checkbox
        self.crop_checkbox = QCheckBox("Enable Cropping")
        self.crop_checkbox.toggled.connect(self.toggle_crop_controls)

        # Create crop controls
        self.crop_x = QSpinBox()
        self.crop_y = QSpinBox()
        self.crop_width = QSpinBox()
        self.crop_height = QSpinBox()

        # Set ranges and default values
        for spinbox in [self.crop_x, self.crop_y, self.crop_width, self.crop_height]:
            spinbox.setRange(0, 10000)
            spinbox.setValue(0)
            spinbox.setEnabled(False)  # Disabled by default

        # Arrange labels and controls in the grid layout
        crop_layout.addWidget(QLabel("X:"), 0, 0)
        crop_layout.addWidget(self.crop_x, 0, 1)
        crop_layout.addWidget(QLabel("Y:"), 0, 2)
        crop_layout.addWidget(self.crop_y, 0, 3)
        crop_layout.addWidget(QLabel("Width:"), 1, 0)
        crop_layout.addWidget(self.crop_width, 1, 1)
        crop_layout.addWidget(QLabel("Height:"), 1, 2)
        crop_layout.addWidget(self.crop_height, 1, 3)

        # Add checkbox and crop controls to the group layout
        crop_group_layout = QVBoxLayout()
        crop_group_layout.addWidget(self.crop_checkbox)
        crop_group_layout.addLayout(crop_layout)
        crop_group.setLayout(crop_group_layout)

        # Add crop group to the parent layout
        parent_layout.addWidget(crop_group)

    def toggle_crop_controls(self, enabled):
        """Enable or disable crop controls based on the checkbox state."""
        self.crop_x.setEnabled(enabled)
        self.crop_y.setEnabled(enabled)
        self.crop_width.setEnabled(enabled)
        self.crop_height.setEnabled(enabled)

    def init_other_controls(self, parent_layout):
        # False Color Option
        self.false_color_check = QCheckBox("Apply False Color")
        parent_layout.addWidget(self.false_color_check)

        # Upscale Options
        self.upscale_check = QCheckBox("Enable Upscaling")
        parent_layout.addWidget(self.upscale_check)

        upscale_layout = QHBoxLayout()
        upscale_layout.addWidget(QLabel("Upscale Method:"))
        self.upscale_method = QComboBox()
        self.upscale_method.addItems(["Lanczos", "Bicubic", "Bilinear"])
        upscale_layout.addWidget(self.upscale_method)
        parent_layout.addLayout(upscale_layout)

        # Scale Factor
        scale_factor_layout = QHBoxLayout()
        scale_factor_layout.addWidget(QLabel("Scale Factor:"))
        self.scale_factor = QSpinBox()
        self.scale_factor.setRange(1, 4)
        self.scale_factor.setValue(2)
        scale_factor_layout.addWidget(self.scale_factor)
        parent_layout.addLayout(scale_factor_layout)

        # Target Width
        target_width_layout = QHBoxLayout()
        target_width_layout.addWidget(QLabel("Target Width:"))
        self.target_width = QSpinBox()
        self.target_width.setRange(100, 10000)
        self.target_width.setValue(1920)
        target_width_layout.addWidget(self.target_width)
        parent_layout.addLayout(target_width_layout)

        # Interpolation Option
        self.interpolation = QCheckBox("Enable Interpolation")
        parent_layout.addWidget(self.interpolation)

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

class ProgressWidget(QGroupBox):
    def __init__(self):
        super().__init__("Progress")
        self.init_ui()
        
    def init_ui(self):
        layout = QVBoxLayout()
        
        # Overall progress
        self.overall_progress = QProgressBar()
        layout.addWidget(QLabel("Overall Progress:"))
        layout.addWidget(self.overall_progress)
        
        # Current operation progress
        self.operation_progress = QProgressBar()
        layout.addWidget(QLabel("Current Operation:"))
        layout.addWidget(self.operation_progress)
        
        # Network activity indicator
        self.network_indicator = QLabel("Network Activity: Idle")
        layout.addWidget(self.network_indicator)
        
        # Status log
        self.status_log = QTextEdit()
        self.status_log.setReadOnly(True)
        self.status_log.setMaximumHeight(100)
        layout.addWidget(QLabel("Status Log:"))
        layout.addWidget(self.status_log)
        
        self.setLayout(layout)