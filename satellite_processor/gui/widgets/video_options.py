# satellite_processor/satellite_processor/gui/widgets/video_options.py
import os
import cv2
from pathlib import Path
from typing import List
from PyQt6.QtWidgets import ( # type: ignore
    QGroupBox, QVBoxLayout, QHBoxLayout,
    QLabel, QSpinBox, QComboBox, QCheckBox, QWidget, QPushButton, QLineEdit, QFormLayout, QMessageBox
)
from PyQt6.QtCore import Qt # type: ignore
from PyQt6.QtWidgets import QApplication # type: ignore
from satellite_processor.core.video_handler import VideoHandler

class VideoOptionsWidget(QGroupBox):
    """Widget for video encoding options"""
    
    def __init__(self, parent: QWidget = None) -> None:
        super().__init__(parent)
        # Hardware-specific encoder mappings
        self.hardware_encoders = {
            "NVIDIA GPU": [
                "H.264",
                "HEVC/H.265 (Better Compression)",
                "AV1 (Best Quality)",
                "NVIDIA NVENC H.264",
                "NVIDIA NVENC HEVC"
            ],
            "Intel GPU": [
                "QuickSync H.264",
                "QuickSync HEVC",
                "Intel QSV"
            ],
            "AMD GPU": [
                "AMD VCE",
                "AMD AMF",
                "H.264 AMD"
            ],
            "CPU": [
                "H.264",
                "HEVC/H.265 (Better Compression)",
                "AV1 (Best Quality)"
            ]
        }
        self.testing = False  # Ensure this attribute is defined
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
        self.hardware_combo.addItems(["NVIDIA GPU", "Intel GPU", "AMD GPU", "CPU"])
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
        
        # Transcoding options
        self.enable_transcoding = QCheckBox("Enable Transcoding")
        self.enable_transcoding.setChecked(False)

        self.transcoding_options_group = QGroupBox("Transcoding Options")
        self.transcoding_options_group.setVisible(False)
        transcoding_layout = QVBoxLayout()
        
        self.transcoding_format_combo = QComboBox()
        self.transcoding_format_combo.addItems(["MP4", "AVI", "MKV", "MOV"])
        
        self.transcoding_quality_combo = QComboBox()
        self.transcoding_quality_combo.addItems(["Low", "Medium", "High"])
        
        transcoding_layout.addWidget(QLabel("Format:"))
        transcoding_layout.addWidget(self.transcoding_format_combo)
        transcoding_layout.addWidget(QLabel("Quality:"))
        transcoding_layout.addWidget(self.transcoding_quality_combo)
        self.transcoding_options_group.setLayout(transcoding_layout)

        # Connect checkbox to show/hide transcoding options with the new handler
        self.enable_transcoding.toggled.connect(self.enable_transcoding_toggled)

        # Add to main layout
        layout.addWidget(self.enable_transcoding)
        layout.addWidget(self.transcoding_options_group)

        # Reset Button
        self.reset_button = QPushButton("Reset to Defaults")
        layout.addWidget(self.reset_button)
        
        # Create Video Button
        self.create_video_button = QPushButton("Create Video")
        layout.addWidget(self.create_video_button)
        self.create_video_button.clicked.connect(self.handle_create_video)

        self.setLayout(layout)
        
        # Connect signals
        self.enable_interpolation.toggled.connect(self.on_interpolation_toggled)
        self.quality_combo.currentTextChanged.connect(self.on_quality_changed)
        self.reset_button.clicked.connect(self.reset_to_defaults)
        self.hardware_combo.currentTextChanged.connect(self.update_encoder_options)
        self.fps_spinbox.valueChanged.connect(self.validate_fps_wrapper)
        self.factor_spin.valueChanged.connect(self.validate_factor_wrapper)
        self.bitrate_spin.valueChanged.connect(self.validate_bitrate_wrapper)
        
        # Initialize UI state
        self.on_interpolation_toggled(self.enable_interpolation.isChecked())

        # Update signal connections to trigger validation immediately
        self.fps_spinbox.valueChanged.connect(self._validate_fps)
        self.factor_spin.valueChanged.connect(self._validate_factor)
    
    def on_interpolation_toggled(self, checked):
        """Enable or disable interpolation controls based on checkbox state."""
        self.quality_combo.setEnabled(checked)
        self.factor_spin.setEnabled(checked)
        if not checked:
            self.factor_spin.setValue(2)  # Reset to minimum when disabled
    
    def on_quality_changed(self, text):
        """Handle quality changes and validate current factor value."""
        quality_limits = {
            'High': 8,
            'Medium': 6,
            'Low': 4
        }
        max_factor = quality_limits.get(text, 8)
        self.factor_spin.setRange(2, max_factor)

        # Validate current value against new limits
        current_value = self.factor_spin.value()
        if current_value > max_factor:
            if self.testing:
                raise ValueError(f"Interpolation factor must be between 2 and {max_factor} for {text} quality")
            else:
                self.factor_spin.setValue(max_factor)

    def get_options(self) -> dict:
        """Retrieve and validate video options from the UI."""
        options = {
            'fps': self.fps_spinbox.value(),
            'bitrate': self.bitrate_spin.value(),
            'encoder': self.encoder_combo.currentText(),
            'hardware': self.hardware_combo.currentText(),
            'interpolation_enabled': self.enable_interpolation.isChecked(),
            'interpolation_factor': self.factor_spin.value() if self.enable_interpolation.isChecked() else 1,
            'interpolation_quality': self.quality_combo.currentText().lower(),
            'transcoding_enabled': self.enable_transcoding.isChecked(),
            'transcoding_quality': self.transcoding_quality_combo.currentText() if self.enable_transcoding.isChecked() else None,
            'custom_ffmpeg_options': '-preset veryfast -tune zerolatency'
        }
        
        if self.testing:
            self.validate_fps_wrapper(options['fps'])
            self.validate_bitrate()
            if options['interpolation_enabled']:
                self.validate_factor_wrapper(options['interpolation_factor'])
            self.validate_encoder(options['encoder'])
            
        return options

    def create_video(self, input_images_dir, output_video_path):
        """Trigger video creation with validation."""
        try:
            # Validate input type first - before any Path conversion
            if isinstance(input_images_dir, (list, tuple)):
                raise TypeError("Input directory must be a string or PathLike object, not list")
            if not isinstance(input_images_dir, (str, Path, os.PathLike)):
                raise TypeError(f"Input directory must be a string or PathLike object, not {type(input_images_dir).__name__}")

            # Now it's safe to convert to Path
            input_path = Path(input_images_dir)
            output_path = Path(output_video_path)

            # Validate directory existence
            if not input_path.exists() or not input_path.is_dir():
                raise ValueError("Input images directory does not exist or is not a directory.")

            # Create output directory
            output_path.parent.mkdir(parents=True, exist_ok=True)

            # Get and validate options
            options = self.get_options()

            # Create video using validated paths
            video_handler = VideoHandler()
            return video_handler.create_video(input_path, output_path, options)

        except (TypeError, ValueError) as e:
            if self.testing:
                raise  # Re-raise the exception in testing mode
            QMessageBox.critical(self, "Error", str(e))
            return False
        except Exception as e:
            if self.testing:
                raise
            QMessageBox.critical(self, "Error", f"Failed to create video: {str(e)}")
            return False

    def handle_create_video(self):
        """Handle the Create Video button click."""
        input_images_dir = "F:/Satelliteoutput/TIMELAPSE/FINAL/"  # Adjust as needed or make it dynamic
        output_video_path = os.path.join(
            input_images_dir,
            f"1617EQUIRECTANGULARout{self.get_output_timestamp()}.mp4"
        )
        try:
            self.create_video(input_images_dir, output_video_path)
        except ValueError as e:
            QMessageBox.critical(self, "Validation Error", str(e))
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to create video: {str(e)}")

    def get_output_timestamp(self):
        """Generate a timestamp string for the output video filename."""
        from datetime import datetime
        now = datetime.now()
        return now.strftime("%m%d%Y")

    def validate_fps(self, value: int):
        """Validate FPS value."""
        if not (1 <= value <= 60):
            raise ValueError("FPS must be between 1 and 60.")
        return value

    def validate_factor(self, factor, quality):
        """Validate interpolation factor for given quality."""
        quality_limits = {
            "Low": (2, 4),
            "Medium": (2, 6),
            "High": (2, 8),
        }
        min_f, max_f = quality_limits.get(quality, (2, 8))
        if not (min_f <= factor <= max_f):
            raise ValueError(f"Interpolation factor must be between {min_f} and {max_f} for {quality} quality")
        return True

    def validate_bitrate(self, value: int = None):
        """Validate bitrate value and raise ValueError if invalid."""
        bitrate = value if value is not None else self.bitrate_spin.value()
        if not (100 <= bitrate <= 10000):
            raise ValueError("Bitrate must be between 100 and 10000 kbps.")
        return True

    def reset_to_defaults(self):
        self.fps_spinbox.setValue(30)
        self.hardware_combo.setCurrentIndex(0)
        self.encoder_combo.setCurrentIndex(0)
        self.enable_interpolation.setChecked(True)
        self.quality_combo.setCurrentIndex(0)
        self.factor_spin.setValue(2)
        self.bitrate_spin.setValue(5000)  # Reset bitrate to default
        self.enable_transcoding.setChecked(False)
        # Ensure transcoding options are hidden after reset
        self.transcoding_options_group.setVisible(False)
        QApplication.processEvents()  # Force UI update

    def validate_fps_wrapper(self, fps_value):
        """Validate FPS value and raise ValueError if invalid."""
        try:
            fps = int(fps_value)
            if not (1 <= fps <= 60):
                raise ValueError("FPS must be between 1 and 60.")
        except (TypeError, ValueError):
            raise ValueError("FPS must be between 1 and 60.")
        return True

    def validate_factor_wrapper(self, factor):
        """Validate interpolation factor and raise ValueError if invalid."""
        quality = self.quality_combo.currentText()
        quality_limits = {
            "Low": (2, 4),
            "Medium": (2, 6),
            "High": (2, 8),
        }
        min_f, max_f = quality_limits.get(quality, (2, 8))
        try:
            factor_val = int(factor)
            if not (min_f <= factor_val <= max_f):
                raise ValueError(f"Interpolation factor must be between {min_f} and {max_f} for {quality} quality")
        except (TypeError, ValueError):
            raise ValueError(f"Interpolation factor must be between {min_f} and {max_f} for {quality} quality")
        return True

    def validate_bitrate_wrapper(self, value: int):
        """Wrapper for bitrate validation that handles both testing and UI modes."""
        try:
            bitrate = int(value)
            if not (100 <= bitrate <= 10000):
                raise ValueError("Bitrate must be between 100 and 10000 kbps.")
        except (TypeError, ValueError):
            raise ValueError("Bitrate must be between 100 and 10000 kbps.")
        return True

    def enable_transcoding_toggled(self, checked):
        """Handle toggling of transcoding options visibility."""
        self.transcoding_options_group.setVisible(checked)
        self.transcoding_options_group.repaint()
        QApplication.processEvents()  # Force UI update
        
        # Additional handling to ensure visibility state is correct
        if checked:
            self.transcoding_options_group.show()
        else:
            self.transcoding_options_group.hide()
        QApplication.processEvents()

    def update_encoder_options(self, hardware=None):
        """Update encoder options based on selected hardware."""
        if hardware is None:
            hardware = self.hardware_combo.currentText()
            
        self.encoder_combo.blockSignals(True)
        self.encoder_combo.clear()
        
        # Get encoder options for the selected hardware
        encoder_options = self.hardware_encoders.get(hardware, [
            "H.264",
            "HEVC/H.265 (Better Compression)",
            "AV1 (Best Quality)"
        ])
        
        self.encoder_combo.addItems(encoder_options)
        self.encoder_combo.blockSignals(False)
        self.encoder_combo.setCurrentIndex(0)
        QApplication.processEvents()  # Force UI update

    def validate_inputs(self):
        """Validate all inputs and raise ValueError if invalid."""
        fps = self.fps_spinbox.value()
        if not (1 <= fps <= 60):
            raise ValueError("FPS must be between 1 and 60.")

        bitrate = self.bitrate_spin.value()
        if not (100 <= bitrate <= 10000):
            raise ValueError("Bitrate must be between 100 and 10000 kbps.")

        if self.enable_interpolation.isChecked():
            factor = self.factor_spin.value()
            quality = self.quality_combo.currentText()
            quality_limits = {
                'High': 8,
                'Medium': 6,
                'Low': 4
            }
            max_factor = quality_limits.get(quality, 8)
            if not (2 <= factor <= max_factor):
                raise ValueError(f"Interpolation factor must be between 2 and {max_factor} for {quality} quality")

        # Validate encoder
        if self.encoder_combo.currentText() not in self._get_valid_encoders():
            raise ValueError("Unsupported encoder selected")

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


    # def set_bitrate(self, bitrate: int):
    #     """Set the bitrate value in the UI."""
    #     self.bitrate_spin.setValue(bitrate)

    def _get_valid_encoders(self):
        """Get list of valid encoders for current hardware."""
        hardware = self.hardware_combo.currentText()
        return self.hardware_encoders.get(hardware, [
            "H.264",
            "HEVC/H.265 (Better Compression)",
            "AV1 (Best Quality)"
        ])

    def interpolate_frames(self, frame1, frame2, factor=2):
        """Generate interpolated frames."""
        frames = [frame1]
        for i in range(1, factor):
            alpha = i / factor
            interpolated = cv2.addWeighted(frame1, 1 - alpha, frame2, alpha, 0)
            frames.append(interpolated)
        frames.append(frame2)
        return frames  # Return all frames including originals

    # Add this constant
    SUPPORTED_ENCODERS = [
        "H.264",
        "HEVC/H.265 (Better Compression)",
        "AV1 (Best Quality)",
        "NVIDIA NVENC H.264",
        "NVIDIA NVENC HEVC"
    ]

    def validate_encoder(self, encoder: str) -> None:
        """Validate encoder selection."""
        if encoder not in self.SUPPORTED_ENCODERS:
            if self.testing:
                raise ValueError("Unsupported encoder selected")
            else:
                self.encoder_combo.setCurrentText("H.264")
                return False
        return True

    def _validate_fps(self, value):
        """Validate FPS immediately on change."""
        try:
            if self.testing:
                self.validate_fps_wrapper(value)
        except ValueError as e:
            # Reset to valid value
            self.fps_spinbox.setValue(30)
            raise

    def _validate_factor(self, value):
        """Validate interpolation factor immediately on change."""
        try:
            if self.testing:
                quality = self.quality_combo.currentText()
                self.validate_factor_wrapper(value)
        except ValueError as e:
            # Reset to valid value
            self.factor_spin.setValue(2)
            raise

