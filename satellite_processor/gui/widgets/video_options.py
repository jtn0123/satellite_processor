# satellite_processor/satellite_processor/gui/widgets/video_options.py
from PyQt6.QtWidgets import ( # type: ignore
    QGroupBox, QVBoxLayout, QHBoxLayout,
    QLabel, QSpinBox, QComboBox, QCheckBox, QWidget
)
from PyQt6.QtCore import Qt # type: ignore

class VideoOptionsWidget(QGroupBox):
    """Widget for video encoding options"""
    
    def __init__(self, parent: QWidget = None) -> None:
        super().__init__("Video Options", parent)
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout()
        
        # FPS Options
        fps_layout = QHBoxLayout()
        self.fps_label = QLabel("FPS:")
        self.fps_spinbox = QSpinBox()
        self.fps_spinbox.setRange(1, 60)
        self.fps_spinbox.setValue(30)
        fps_layout.addWidget(self.fps_label)
        fps_layout.addWidget(self.fps_spinbox)
        
        # Hardware Selection
        hardware_layout = QHBoxLayout()
        self.hardware_label = QLabel("Processing Hardware:")
        self.hardware_combo = QComboBox()
        self.hardware_combo.addItems([
            "NVIDIA GPU (CUDA)",
            "Intel GPU (QSV)",
            "AMD GPU (AMF)",
            "CPU (Software)"
        ])
        hardware_layout.addWidget(self.hardware_label)
        hardware_layout.addWidget(self.hardware_combo)
        
        # Interpolation Options
        interp_group = QGroupBox("Interpolation")
        interp_layout = QVBoxLayout()
        
        # Enable checkbox
        self.enable_interpolation = QCheckBox("Enable Frame Interpolation")
        self.enable_interpolation.setChecked(True)
        interp_layout.addWidget(self.enable_interpolation)
        
        # Quality combo
        quality_layout = QHBoxLayout()
        self.quality_label = QLabel("Quality:")
        self.quality_combo = QComboBox()
        self.quality_combo.addItems(["High", "Medium", "Low"])
        quality_layout.addWidget(self.quality_label)
        quality_layout.addWidget(self.quality_combo)
        interp_layout.addLayout(quality_layout)
        
        # Factor spinbox 
        factor_layout = QHBoxLayout()
        self.factor_label = QLabel("Interpolation Factor:")
        self.factor_spin = QSpinBox()
        self.factor_spin.setRange(2, 8)
        self.factor_spin.setValue(2)
        self.factor_spin.setSuffix("x")
        factor_layout.addWidget(self.factor_label)
        factor_layout.addWidget(self.factor_spin)
        interp_layout.addLayout(factor_layout)
        
        interp_group.setLayout(interp_layout)
        
        # Encoder Options 
        encoder_layout = QHBoxLayout()
        self.encoder_label = QLabel("Encoder:")
        self.encoder_combo = QComboBox()
        self.encoder_combo.addItems([
            "H.264 (Maximum Compatibility)", 
            "HEVC/H.265 (Better Compression)",
            "AV1 (Best Quality)"
        ])
        encoder_layout.addWidget(self.encoder_label)
        encoder_layout.addWidget(self.encoder_combo)
        
        # Add layouts to main layout
        layout.addLayout(fps_layout)
        layout.addLayout(hardware_layout)
        layout.addWidget(interp_group)
        layout.addLayout(encoder_layout)
        
        # Connect signals
        self.enable_interpolation.toggled.connect(self._on_interpolation_toggled)
        
        self.setLayout(layout)

    def _on_interpolation_toggled(self, enabled: bool):
        """Handle interpolation enable/disable"""
        self.quality_combo.setEnabled(enabled)
        self.factor_spin.setEnabled(enabled)

    def get_options(self) -> dict:
        """Get all video options as a dictionary"""
        return {
            'fps': self.fps_spinbox.value(),
            'hardware': self.hardware_combo.currentText(),
            'interpolation_enabled': self.enable_interpolation.isChecked(),
            'interpolation_quality': self.quality_combo.currentText().lower(),
            'interpolation_factor': self.factor_spin.value(),
            'encoder': self.encoder_combo.currentText()
        }
        
    @property
    def encoder(self):
        """Property to maintain compatibility with existing code"""
        return self.encoder_combo
        
    @property
    def fps(self):
        """Property to maintain compatibility with existing code"""
        return self.fps_spinbox