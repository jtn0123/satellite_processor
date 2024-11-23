# satellite_processor/satellite_processor/gui/widgets/video_options.py
from PyQt6.QtWidgets import ( # type: ignore
    QGroupBox, QVBoxLayout, QHBoxLayout,
    QLabel, QSpinBox, QComboBox, QCheckBox, QWidget, QPushButton, QLineEdit
)
from PyQt6.QtCore import Qt # type: ignore
from PyQt6.QtWidgets import QApplication # type: ignore

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
        self.fps_spinbox.setRange(1, 60)  # Set minimum FPS to 1 to align with tests
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
        self.hardware_combo.currentTextChanged.connect(self.update_encoder_options)
        self.update_encoder_options(self.hardware_combo.currentText())
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
        
        # Bitrate Options
        bitrate_layout = QHBoxLayout()
        self.bitrate_label = QLabel("Bitrate (kbps):")
        self.bitrate_spin = QSpinBox()
        self.bitrate_spin.setRange(100, 10000)  # Bitrate range
        self.bitrate_spin.setValue(5000)  # Default bitrate
        bitrate_layout.addWidget(self.bitrate_label)
        bitrate_layout.addWidget(self.bitrate_spin)
        layout.addLayout(bitrate_layout)
        
        # Reset Button
        self.reset_button = QPushButton("Reset to Defaults")
        layout.addWidget(self.reset_button)
        
        self.setLayout(layout)
        
        # Connect signals
        self.enable_interpolation.toggled.connect(self.on_interpolation_toggled)
        self.quality_combo.currentTextChanged.connect(self.on_quality_changed)
        self.reset_button.clicked.connect(self.reset_to_defaults)
        self.hardware_combo.currentTextChanged.connect(self.update_encoder_options)
        self.fps_spinbox.valueChanged.connect(self.validate_fps)
        self.factor_spin.valueChanged.connect(self.validate_factor)
        self.bitrate_spin.valueChanged.connect(self.validate_bitrate)
        
        # Initialize UI state
        self.on_interpolation_toggled(self.enable_interpolation.isChecked())
    
    def on_interpolation_toggled(self, checked):
        """Enable or disable interpolation controls based on checkbox state."""
        self.quality_combo.setEnabled(checked)
        self.factor_spin.setEnabled(checked)
        if not checked:
            self.factor_spin.setValue(2)  # Reset to minimum when disabled
    
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
    
    def get_options(self):
        """Collect and validate video options from the UI."""
        options = {
            'fps': self.fps_spinbox.value(),
            'encoder': self.encoder_combo.currentText(),
            'hardware': self.hardware_combo.currentText(),
            'interpolation_enabled': self.enable_interpolation.isChecked(),
            'bitrate': self.bitrate_spin.value(),  # Added bitrate
        }

        # Validate FPS
        if not (self.fps_spinbox.minimum() <= options['fps'] <= self.fps_spinbox.maximum()):
            raise ValueError(f"FPS must be between {self.fps_spinbox.minimum()} and {self.fps_spinbox.maximum()}.")

        # Validate interpolation factor
        if options['interpolation_enabled']:
            factor = self.factor_spin.value()
            min_factor = self.factor_spin.minimum()
            max_factor = self.factor_spin.maximum()
            if not (min_factor <= factor <= max_factor):
                raise ValueError(f"Interpolation factor must be between {min_factor} and {max_factor}.")

            options['interpolation_quality'] = self.quality_combo.currentText().lower()
            options['interpolation_factor'] = factor

        # Validate bitrate
        if not (self.bitrate_spin.minimum() <= options['bitrate'] <= self.bitrate_spin.maximum()):
            raise ValueError(f"Bitrate must be between {self.bitrate_spin.minimum()} and {self.bitrate_spin.maximum()}.")

        return options
    
    def reset_to_defaults(self):
        self.fps_spinbox.setValue(30)
        self.hardware_combo.setCurrentIndex(0)
        self.encoder_combo.setCurrentIndex(0)
        self.enable_interpolation.setChecked(True)
        self.quality_combo.setCurrentIndex(0)
        self.factor_spin.setValue(2)
        self.bitrate_spin.setValue(5000)  # Reset bitrate to default

    def validate_fps(self, value: int):
        """Validate FPS value immediately when changed"""
        if value <= 0 or value > 60:
            self.fps_spinbox.setValue(max(1, min(60, value)))
            raise ValueError("FPS must be between 1 and 60.")
        return value

    def validate_factor(self, value: int):
        """Validate interpolation factor immediately when changed"""
        if self.enable_interpolation.isChecked():
            quality = self.quality_combo.currentText()
            max_factor = {
                "High": 8,
                "Medium": 6,
                "Low": 4
            }.get(quality, 2)
            
            if not (2 <= value <= max_factor):
                self.factor_spin.setValue(max_factor)
                raise ValueError(f"Interpolation factor must be between 2 and {max_factor} for {quality} quality")
        return value

    def validate_bitrate(self, value: int):
        """Validate bitrate value."""
        if value < 100 or value > 10000:
            self.bitrate_spin.setValue(max(100, min(10000, value)))
            raise ValueError("Bitrate must be between 100 and 10000 kbps.")
        return value

    def update_encoder_options(self, hardware: str):
        """Update encoder_combo items based on selected hardware."""
        self.encoder_combo.blockSignals(True)
        self.encoder_combo.clear()
        
        standard_encoders = [
            "H.264",
            "HEVC/H.265 (Better Compression)",
            "AV1 (Best Quality)"
        ]

        if "NVIDIA" in hardware:
            encoder_options = standard_encoders + [
                "NVIDIA NVENC H.264",
                "NVIDIA NVENC HEVC"
                # ...other NVIDIA-specific encoders...
            ]
        elif "Intel" in hardware:
            encoder_options = standard_encoders + [
                "Intel QSV H.264",
                "Intel QSV HEVC"
                # ...other Intel-specific encoders...
            ]
        elif "AMD" in hardware:
            encoder_options = standard_encoders + [
                "AMD VCE H.264",
                "AMD VCE HEVC"
                # ...other AMD-specific encoders...
            ]
        else:  # CPU
            encoder_options = standard_encoders

        self.encoder_combo.addItems(encoder_options)
        self.encoder_combo.blockSignals(False)
        self.encoder_combo.setCurrentIndex(0)
        QApplication.processEvents()  # Force UI update

    def validate_inputs(self):
        """Validate inputs and raise ValueError if invalid."""
        fps = self.fps_spinbox.value()
        if fps <= 0 or fps > 60:
            raise ValueError("FPS must be between 1 and 60.")

        if self.enable_interpolation.isChecked():
            factor = self.factor_spin.value()
            quality = self.quality_combo.currentText()
            max_factor = {
                "High": 8,
                "Medium": 6,
                "Low": 4
            }.get(quality, 2)
            if not (2 <= factor <= max_factor):
                raise ValueError(f"Interpolation factor must be between 2 and {max_factor} for {quality} quality.")

        bitrate = self.bitrate_spin.value()
        if bitrate < 100 or bitrate > 10000:
            raise ValueError("Bitrate must be between 100 and 10000 kbps.")

    def get_options_with_validation(self) -> dict:
        """Get options after validating inputs."""
        self.validate_inputs()
        return self.get_options()

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

    def _setup_ui(self):
        # ...existing code...

        # Set up FPS spinbox with validation
        self.fps_spinbox.setMinimum(1)
        self.fps_spinbox.setMaximum(60)
        self.fps_spinbox.setValue(30)
        self.fps_spinbox.valueChanged.connect(self._validate_fps)

        # Set up interpolation factor with validation
        self.factor_spin.setMinimum(2)
        self.factor_spin.setMaximum(8)
        self.factor_spin.setValue(2)
        self.factor_spin.valueChanged.connect(self._validate_interpolation_factor)

        # Initialize hardware and encoder options
        self._setup_hardware_options()
        self.hardware_combo.currentTextChanged.connect(self._update_encoder_options)

    def _validate_fps(self, value):
        """Validate FPS input and raise ValueError if invalid"""
        if value <= 0:
            self.fps_spinbox.setValue(1)  # Reset to minimum valid value
            raise ValueError("FPS must be greater than 0")
        return value

    def _validate_interpolation_factor(self, value):
        """Validate interpolation factor based on quality setting"""
        if self.enable_interpolation.isChecked():
            quality = self.quality_combo.currentText()
            max_factor = {
                "Low": 4,
                "Medium": 6,
                "High": 8
            }.get(quality, 4)
            
            if value > max_factor:
                self.factor_spin.setValue(max_factor)
                raise ValueError(f"Interpolation factor cannot exceed {max_factor} for {quality} quality")
        return value

    def _setup_hardware_options(self):
        """Initialize hardware options"""
        self.hardware_combo.clear()
        self.hardware_combo.addItems([
            "CPU",
            "NVIDIA GPU (CUDA)",
            "AMD GPU",
            "Intel QuickSync"
        ])

    def _update_encoder_options(self, hardware):
        """Update encoder options based on selected hardware"""
        self.encoder_combo.clear()
        if hardware == "NVIDIA GPU (CUDA)":
            self.encoder_combo.addItems([
                "NVIDIA Encoder Option 1",
                "NVIDIA Encoder Option 2",
                "NVIDIA Encoder Option 3"
            ])
        elif hardware == "AMD GPU":
            self.encoder_combo.addItems([
                "AMD VCE",
                "AMD AMF",
                "H.264 AMD"
            ])
        elif hardware == "Intel QuickSync":
            self.encoder_combo.addItems([
                "QuickSync H.264",
                "QuickSync HEVC",
                "Intel QSV"
            ])
        else:  # CPU
            self.encoder_combo.addItems([
                "H.264",
                "H.265",
                "VP9"
            ])
    
    def closeEvent(self, event):
        """Handle the widget close event."""
        # ...existing code...
        event.accept()
    
    def set_bitrate(self, bitrate: int):
        """Set the bitrate value in the UI."""
        self.bitrate_spin.setValue(bitrate)
    
    # ...existing code...