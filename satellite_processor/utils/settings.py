# satellite_processor/satellite_processor/utils/settings.py
from PyQt6.QtCore import QSettings
import logging
import os
import sys
import json
from pathlib import Path
from typing import Dict, Any, Tuple, Optional

# Configure logger for this module
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)  # Set to DEBUG to allow DEBUG level logs

# Avoid adding multiple handlers if already present
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)

class SettingsManager:
    """Manages application settings with persistent storage using QSettings"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.settings = QSettings('SatelliteProcessor', 'SatelliteProcessor')
        self._load_settings()

    def _load_settings(self) -> None:
        """Initialize settings if they don't exist"""
        try:
            if not self.settings.contains('initialized'):
                self.settings.setValue('initialized', True)
                self.settings.setValue('last_input_dir', '')
                self.settings.setValue('last_output_dir', '')
                self.settings.setValue('temp_directory', str(Path.home() / '.satellite_processor' / 'temp'))
                self.settings.sync()
        except Exception as e:
            self.logger.error(f"Failed to initialize settings: {e}")

    def get(self, key: str, default: Any = None) -> Any:
        """Get a setting value"""
        try:
            value = self.settings.value(key, default)
            return value
        except Exception as e:
            self.logger.error(f"Failed to get setting {key}: {e}")
            return default

    def save_setting(self, key: str, value: Any) -> None:
        """Alias for set() method to maintain compatibility"""
        self.set(key, value)

    def set(self, key: str, value: Any) -> None:
        """Set a setting value and save immediately"""
        try:
            self.settings.setValue(key, value)
            self.settings.sync()
        except Exception as e:
            self.logger.error(f"Failed to set setting {key}: {e}")

    def get_directories(self) -> Dict[str, str]:
        """Get saved directory paths"""
        try:
            return {
                'input_dir': self.get('last_input_dir', ''),
                'output_dir': self.get('last_output_dir', '')
            }
        except Exception as e:
            self.logger.error(f"Failed to get directories: {e}")
            return {'input_dir': '', 'output_dir': ''}

    def save_directories(self, input_dir: Optional[str] = None, output_dir: Optional[str] = None) -> None:
        """Save directory paths"""
        try:
            if input_dir is not None:
                self.set('last_input_dir', str(input_dir))
            if output_dir is not None:
                self.set('last_output_dir', str(output_dir))
        except Exception as e:
            self.logger.error(f"Failed to save directories: {e}")

    def clear(self) -> None:
        """Clear all settings"""
        try:
            self.settings.clear()
            self.settings.sync()
        except Exception as e:
            self.logger.error(f"Failed to clear settings: {e}")
