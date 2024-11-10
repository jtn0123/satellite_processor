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
from PyQt6.sip import isdeleted  # Import isdeleted from PyQt6.sip
from pathlib import Path
import logging

# Add this import
from ...utils.settings import SettingsManager

class ProcessingOptionsWidget(QWidget):
    """Widget for image processing options"""

    def __init__(self, parent: QWidget = None) -> None:
        super().__init__(parent)
        self.logger = logging.getLogger(__name__)
        self.settings_manager = SettingsManager()  # Add this line
        self.setup_ui_elements()  # Create UI elements first
        self.init_ui()  # Then initialize the layout
        self.load_saved_directories()  # Add this line

    def setup_ui_elements(self):
        """Create UI elements before layout initialization"""
        # Create input/output fields with proper parenting
        self.input_dir_edit = QLineEdit(self)
        self.input_dir_edit.setPlaceholderText("Select input directory...")
        self.output_dir_edit = QLineEdit(self)
        self.output_dir_edit.setPlaceholderText("Select output directory...")
        
        # Create crop control elements
        self.crop_checkbox = QCheckBox("Enable Cropping", self)
        self.crop_x = QSpinBox(self)
        self.crop_y = QSpinBox(self)
        self.crop_width = QSpinBox(self)
        self.crop_height = QSpinBox(self)
        
        # Initialize crop spinboxes
        for spinbox in [self.crop_x, self.crop_y, self.crop_width, self.crop_height]:
            spinbox.setRange(0, 10000)
            spinbox.setEnabled(False)
        
        # Create other UI elements
        self.false_color_check = QCheckBox("Apply False Color", self)
        self.interpolation_check = QCheckBox("Enable Interpolation", self)
        self.timestamp_check = QCheckBox("Add Timestamp", self)
        self.auto_enhance_check = QCheckBox("Auto Enhance", self)
        self.fps_spinbox = QSpinBox(self)
        self.encoder_combo = QComboBox(self)

    def init_ui(self):
        """Initialize the main user interface"""
        # Create main layout with proper spacing
        layout = QVBoxLayout()
        layout.setSpacing(15)  # Increase spacing between elements
        layout.setContentsMargins(10, 10, 10, 10)  # Add margins
        
        # First add directories section
        directories_group = self._create_directories_group()
        layout.addWidget(directories_group)
        
        # Then add crop controls
        crop_group = self._create_crop_group()
        layout.addWidget(crop_group)
        
        # Finally add other settings
        settings_group = self._create_settings_group()
        layout.addWidget(settings_group)
        
        self.setLayout(layout)

    def _create_directories_group(self):
        """Create directory selection controls"""
        group = QGroupBox("Directories")
        layout = QVBoxLayout(group)
        layout.setSpacing(10)
        
        # Input Directory
        input_layout = QHBoxLayout()
        input_label = QLabel("Input:")
        self.input_dir_edit.setReadOnly(True)
        input_browse = QPushButton("Browse")
        input_browse.clicked.connect(self.browse_input)
        input_layout.addWidget(input_label)
        input_layout.addWidget(self.input_dir_edit)
        input_layout.addWidget(input_browse)
        
        # Output Directory
        output_layout = QHBoxLayout()
        output_label = QLabel("Output:")
        self.output_dir_edit.setReadOnly(True)
        output_browse = QPushButton("Browse")
        output_browse.clicked.connect(self.browse_output)
        output_layout.addWidget(output_label)
        output_layout.addWidget(self.output_dir_edit)
        output_layout.addWidget(output_browse)
        
        layout.addLayout(input_layout)
        layout.addLayout(output_layout)
        
        return group

    def _create_crop_group(self):
        """Create crop controls group"""
        group = QGroupBox("Crop Settings")
        layout = QGridLayout(group)
        layout.setSpacing(10)
        layout.setContentsMargins(10, 20, 10, 10)
        
        # Add crop checkbox with proper spacing
        self.crop_checkbox.setContentsMargins(0, 0, 0, 10)
        layout.addWidget(self.crop_checkbox, 0, 0, 1, 4)
        
        # Add spinboxes in a grid
        labels = ["X:", "Y:", "Width:", "Height:"]
        controls = [self.crop_x, self.crop_y, self.crop_width, self.crop_height]
        
        for i, (label, control) in enumerate(zip(labels, controls)):
            row = (i // 2) + 1
            col = (i % 2) * 2
            
            label_widget = QLabel(label)
            label_widget.setMinimumWidth(60)
            
            layout.addWidget(label_widget, row, col)
            layout.addWidget(control, row, col + 1)
        
        return group

    def init_crop_controls(self, parent_layout):
        """Initialize crop controls with proper spacing and layout"""
        crop_group = QGroupBox("Crop Settings")
        crop_layout = QGridLayout()
        crop_layout.setSpacing(10)  # Add spacing between elements
        crop_layout.setContentsMargins(10, 20, 10, 10)  # Add margins for better spacing

        # Crop checkbox with proper spacing
        self.crop_checkbox = QCheckBox("Enable Cropping")
        self.crop_checkbox.setContentsMargins(0, 0, 0, 10)  # Add bottom margin
        crop_layout.addWidget(self.crop_checkbox, 0, 0, 1, 4)

        # Create spinboxes with labels
        spinbox_pairs = [
            ("X Position:", self.crop_x),
            ("Y Position:", self.crop_y),
            ("Width:", self.crop_width),
            ("Height:", self.crop_height)
        ]

        # Add spinboxes with proper layout
        for idx, (label_text, spinbox) in enumerate(spinbox_pairs, start=1):
            label = QLabel(label_text)
            label.setMinimumWidth(80)  # Ensure labels have enough width
            
            # Configure spinbox
            spinbox.setRange(0, 10000)
            spinbox.setEnabled(False)
            spinbox.setMinimumWidth(100)  # Ensure spinboxes have enough width
            
            # Add to layout with proper positioning
            row = (idx - 1) // 2 + 1  # Calculate row
            col = ((idx - 1) % 2) * 2  # Calculate column
            crop_layout.addWidget(label, row, col)
            crop_layout.addWidget(spinbox, row, col + 1)

        # Set layout alignment
        crop_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        
        # Connect checkbox
        self.crop_checkbox.toggled.connect(self.toggle_crop_controls)
        
        # Set layout for group
        crop_group.setLayout(crop_layout)
        parent_layout.addWidget(crop_group)

    def toggle_crop_controls(self, enabled):
        """Enable/disable crop controls based on checkbox state"""
        controls = [self.crop_x, self.crop_y, self.crop_width, self.crop_height]
        for control in controls:
            control.setEnabled(enabled)

    def init_other_controls(self, parent_layout):
        """Initialize non-crop related controls"""
        
        # False Color Option
        self.false_color_check = QCheckBox("Apply False Color")
        parent_layout.addWidget(self.false_color_check)

        # Remove upscaling-related widgets
        # self.upscale_check = QCheckBox("Enable Upscaling")
        # self.upscale_method = QComboBox()
        # self.upscale_method.addItems(["Lanczos", "Bicubic", "Bilinear"])
        
        # Interpolation Option
        self.interpolation = QCheckBox("Enable Interpolation")
        parent_layout.addWidget(self.interpolation)

    def get_options(self) -> dict:
        """Return all processing options"""
        return {
            'crop_enabled': self.crop_checkbox.isChecked(),
            'crop_x': self.crop_x.value(),
            'crop_y': self.crop_y.value(),
            'crop_width': self.crop_width.value(),
            'crop_height': self.crop_height.value(),
            'false_color': self.false_color_check.isChecked(),
            'interpolation': self.interpolation_check.isChecked(),
            'add_timestamp': self.timestamp_check.isChecked(),
            'auto_enhance': self.auto_enhance_check.isChecked(),
            'fps': self.fps_spinbox.value(),
            'encoder': self.encoder_combo.currentText(),
            'input_dir': self.input_dir_edit.text(),
            'output_dir': self.output_dir_edit.text()
        }

    def get_input_directory(self) -> str:
        """Get the current input directory path"""
        return self.input_dir_edit.text() or ""

    def get_output_directory(self) -> str:
        """Get the current output directory path"""
        return self.output_dir_edit.text() or ""

    def set_input_directory(self, directory: str) -> None:
        """Set the input directory path"""
        if directory:
            try:
                path = Path(directory)
                # Only update if it's a directory or doesn't exist yet
                if path.is_dir() or not path.exists():
                    self.input_dir_edit.setText(str(path))
                    self.input_dir_edit.setToolTip(str(path))
            except Exception as e:
                self.logger.error(f"Error setting input directory: {e}")

    def set_output_directory(self, directory: str) -> None:
        """Set the output directory path"""
        if directory:
            try:
                path = Path(directory)
                # Only update if it's a directory or doesn't exist yet
                if path.is_dir() or not path.exists():
                    self.output_dir_edit.setText(str(path))
                    self.output_dir_edit.setToolTip(str(path))
            except Exception as e:
                self.logger.error(f"Error setting output directory: {e}")

    def browse_input(self):
        """Browse for input directory."""
        dir_path = QFileDialog.getExistingDirectory(self, "Select Input Directory")
        if dir_path:
            self.input_dir_edit.setText(dir_path)
            self.input_dir_edit.setToolTip(dir_path)
            self.settings_manager.set('last_input_dir', dir_path)  # Save immediately
            # Update main window's input entry if it exists
            main_window = self.window()
            if hasattr(main_window, 'input_entry'):
                main_window.input_entry.setText(dir_path)

    def browse_output(self):
        """Browse for output directory."""
        dir_path = QFileDialog.getExistingDirectory(self, "Select Output Directory")
        if dir_path:
            self.output_dir_edit.setText(dir_path)
            self.output_dir_edit.setToolTip(dir_path)
            self.settings_manager.set('last_output_dir', dir_path)  # Save immediately
            # Update main window's output entry if it exists
            main_window = self.window()
            if hasattr(main_window, 'output_entry'):
                main_window.output_entry.setText(dir_path)
        else:
            self.logger.info("No directory selected for output.")
    
        def apply_settings(self, settings: dict):
            """Apply settings from the dialog."""
            # ...existing code...
            self.some_signal.emit("Operation Description", 50)  # Ensure two arguments
            # Determine if processing options are handled elsewhere
            # If redundant, consider removing or consolidating functionality
            # ...existing code...

    def load_saved_directories(self) -> None:
        """Load the last used directories from settings"""
        directories = self.settings_manager.get_directories()
        if directories['input_dir']:
            self.set_input_directory(directories['input_dir'])
        if directories['output_dir']:
            self.set_output_directory(directories['output_dir'])

    def _create_false_color_group(self):
        group = QGroupBox("False Color Settings")
        group.setStyleSheet("""
            QGroupBox {
                margin-top: 2ex;
                z-index: 1;  /* Ensure proper stacking order */
            }
        """)
        # ...rest of false color group implementation...

    def _create_settings_group(self):
        """Create group for processing settings"""
        group = QGroupBox("Processing Settings")
        layout = QVBoxLayout()
        layout.setSpacing(10)
        
        # Add checkboxes with proper spacing
        checkboxes = [
            self.false_color_check,
            self.interpolation_check,
            self.timestamp_check,
            self.auto_enhance_check
        ]
        
        for checkbox in checkboxes:
            checkbox.setContentsMargins(5, 2, 5, 2)
            layout.addWidget(checkbox)
        
        # Add FPS settings
        fps_layout = QHBoxLayout()
        fps_label = QLabel("FPS:")
        fps_label.setMinimumWidth(60)
        self.fps_spinbox.setRange(1, 60)
        self.fps_spinbox.setValue(30)
        fps_layout.addWidget(fps_label)
        fps_layout.addWidget(self.fps_spinbox)
        fps_layout.addStretch()
        layout.addLayout(fps_layout)
        
        # Add encoder selection
        encoder_layout = QHBoxLayout()
        encoder_label = QLabel("Encoder:")
        encoder_label.setMinimumWidth(60)
        self.encoder_combo.addItems([
            "H.264 (CPU)",
            "H.264 (GPU)",
            "H.265/HEVC (CPU)",
            "H.265/HEVC (GPU)",
            "AV1 (CPU)"
        ])
        encoder_layout.addWidget(encoder_label)
        encoder_layout.addWidget(self.encoder_combo)
        encoder_layout.addStretch()
        layout.addLayout(encoder_layout)
        
        # Add some spacing at the bottom
        layout.addStretch()
        group.setLayout(layout)
        
        return group

# ...rest of the class implementation remains unchanged...