from PyQt6.QtWidgets import QDialog, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit, QPushButton, QFileDialog, QDialogButtonBox
from satellite_processor.utils.settings import SettingsManager

class SettingsDialog(QDialog):
    def __init__(self, parent=None, settings_manager=None):
        super().__init__(parent)
        self.settings = settings_manager or SettingsManager()
        self.setWindowTitle("Settings")
        self.setMinimumSize(400, 300)
        
        # Create layout
        layout = QVBoxLayout(self)
        
        # Add settings controls
        self.init_ui()
        
        # Add standard dialog buttons
        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | 
            QDialogButtonBox.StandardButton.Cancel
        )
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)
        
        # Initialize settings if provided
        self.load_settings()
        
    def init_ui(self):
        """Initialize the user interface"""
        layout = QVBoxLayout(self)
        
        # Add input directory setting
        self.input_dir_label = QLabel("Input Directory:")
        self.input_dir_edit = QLineEdit()
        self.input_dir_button = QPushButton("Browse")
        self.input_dir_button.clicked.connect(self.select_input_directory)
        
        input_dir_layout = QHBoxLayout()
        input_dir_layout.addWidget(self.input_dir_edit)
        input_dir_layout.addWidget(self.input_dir_button)
        
        layout.addWidget(self.input_dir_label)
        layout.addLayout(input_dir_layout)
        
        # Add output directory setting
        self.output_dir_label = QLabel("Output Directory:")
        self.output_dir_edit = QLineEdit()
        self.output_dir_button = QPushButton("Browse")
        self.output_dir_button.clicked.connect(self.select_output_directory)
        
        output_dir_layout = QHBoxLayout()
        output_dir_layout.addWidget(self.output_dir_edit)
        output_dir_layout.addWidget(self.output_dir_button)
        
        layout.addWidget(self.output_dir_label)
        layout.addLayout(output_dir_layout)
        
        # Add save and cancel buttons
        self.save_button = QPushButton("Save")
        self.save_button.clicked.connect(self.save_settings)
        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.clicked.connect(self.reject)
        
        button_layout = QHBoxLayout()
        button_layout.addWidget(self.save_button)
        button_layout.addWidget(self.cancel_button)
        
        layout.addLayout(button_layout)
        
    def select_input_directory(self):
        """Handle input directory selection"""
        directory = QFileDialog.getExistingDirectory(self, "Select Input Directory")
        if directory:
            self.input_dir_edit.setText(directory)
            
    def select_output_directory(self):
        """Handle output directory selection"""
        directory = QFileDialog.getExistingDirectory(self, "Select Output Directory")
        if directory:
            self.output_dir_edit.setText(directory)
            
    def load_settings(self):
        """Load settings from settings manager"""
        if self.settings:
            self.input_dir_edit.setText(self.settings.get('input_dir', ''))
            self.output_dir_edit.setText(self.settings.get('output_dir', ''))
        
    def save_settings(self):
        """Save settings to the settings manager"""
        self.settings.set('input_dir', self.input_dir_edit.text())
        self.settings.set('output_dir', self.output_dir_edit.text())
        self.accept()