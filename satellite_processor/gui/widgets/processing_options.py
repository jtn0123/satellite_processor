# satellite_processor/gui/widgets/processing_options.py
from PyQt6.QtWidgets import ( # type: ignore
    QGroupBox, QVBoxLayout, QHBoxLayout,
    QLabel, QSpinBox, QCheckBox, QComboBox, QWidget, QSizePolicy, QLineEdit, QPushButton, QFileDialog
)
from PyQt6.QtCore import Qt # type: ignore

from PyQt6.QtWidgets import (
    QGroupBox, QVBoxLayout, QHBoxLayout, QLabel,
    QCheckBox, QSpinBox, QComboBox, QGridLayout
)

class ProcessingOptionsWidget(QGroupBox):
    """Widget for image processing options"""

    def __init__(self, parent: QWidget = None) -> None:
        super().__init__("Processing Options", parent)
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout()
        self.init_crop_controls(layout)
        self.init_other_controls(layout)
        
        # Ensure input and output directory fields are accessible
        self.input_dir = QLineEdit()
        self.output_dir = QLineEdit()
        
        # Input Directory
        input_layout = QHBoxLayout()
        input_label = QLabel("Input Directory:")
        self.input_dir.setReadOnly(True)
        input_browse = QPushButton("Browse")
        input_browse.clicked.connect(self.browse_input)
        input_layout.addWidget(input_label)
        input_layout.addWidget(self.input_dir)
        input_layout.addWidget(input_browse)
        layout.addLayout(input_layout)
        
        # Output Directory
        output_layout = QHBoxLayout()
        output_label = QLabel("Output Directory:")
        self.output_dir.setReadOnly(True)
        output_browse = QPushButton("Browse")
        output_browse.clicked.connect(self.browse_output)
        output_layout.addWidget(output_label)
        output_layout.addWidget(self.output_dir)
        output_layout.addWidget(output_browse)
        layout.addLayout(output_layout)
        
        self.setLayout(layout)

    def init_crop_controls(self, parent_layout):
        crop_group = QGroupBox("Crop Settings")
        crop_layout = QGridLayout()

        # Create crop controls
        self.crop_checkbox = QCheckBox("Enable Cropping")
        self.crop_x = QSpinBox()
        self.crop_y = QSpinBox()
        self.crop_width = QSpinBox()
        self.crop_height = QSpinBox()

        # Configure spinboxes
        for spinbox in [self.crop_x, self.crop_y, self.crop_width, self.crop_height]:
            spinbox.setRange(0, 10000)
            spinbox.setEnabled(False)

        # Layout
        crop_layout.addWidget(self.crop_checkbox, 0, 0, 1, 4)
        crop_layout.addWidget(QLabel("X:"), 1, 0)
        crop_layout.addWidget(self.crop_x, 1, 1)
        crop_layout.addWidget(QLabel("Y:"), 1, 2)
        crop_layout.addWidget(self.crop_y, 1, 3)
        crop_layout.addWidget(QLabel("Width:"), 2, 0)
        crop_layout.addWidget(self.crop_width, 2, 1)
        crop_layout.addWidget(QLabel("Height:"), 2, 2)
        crop_layout.addWidget(self.crop_height, 2, 3)

        # Connect checkbox
        self.crop_checkbox.toggled.connect(self.toggle_crop_controls)

        crop_group.setLayout(crop_layout)
        parent_layout.addWidget(crop_group)

    def toggle_crop_controls(self, enabled):
        self.crop_x.setEnabled(enabled)
        self.crop_y.setEnabled(enabled)
        self.crop_width.setEnabled(enabled)
        self.crop_height.setEnabled(enabled)

    def init_other_controls(self, parent_layout):
        """Initialize non-crop related controls"""
        
        # False Color Option
        self.false_color_check = QCheckBox("Apply False Color")
        parent_layout.addWidget(self.false_color_check)

        # Upscale Options
        upscale_group = QGroupBox("Upscaling")
        upscale_layout = QVBoxLayout()
        
        # Upscale checkbox and method
        self.upscale_check = QCheckBox("Enable Upscaling")
        upscale_layout.addWidget(self.upscale_check)
        
        method_layout = QHBoxLayout()
        method_layout.addWidget(QLabel("Method:"))
        self.upscale_method = QComboBox()
        self.upscale_method.addItems(["Lanczos", "Bicubic", "Bilinear"])
        method_layout.addWidget(self.upscale_method)
        upscale_layout.addLayout(method_layout)
        
        # Scale factor
        scale_layout = QHBoxLayout()
        scale_layout.addWidget(QLabel("Scale Factor:"))
        self.scale_factor = QSpinBox()
        self.scale_factor.setRange(1, 4)
        self.scale_factor.setValue(2)
        scale_layout.addWidget(self.scale_factor)
        upscale_layout.addLayout(scale_layout)
        
        # Target width
        width_layout = QHBoxLayout()
        width_layout.addWidget(QLabel("Target Width:"))
        self.target_width = QSpinBox()
        self.target_width.setRange(100, 10000)
        self.target_width.setValue(1920)
        width_layout.addWidget(self.target_width)
        upscale_layout.addLayout(width_layout)
        
        upscale_group.setLayout(upscale_layout)
        parent_layout.addWidget(upscale_group)
        
        # Interpolation Option
        self.interpolation = QCheckBox("Enable Interpolation")
        parent_layout.addWidget(self.interpolation)

    def get_options(self) -> dict:
        """Get current processing options"""
        return {
            'crop_enabled': self.crop_checkbox.isChecked(),
            'crop_x': self.crop_x.value(),
            'crop_y': self.crop_y.value(),
            'crop_width': self.crop_width.value(),
            'crop_height': self.crop_height.value(),
            'false_color': self.false_color_check.isChecked(),
            'upscale_enabled': self.upscale_check.isChecked(),
            'upscale_type': self.upscale_method.currentText(),
            'scale_factor': self.scale_factor.value(),
            'target_width': self.target_width.value(),
            'interpolation': self.interpolation.isChecked()
        }

    def browse_input(self):
        """Browse for input directory."""
        dir_path = QFileDialog.getExistingDirectory(self, "Select Input Directory")
        if dir_path:
            self.input_dir.setText(dir_path)
            self.parent().input_entry.setText(dir_path)  # Update main window's input_entry

    def browse_output(self):
        """Browse for output directory."""
        dir_path = QFileDialog.getExistingDirectory(self, "Select Output Directory")
        if dir_path:
            self.output_dir.setText(dir_path)
            self.parent().output_entry.setText(dir_path)  # Update main window's output_entry