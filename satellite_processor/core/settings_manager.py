"""
Primary Settings Manager for Satellite Processor
---------------------------------------------
Handles persistent application settings and preferences storage using JSON.
This is the main settings management class that should be used throughout the application.

Responsibilities:
- Load/save application settings from/to JSON file
- Provide access to settings with type safety
- Handle default values
- Ensure settings directory exists
- Settings validation
"""

import json
from pathlib import Path
import logging
from typing import Dict, Any, Optional, Tuple

class SettingsManager:
    DEFAULT_SETTINGS = {
        'input_dir': '',
        'output_dir': '',
        'last_fps': 30,
        'default_encoder': 'H.264',
        'default_preset': 'slow',
        'default_bitrate': '8000k',
        'sanchez_path': '',
        'underlay_path': '',
        'temp_directory': '',
        'crop_enabled': False,
        'crop_x': 0,
        'crop_y': 0,
        'crop_width': 0,
        'crop_height': 0,
        'interpolation': False,
        'false_color': False,
        'add_timestamp': True,
        'video_quality': 'high'
        # Removed scaling-related settings
    }
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.settings_file = Path.home() / '.satellite_processor' / 'settings.json'
        self.settings: Dict[str, Any] = {}
        self.load_settings()
        
    def load_settings(self) -> None:
        """Load settings from file"""
        try:
            self.settings_file.parent.mkdir(parents=True, exist_ok=True)
            if self.settings_file.exists():
                with open(self.settings_file, 'r') as f:
                    self.settings = json.load(f)
                self.logger.debug(f"Loaded settings: {self.settings}")
            else:
                self.settings = self.DEFAULT_SETTINGS.copy()
                self.save_settings()
                self.logger.debug("Created new settings file with defaults")
        except Exception as e:
            self.logger.error(f"Failed to load settings: {e}", exc_info=True)
            self.settings = self.DEFAULT_SETTINGS.copy()
            
    def save_settings(self) -> None:
        """Save settings to file"""
        try:
            self.settings_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.settings_file, 'w') as f:
                json.dump(self.settings, f, indent=4)
            self.logger.info(f"Settings saved to {self.settings_file}")
            self.logger.debug(f"Current settings: {self.settings}")
        except Exception as e:
            self.logger.error(f"Failed to save settings: {e}", exc_info=True)
            
    def get(self, key: str, default: Any = None) -> Any:
        """Get setting value"""
        return self.settings.get(key, default)
        
    def set(self, key: str, value: Any) -> None:
        """Set setting value and save immediately"""
        try:
            self.logger.info(f"Setting {key}={value}")
            old_value = self.settings.get(key)
            if value is not None:
                self.settings[key] = str(value)  # Ensure string storage for paths
                self.save_settings()
                self.logger.info(f"Successfully updated setting {key} from '{old_value}' to '{value}'")
                # Verify the save
                saved_value = self.get(key)
                self.logger.info(f"Verified saved value for {key}: {saved_value}")
        except Exception as e:
            self.logger.error(f"Failed to set setting {key}: {e}", exc_info=True)
            
    def update(self, settings: Dict[str, Any]) -> None:
        """Update multiple settings at once"""
        try:
            self.settings.update(settings)
            self.save_settings()
        except Exception as e:
            self.logger.error(f"Failed to update settings: {e}")

    def validate_preferences(self) -> Tuple[bool, str]:
        """Validate that all required preferences are set"""
        try:
            missing = []
            if self.get('false_color', False):
                required = ['sanchez_path', 'underlay_path']
                missing.extend(key for key in required if not self.get(key))
                
            if not self.get('temp_directory'):
                missing.append('temp_directory')
                
            return (not bool(missing), 
                   f"Missing required preferences: {', '.join(missing)}" if missing else "")
                   
        except Exception as e:
            return False, f"Validation error: {str(e)}"

    def load_preference(self, key: str, default=None):
        """Alias for get() for backward compatibility"""
        return self.get(key, default)

    def save_preference(self, key: str, value: Any):
        """Alias for set() for backward compatibility"""
        self.set(key, value)