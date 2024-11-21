"""
Widget for configuring satellite image processing options.
Provides controls for input/output directories, video settings, cropping,
scaling, timestamps, and advanced features like false color and frame interpolation.
"""

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QFormLayout, QSpinBox, QDoubleSpinBox,
    QCheckBox, QLineEdit, QPushButton, QFileDialog, QGroupBox, QComboBox
)
import logging
from ...utils.utils import load_config, save_config

logger = logging.getLogger(__name__)

class ProcessingOptionsWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.logger = logging.getLogger(__name__)
        
        # Initialize UI first
        self.setup_ui()
        # Then load settings
        self.load_settings()

    def setup_ui(self):
        """Initialize the UI components"""
        layout = QVBoxLayout(self)
        form_layout = QFormLayout()
        
        # Processing Options
        self.crop_enabled = QCheckBox("Enable Cropping")
        self.crop_x = QSpinBox()
        self.crop_y = QSpinBox()
        self.crop_width = QSpinBox()
        self.crop_height = QSpinBox()
        
        # Configure spin boxes
        for spin in [self.crop_x, self.crop_y, self.crop_width, self.crop_height]:
            spin.setRange(0, 10000)
            spin.setValue(0)
        
        # Add timestamp option
        self.add_timestamp = QCheckBox("Add Timestamp")
        self.add_timestamp.setChecked(True)
        
        # Video settings group
        video_group = QGroupBox("Video Settings")
        video_layout = QFormLayout()
        
        self.fps_spin = QSpinBox()
        self.fps_spin.setRange(1, 60)
        self.fps_spin.setValue(30)
        
        self.codec_combo = QComboBox()
        self.codec_combo.addItems([
            "H.264 (Maximum Compatibility)",
            "HEVC/H.265 (Better Compression)",
            "AV1 (Best Quality)"
        ])
        
        self.hardware_combo = QComboBox()
        self.hardware_combo.addItems([
            "CPU",
            "NVIDIA GPU (NVENC)",
            "AMD GPU (AMF)",
            "Intel GPU (QSV)"
        ])
        
        self.frame_duration_spin = QDoubleSpinBox()
        self.frame_duration_spin.setRange(0.1, 10.0)
        self.frame_duration_spin.setValue(1.0)
        self.frame_duration_spin.setSingleStep(0.1)
        self.frame_duration_spin.setSuffix(" sec")
        
        video_layout.addRow("FPS:", self.fps_spin)
        video_layout.addRow("Codec:", self.codec_combo)
        video_layout.addRow("Hardware:", self.hardware_combo)
        video_layout.addRow("Frame Duration:", self.frame_duration_spin)
        video_group.setLayout(video_layout)
        
        # Add to layout
        form_layout.addRow("Crop X:", self.crop_x)
        form_layout.addRow("Crop Y:", self.crop_y)
        form_layout.addRow("Width:", self.crop_width)
        form_layout.addRow("Height:", self.crop_height)
        
        layout.addWidget(self.crop_enabled)
        layout.addLayout(form_layout)
        layout.addWidget(self.add_timestamp)
        layout.addWidget(video_group)
        
        # Add Sanchez (False Color) Group
        sanchez_group = QGroupBox("False Color Settings")
        sanchez_layout = QFormLayout()
        
        self.enable_false_color = QCheckBox("Enable False Color")
        self.sanchez_method = QComboBox()
        self.sanchez_method.addItems([
            "Standard",
            "Enhanced",
            "Natural",
            "Fire"
        ])
        
        # Connect signals
        self.enable_false_color.toggled.connect(self._on_false_color_toggled)
        self.sanchez_method.currentTextChanged.connect(self._on_method_changed)
        
        sanchez_layout.addRow(self.enable_false_color)
        sanchez_layout.addRow("Method:", self.sanchez_method)
        sanchez_group.setLayout(sanchez_layout)
        layout.addWidget(sanchez_group)
        
        # Update Interpolation Group with new options
        interp_group = QGroupBox("Interpolation Settings")
        interp_layout = QFormLayout()
        
        self.enable_interpolation = QCheckBox("Enable Frame Interpolation")
        self.interp_method = QComboBox()
        self.interp_method.addItems([
            "Motion Compensated (MCI)",
            "Bidirectional",
            "Advanced Optical Flow"
        ])
        
        self.interp_quality = QComboBox()
        self.interp_quality.addItems([
            "High (Best Quality)",
            "Medium (Balanced)",
            "Low (Faster)"
        ])
        
        self.interp_factor = QSpinBox()
        self.interp_factor.setRange(2, 8)
        self.interp_factor.setValue(2)
        self.interp_factor.setSuffix("x")
        
        # Disable controls by default
        self.interp_method.setEnabled(False)
        self.interp_quality.setEnabled(False)
        self.interp_factor.setEnabled(False)
        
        # Connect signals
        self.enable_interpolation.toggled.connect(self._on_interpolation_toggled)
        
        interp_layout.addRow(self.enable_interpolation)
        interp_layout.addRow("Method:", self.interp_method)
        interp_layout.addRow("Quality:", self.interp_quality)
        interp_layout.addRow("Factor:", self.interp_factor)
        interp_group.setLayout(interp_layout)
        layout.addWidget(interp_group)
        
        layout.addStretch()

    def load_settings(self):
        """Load settings from config"""
        try:
            settings = load_config()
            
            # Load processing options
            options = settings.get('processing_options', {})
            self.crop_enabled.setChecked(options.get('crop_enabled', False))
            self.crop_x.setValue(options.get('crop_x', 0))
            self.crop_y.setValue(options.get('crop_y', 0))
            self.crop_width.setValue(options.get('crop_width', 1920))
            self.crop_height.setValue(options.get('crop_height', 1080))
            self.add_timestamp.setChecked(options.get('add_timestamp', True))
            
            # Load video options
            self.fps_spin.setValue(options.get('fps', 30))
            self.codec_combo.setCurrentText(options.get('codec', 'H.264 (Maximum Compatibility)'))
            self.hardware_combo.setCurrentText(options.get('hardware', 'CPU'))
            self.frame_duration_spin.setValue(options.get('frame_duration', 1.0))
            
            # Sanchez options
            self.enable_false_color.setChecked(options.get('false_color_enabled', False))
            self.sanchez_method.setCurrentText(options.get('false_color_method', 'Standard'))
            
            # Interpolation options
            self.enable_interpolation.setChecked(options.get('interpolation_enabled', False))
            self.interp_method.setCurrentText(options.get('interpolation_method', 'Linear'))
            self.interp_factor.setValue(options.get('interpolation_factor', 2))
            
        except Exception as e:
            self.logger.error(f"Error loading settings: {e}")

    def load_options(self, options: dict):
        """Load processing options"""
        try:
            # Processing options
            self.crop_enabled.setChecked(options.get('crop_enabled', False))
            self.add_timestamp.setChecked(options.get('add_timestamp', True))
            
            # Video options
            self.fps_spin.setValue(options.get('fps', 30))
            self.codec_combo.setCurrentText(options.get('codec', 'H.264 (Maximum Compatibility)'))
            self.hardware_combo.setCurrentText(options.get('hardware', 'CPU'))
            self.frame_duration_spin.setValue(options.get('frame_duration', 1.0))
            
            # Sanchez options
            self.enable_false_color.setChecked(options.get('false_color_enabled', False))
            self.sanchez_method.setCurrentText(options.get('false_color_method', 'Standard'))
            
            # Interpolation options
            self.enable_interpolation.setChecked(options.get('interpolation_enabled', False))
            self.interp_method.setCurrentText(options.get('interpolation_method', 'Motion Compensated (MCI)'))
            
            # Handle quality setting
            quality = options.get('interpolation_quality', 'medium')
            quality_map = {'high': 'High (Best Quality)', 
                         'medium': 'Medium (Balanced)', 
                         'low': 'Low (Faster)'}
            self.interp_quality.setCurrentText(quality_map.get(quality, 'Medium (Balanced)'))
            
            self.interp_factor.setValue(options.get('interpolation_factor', 2))
            
            # Update enabled states
            self._on_interpolation_toggled(options.get('interpolation_enabled', False))
            
        except Exception as e:
            self.logger.error(f"Error loading options: {e}")

    def get_options(self) -> dict:
        """Get current processing options"""
        options = {
            'crop_enabled': self.crop_enabled.isChecked(),
            'crop_x': self.crop_x.value(),
            'crop_y': self.crop_y.value(),
            'crop_width': self.crop_width.value(),
            'crop_height': self.crop_height.value(),
            'add_timestamp': self.add_timestamp.isChecked(),
            'fps': self.fps_spin.value(),
            'codec': self.codec_combo.currentText(),
            'hardware': self.hardware_combo.currentText(),
            'frame_duration': self.frame_duration_spin.value(),
            'false_color_enabled': self.enable_false_color.isChecked(),
            'false_color_method': self.sanchez_method.currentText(),
            'interpolation_enabled': self.enable_interpolation.isChecked(),
            'interpolation_method': self.interp_method.currentText(),
            'interpolation_quality': self.interp_quality.currentText().split()[0].lower(),  # Get just "high", "medium", or "low"
            'interpolation_factor': self.interp_factor.value()
        }
        
        # Add debug logging
        if options['false_color_enabled']:
            self.logger.info(f"False color is enabled with method: {options['false_color_method']}")
            
        return options

    def _on_false_color_toggled(self, enabled: bool):
        """Handle false color enable/disable"""
        self.sanchez_method.setEnabled(enabled)
        if enabled:
            self.logger.info(f"False color enabled with method: {self.sanchez_method.currentText()}")

    def _on_method_changed(self, method: str):
        """Handle false color method changes"""
        if self.enable_false_color.isChecked():
            self.logger.info(f"False color method changed to: {method}")

    def _on_interpolation_toggled(self, enabled: bool):
        """Handle interpolation enable/disable"""
        self.interp_method.setEnabled(enabled)
        self.interp_quality.setEnabled(enabled)
        self.interp_factor.setEnabled(enabled)
        if enabled:
            self.logger.info(
                f"Interpolation enabled: {self.interp_method.currentText()} "
                f"at {self.interp_quality.currentText()}"
            )