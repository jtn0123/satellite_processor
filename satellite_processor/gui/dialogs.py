# gui/dialogs.py
from PyQt6.QtWidgets import ( # type: ignore
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QFormLayout, QSpinBox, QDoubleSpinBox,
    QTabWidget, QWidget, QDialogButtonBox, QFileDialog,
    QMessageBox, QComboBox
)
from pathlib import Path
from ..utils.settings import SettingsManager
from ..utils.presets import PresetManager

class SettingsDialog(QDialog):
    """Advanced settings configuration dialog"""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Settings")
        self.setMinimumWidth(500)
        
        self.settings_manager = SettingsManager()
        
        # Create main layout
        layout = QVBoxLayout(self)
        
        # Create tab widget
        tabs = QTabWidget()
        tabs.addTab(self.create_paths_tab(), "Paths")
        tabs.addTab(self.create_processing_tab(), "Processing")
        tabs.addTab(self.create_video_tab(), "Video")
        layout.addWidget(tabs)
        
        # Add dialog buttons
        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Save |
            QDialogButtonBox.StandardButton.Cancel
        )
        buttons.accepted.connect(self.save_settings)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)
        
        # Load current settings
        self.load_current_settings()
        
    def create_paths_tab(self):
        """Create paths configuration tab"""
        widget = QWidget()
        layout = QFormLayout(widget)
        
        # Sanchez executable path
        self.sanchez_path = QLineEdit()
        browse_sanchez = QPushButton("Browse")
        browse_sanchez.clicked.connect(lambda: self.browse_file(self.sanchez_path))
        
        sanchez_layout = QHBoxLayout()
        sanchez_layout.addWidget(self.sanchez_path)
        sanchez_layout.addWidget(browse_sanchez)
        layout.addRow("Sanchez Path:", sanchez_layout)
        
        # Underlay image path
        self.underlay_path = QLineEdit()
        browse_underlay = QPushButton("Browse")
        browse_underlay.clicked.connect(lambda: self.browse_file(self.underlay_path))
        
        underlay_layout = QHBoxLayout()
        underlay_layout.addWidget(self.underlay_path)
        underlay_layout.addWidget(browse_underlay)
        layout.addRow("Underlay Path:", underlay_layout)
        
        # Input directory path
        self.input_dir_edit = QLineEdit()
        self.input_dir_edit.setText(self.parent().input_entry.text())
        input_browse = QPushButton("Browse")
        input_browse.clicked.connect(self.browse_input)
        input_layout = QHBoxLayout()
        input_layout.addWidget(self.input_dir_edit)
        input_layout.addWidget(input_browse)
        layout.addRow("Input Directory:", input_layout)
        
        # Output directory path
        self.output_dir_edit = QLineEdit()
        self.output_dir_edit.setText(self.parent().output_entry.text())
        output_browse = QPushButton("Browse")
        output_browse.clicked.connect(self.browse_output)
        output_layout = QHBoxLayout()
        output_layout.addWidget(self.output_dir_edit)
        output_layout.addWidget(output_browse)
        layout.addRow("Output Directory:", output_layout)
        
        return widget
        
    def create_processing_tab(self):
        """Create processing options tab"""
        widget = QWidget()
        layout = QFormLayout(widget)
        
        # Default crop dimensions
        self.default_crop_width = QSpinBox()
        self.default_crop_width.setRange(1, 10000)
        layout.addRow("Default Crop Width:", self.default_crop_width)
        
        self.default_crop_height = QSpinBox()
        self.default_crop_height.setRange(1, 10000)
        layout.addRow("Default Crop Height:", self.default_crop_height)
        
        # Default upscale factor
        self.default_scale = QDoubleSpinBox()
        self.default_scale.setRange(0.1, 10.0)
        self.default_scale.setValue(2.0)
        layout.addRow("Default Scale Factor:", self.default_scale)
        
        return widget
        
    def create_video_tab(self):
        """Create video options tab"""
        widget = QWidget()
        layout = QFormLayout(widget)
        
        # Default FPS
        self.default_fps = QSpinBox()
        self.default_fps.setRange(1, 60)
        self.default_fps.setValue(30)
        layout.addRow("Default FPS:", self.default_fps)
        
        # Default encoder
        self.default_encoder = QComboBox()
        self.default_encoder.addItems([
            "H.264 (Maximum Compatibility)",
            "HEVC/H.265 (Better Compression)",
            "AV1 (Best Quality)"
        ])
        layout.addRow("Default Encoder:", self.default_encoder)
        
        return widget
        
    def browse_file(self, line_edit):
        """File browser dialog"""
        filename, _ = QFileDialog.getOpenFileName(self, "Select File")
        if filename:
            line_edit.setText(filename)
            
    def browse_input(self):
        """Browse for input directory."""
        dir_path = QFileDialog.getExistingDirectory(self, "Select Input Directory")
        if dir_path:
            self.input_dir_edit.setText(dir_path)
            self.parent().input_entry.setText(dir_path)
        
    def browse_output(self):
        """Browse for output directory."""
        dir_path = QFileDialog.getExistingDirectory(self, "Select Output Directory")
        if dir_path:
            self.output_dir_edit.setText(dir_path)
            self.parent().output_entry.setText(dir_path)
            
    def load_current_settings(self):
        """Load current settings into dialog"""
        settings = self.settings_manager.load_settings()
        
        # Paths
        self.sanchez_path.setText(settings.get('sanchez_path', ''))
        self.underlay_path.setText(settings.get('underlay_path', ''))
        self.input_dir_edit.setText(settings.get('input_dir', ''))
        self.output_dir_edit.setText(settings.get('output_dir', ''))
        
        # Processing
        self.default_crop_width.setValue(settings.get('default_crop_width', 1920))
        self.default_crop_height.setValue(settings.get('default_crop_height', 1080))
        self.default_scale.setValue(settings.get('default_scale', 2.0))
        
        # Video
        self.default_fps.setValue(settings.get('default_fps', 30))
        self.default_encoder.setCurrentText(settings.get('default_encoder', 'H.264 (Maximum Compatibility)'))
        
    def save_settings(self):
        """Save settings and close dialog"""
        settings = {
            'sanchez_path': self.sanchez_path.text(),
            'underlay_path': self.underlay_path.text(),
            'input_dir': self.input_dir_edit.text(),
            'output_dir': self.output_dir_edit.text(),
            'default_crop_width': self.default_crop_width.value(),
            'default_crop_height': self.default_crop_height.value(),
            'default_scale': self.default_scale.value(),
            'default_fps': self.default_fps.value(),
            'default_encoder': self.default_encoder.currentText()
        }
        
        self.settings_manager.save_settings(settings)
        self.accept()

