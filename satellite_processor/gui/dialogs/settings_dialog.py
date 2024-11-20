"""
Settings Dialog Module
-----------------------
Responsibilities:
- Provides GUI for application settings configuration
- Handles loading/saving settings using utils.py
- Directory path selection and validation

Does NOT handle:
- Direct file operations
- Business logic
- Image processing
"""

import os  # Add this import
import logging  # Add this import
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QFormLayout, QTabWidget, QWidget, QDialogButtonBox,
    QFileDialog, QMessageBox, QGroupBox
)
from PyQt6.QtCore import pyqtSignal, Qt
from pathlib import Path
from ...utils.utils import load_config, save_config  # Fix import path

# Initialize logger
logger = logging.getLogger(__name__)

class SettingsDialog(QDialog):
    settings_saved = pyqtSignal(dict)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Settings")
        self.setMinimumWidth(600)
        self.setup_ui()
        self.load_settings()
        # Remove SettingsManager initialization
        # self.settings_manager = SettingsManager()

    def setup_ui(self):
        layout = QVBoxLayout(self)
        
        # Create tabs
        tabs = QTabWidget()
        
        # Paths tab
        paths_tab = QWidget()
        paths_layout = QFormLayout()
        
        # Directory Settings Group
        dir_group = QGroupBox("Directory Settings")
        dir_layout = QFormLayout()
        
        # Input Directory
        self.input_dir = QLineEdit()
        input_browse = QPushButton("Browse")
        input_layout = QHBoxLayout()
        input_layout.addWidget(self.input_dir)
        input_layout.addWidget(input_browse)
        dir_layout.addRow("Input Directory:", input_layout)
        input_browse.clicked.connect(self.browse_input_dir)

        # Output Directory
        self.output_dir = QLineEdit()
        output_browse = QPushButton("Browse")
        output_layout = QHBoxLayout()
        output_layout.addWidget(self.output_dir)
        output_layout.addWidget(output_browse)
        dir_layout.addRow("Output Directory:", output_layout)
        output_browse.clicked.connect(self.browse_output_dir)
        
        dir_group.setLayout(dir_layout)
        paths_layout.addRow(dir_group)
        
        # Sanchez Settings Group
        sanchez_group = QGroupBox("Sanchez Settings")
        sanchez_layout = QFormLayout()
        
        # Sanchez Path
        self.sanchez_path = QLineEdit()
        sanchez_browse = QPushButton("Browse")
        sanchez_browse_layout = QHBoxLayout()
        sanchez_browse_layout.addWidget(self.sanchez_path)
        sanchez_browse_layout.addWidget(sanchez_browse)
        sanchez_layout.addRow("Executable:", sanchez_browse_layout)
        sanchez_browse.clicked.connect(self.browse_sanchez)
        
        # Underlay Path
        self.underlay_path = QLineEdit()
        underlay_browse = QPushButton("Browse")
        underlay_browse_layout = QHBoxLayout()
        underlay_browse_layout.addWidget(self.underlay_path)
        underlay_browse_layout.addWidget(underlay_browse)
        sanchez_layout.addRow("Underlay Image:", underlay_browse_layout)
        underlay_browse.clicked.connect(self.browse_underlay)
        
        sanchez_group.setLayout(sanchez_layout)
        paths_layout.addRow(sanchez_group)
        
        paths_tab.setLayout(paths_layout)
        tabs.addTab(paths_tab, "Paths")
        
        layout.addWidget(tabs)
        
        # Buttons at bottom
        button_box = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | 
            QDialogButtonBox.StandardButton.Cancel
        )
        button_box.accepted.connect(self.save_settings)
        button_box.rejected.connect(self.reject)
        layout.addWidget(button_box)

    def browse_sanchez(self):
        """Browse for Sanchez executable with validation"""
        path, _ = QFileDialog.getOpenFileName(
            self, "Select Sanchez Executable",
            filter="Executable files (*.exe)"
        )
        if path:
            exe_path = Path(path)
            if exe_path.name.lower() != 'sanchez.exe':
                QMessageBox.warning(self, "Invalid File",
                    "Please select the Sanchez.exe executable.")
                return
            self.sanchez_path.setText(str(exe_path))

    def browse_underlay(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Select Underlay Image",
            filter="Image files (*.jpg *.png)"
        )
        if path:
            self.underlay_path.setText(path)

    def browse_input_dir(self):
        directory = QFileDialog.getExistingDirectory(self, "Select Input Directory")
        if directory:
            self.input_dir.setText(directory)

    def browse_output_dir(self):
        directory = QFileDialog.getExistingDirectory(self, "Select Output Directory")
        if directory:
            self.output_dir.setText(directory)

    def load_settings(self):
        settings = load_config()
        self.sanchez_path.setText(settings.get('sanchez_path', ''))
        self.underlay_path.setText(settings.get('underlay_path', ''))
        self.input_dir.setText(settings.get('last_input_dir', ''))
        self.output_dir.setText(settings.get('last_output_dir', ''))

    def save_settings(self):
        """Save the updated settings and close the dialog."""
        try:
            # Get the updated file paths from the input fields
            sanchez_path = self.sanchez_path.text()
            underlay_path = self.underlay_path.text()

            # Validate the paths
            if not os.path.exists(sanchez_path):
                QMessageBox.warning(self, "Invalid Path", "Sanchez executable not found.")
                return
            if not os.path.exists(underlay_path):
                QMessageBox.warning(self, "Invalid Path", "Underlay image not found.")
                return

            # Load existing settings
            settings = load_config()
            # Update settings with the new paths
            settings.update({
                'sanchez_path': sanchez_path,
                'underlay_path': underlay_path,
                'last_input_dir': self.input_dir.text(),
                'last_output_dir': self.output_dir.text()
            })

            # Save the updated settings
            save_config(settings)

            self.accept()  # Close the dialog
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to save settings: {e}")
            logger.error(f"Error saving settings: {e}")

    def accept(self):
        """Validate and save settings"""
        try:
            # Convert paths to Path objects first
            sanchez_path = Path(self.sanchez_path.text()).resolve()
            underlay_path = Path(self.underlay_path.text()).resolve()
            input_dir = Path(self.input_dir.text()).resolve() if self.input_dir.text() else Path()
            output_dir = Path(self.output_dir.text()).resolve() if self.output_dir.text() else Path()
            
            # Convert paths to strings, preserving local paths
            def normalize_path(path: Path) -> str:
                path_str = str(path)
                # Only convert to UNC if it's a network path
                if path_str.startswith(('Y:', 'Z:')):
                    return path_str.replace('Y:', r'\\truenas\media')
                return path_str
            
            # Convert paths while preserving local paths
            sanchez_path_str = normalize_path(sanchez_path)
            underlay_path_str = normalize_path(underlay_path)
            input_dir_str = normalize_path(input_dir) if input_dir.parts else ''
            output_dir_str = normalize_path(output_dir) if output_dir.parts else ''
            
            # Verify paths exist
            for path, name in [(sanchez_path, "Sanchez executable"), 
                             (underlay_path, "Underlay image")]:
                if not path.exists():
                    QMessageBox.warning(self, "Invalid Path", 
                        f"{name} not found at: {path}")
                    return

            # Save settings with proper paths
            settings = load_config()
            settings.update({
                'sanchez_path': sanchez_path_str,
                'underlay_path': underlay_path_str,
                'last_input_dir': input_dir_str,
                'last_output_dir': output_dir_str
            })
            
            # Log the actual paths being saved
            logger.debug(f"Saving paths:")
            logger.debug(f"Sanchez: {sanchez_path_str}")
            logger.debug(f"Underlay: {underlay_path_str}")
            logger.debug(f"Input: {input_dir_str}")
            logger.debug(f"Output: {output_dir_str}")
            
            save_config(settings)
            super().accept()
            
        except Exception as e:
            QMessageBox.critical(self, "Error", 
                f"Failed to save settings: {str(e)}\nPlease verify all paths are accessible.")
            logger.error(f"Error accepting settings: {e}")