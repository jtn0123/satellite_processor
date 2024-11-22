# satellite_processor/satellite_processor/gui/widgets/video_options.py
from PyQt6.QtWidgets import ( # type: ignore
    QGroupBox, QVBoxLayout, QHBoxLayout,
    QLabel, QSpinBox, QComboBox, QCheckBox, QWidget, QPushButton
)
from PyQt6.QtCore import Qt # type: ignore

class VideoOptionsWidget(QGroupBox):
    """Widget for video encoding options"""
    
    def __init__(self, parent: QWidget = None) -> None:
        super().__init__(parent)
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
        layout.addLayout(fps_layout)
        
        # Hardware Selection
        hardware_layout = QHBoxLayout()
        self.hardware_label = QLabel("Processing Hardware:")
        self.hardware_combo = QComboBox()
        self.hardware_combo.addItems(["NVIDIA GPU (CUDA)", "Intel GPU", "AMD GPU", "CPU"])
        hardware_layout.addWidget(self.hardware_label)
        hardware_layout.addWidget(self.hardware_combo)
        layout.addLayout(hardware_layout)
        
        # Encoder Selection
        encoder_layout = QHBoxLayout()
        self.encoder_label = QLabel("Encoder:")
        self.encoder_combo = QComboBox()
        self.encoder_combo.addItems(["H.264", "HEVC", "AV1"])
        encoder_layout.addWidget(self.encoder_label)
        encoder_layout.addWidget(self.encoder_combo)
        layout.addLayout(encoder_layout)
        
        # Interpolation Options
        interpolation_layout = QHBoxLayout()
        self.enable_interpolation = QCheckBox("Enable Interpolation")
        self.enable_interpolation.setChecked(True)
        interpolation_layout.addWidget(self.enable_interpolation)
        
        self.quality_label = QLabel("Quality:")
        self.quality_combo = QComboBox()
        self.quality_combo.addItems(["High", "Medium", "Low"])
        interpolation_layout.addWidget(self.quality_label)
        interpolation_layout.addWidget(self.quality_combo)
        
        self.factor_label = QLabel("Factor:")
        self.factor_spin = QSpinBox()
        self.factor_spin.setRange(2, 8)
        self.factor_spin.setValue(2)
        interpolation_layout.addWidget(self.factor_label)
        interpolation_layout.addWidget(self.factor_spin)
        layout.addLayout(interpolation_layout)
        
        # Reset Button
        self.reset_button = QPushButton("Reset to Defaults")
        layout.addWidget(self.reset_button)
        
        self.setLayout(layout)
        
        # Connect signals
        self.enable_interpolation.stateChanged.connect(self.on_interpolation_toggled)
        self.quality_combo.currentTextChanged.connect(self.on_quality_changed)
        self.reset_button.clicked.connect(self.reset_to_defaults)
        
        # Initialize UI state
        self.on_interpolation_toggled(self.enable_interpolation.isChecked())
    
    def on_interpolation_toggled(self, state):
        enabled = state == Qt.Checked
        self.quality_combo.setEnabled(enabled)
        self.factor_spin.setEnabled(enabled)
    
    def on_quality_changed(self, text):
        if text == "High":
            self.factor_spin.setRange(2, 8)
        elif text == "Medium":
            self.factor_spin.setRange(2, 6)
        elif text == "Low":
            self.factor_spin.setRange(2, 4)
        # Adjust current value if it exceeds new maximum
        if self.factor_spin.value() > self.factor_spin.maximum():
            self.factor_spin.setValue(self.factor_spin.maximum())
    
    def get_options(self) -> dict:
        return {
            'fps': self.fps_spinbox.value(),
            'hardware': self.hardware_combo.currentText(),
            'encoder': self.encoder_combo.currentText(),
            'interpolation_enabled': self.enable_interpolation.isChecked(),
            'interpolation_quality': self.quality_combo.currentText(),
            'interpolation_factor': self.factor_spin.value(),
        }
    
    def reset_to_defaults(self):
        self.fps_spinbox.setValue(30)
        self.hardware_combo.setCurrentIndex(0)
        self.encoder_combo.setCurrentIndex(0)
        self.enable_interpolation.setChecked(True)
        self.quality_combo.setCurrentIndex(0)
        self.factor_spin.setValue(2)

    @property
    def encoder(self):
        """Property to maintain compatibility with existing code"""
        return self.encoder_combo
        
    @property
    def fps(self):
        """Property to maintain compatibility with existing code"""
        return self.fps_spinbox

    def some_function(self):
        from satellite_processor.core.processor import SatelliteImageProcessor  # Moved import if needed
        # ...use SatelliteImageProcessor here...