class ProcessingOptionsWidget(QWidget):
    # ...existing initialization code...

    def validate_fps_wrapper(self, fps: int) -> None:
        """Wrapper for fps validation"""
        if not isinstance(fps, int) or not (1 <= fps <= 60):
            raise ValueError("FPS must be between 1 and 60.")

    def validate_bitrate(self) -> None:
        """Validate bitrate value"""
        bitrate = self.bitrate_spin.value()
        if not isinstance(bitrate, int) or not (100 <= bitrate <= 10000):
            raise ValueError("Bitrate must be between 100 and 10000 kbps.")

    def validate_factor_wrapper(self, factor: int) -> None:
        """Wrapper for interpolation factor validation"""
        quality = self.quality_combo.currentText().split()[0]  # Get "High", "Medium", or "Low"
        max_factors = {'Low': 4, 'Medium': 6, 'High': 8}
        max_factor = max_factors[quality]
        if not (2 <= factor <= max_factor):
            raise ValueError(f"Interpolation factor must be between 2 and {max_factor} for {quality} quality.")

    def validate_encoder(self, encoder: str) -> None:
        """Validate encoder selection"""
        if encoder not in self.get_supported_encoders():
            raise ValueError("Unsupported encoder selected")

    def get_supported_encoders(self) -> List[str]:
        """Get list of supported encoders"""
        return [
            "H.264",
            "HEVC/H.265 (Better Compression)",
            "AV1 (Best Quality)",
            "NVIDIA NVENC H.264",
            "NVIDIA NVENC HEVC"
        ]

    def get_options(self) -> dict:
        """Get current processing options with validation"""
        # Perform validations first
        if self.testing:
            self.validate_fps_wrapper(self.fps_spinbox.value())
            self.validate_bitrate()
            if self.enable_interpolation.isChecked():
                self.validate_factor_wrapper(self.factor_spin.value())
            self.validate_encoder(self.encoder_combo.currentText())

        # ...rest of existing get_options code...