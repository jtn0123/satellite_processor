
from PyQt6.QtWidgets import QDialog, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit, QPushButton, QFileDialog
import logging

class SettingsDialog(QDialog):
    def __init__(self, settings_manager=None, parent=None):
        super().__init__(parent)
        self.settings_manager = settings_manager
        self.setWindowTitle("Settings")
        self.logger = logging.getLogger(__name__)
        
        self.init_ui()
        self.load_settings()

    def init_ui(self):
        layout = QVBoxLayout(self)
        
        # Input directory setting
        input_dir_layout = QHBoxLayout()
        input_dir_label = QLabel("Input Directory:")
        self.input_dir_edit = QLineEdit()
        input_dir_browse = QPushButton("Browse")
        input_dir_browse.clicked.connect(self.browse_input_directory)
        input_dir_layout.addWidget(input_dir_label)
        input_dir_layout.addWidget(self.input_dir_edit)
        input_dir_layout.addWidget(input_dir_browse)
        
        # Output directory setting
        output_dir_layout = QHBoxLayout()
        output_dir_label = QLabel("Output Directory:")
        self.output_dir_edit = QLineEdit()
        output_dir_browse = QPushButton("Browse")
        output_dir_browse.clicked.connect(self.browse_output_directory)
        output_dir_layout.addWidget(output_dir_label)
        output_dir_layout.addWidget(self.output_dir_edit)
        output_dir_layout.addWidget(output_dir_browse)
        
        # Save and cancel buttons
        button_layout = QHBoxLayout()
        save_button = QPushButton("Save")
        save_button.clicked.connect(self.save_settings)
        cancel_button = QPushButton("Cancel")
        cancel_button.clicked.connect(self.reject)
        button_layout.addWidget(save_button)
        button_layout.addWidget(cancel_button)
        
        # Add layouts to main layout
        layout.addLayout(input_dir_layout)
        layout.addLayout(output_dir_layout)
        layout.addLayout(button_layout)

    def browse_input_directory(self):
        directory = QFileDialog.getExistingDirectory(self, "Select Input Directory")
        if directory:
            self.input_dir_edit.setText(directory)

    def browse_output_directory(self):
        directory = QFileDialog.getExistingDirectory(self, "Select Output Directory")
        if directory:
            self.output_dir_edit.setText(directory)

    def load_settings(self):
        if self.settings_manager:
            self.input_dir_edit.setText(self.settings_manager.get('input_dir', ''))
            self.output_dir_edit.setText(self.settings_manager.get('output_dir', ''))

    def save_settings(self):
        if self.settings_manager:
            self.settings_manager.set('input_dir', self.input_dir_edit.text())
            self.settings_manager.set('output_dir', self.output_dir_edit.text())
        self.accept()