class PresetDialog(QDialog):
    """Preset management dialog"""
    def __init__(self, params, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Save Preset")
        self.params = params
        self.preset_manager = PresetManager()
        
        layout = QVBoxLayout(self)
        
        # Preset name input
        name_layout = QHBoxLayout()
        self.name_input = QLineEdit()
        name_layout.addWidget(QLabel("Preset Name:"))
        name_layout.addWidget(self.name_input)
        layout.addLayout(name_layout)
        
        # Description input
        self.description = QLineEdit()
        layout.addWidget(QLabel("Description (optional):"))
        layout.addWidget(self.description)
        
        # Buttons
        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Save |
            QDialogButtonBox.StandardButton.Cancel
        )
        buttons.accepted.connect(self.save_preset)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)
        
    def save_preset(self):
        """Save preset and close dialog"""
        name = self.name_input.text().strip()
        if not name:
            QMessageBox.warning(self, "Error", "Please enter a preset name.")
            return
            
        # Add description to params
        self.params['description'] = self.description.text().strip()
        
        # Check if preset already exists
        if self.preset_manager.preset_exists(name):
            reply = QMessageBox.question(
                self,
                "Overwrite Preset",
                f"Preset '{name}' already exists. Do you want to overwrite it?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No
            )
            if reply == QMessageBox.StandardButton.No:
                return
                
        self.preset_manager.save_preset(name, self.params)
        self.accept()
