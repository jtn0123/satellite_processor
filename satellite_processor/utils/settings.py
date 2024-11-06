# satellite_processor/satellite_processor/utils/settings.py
from PyQt6.QtCore import QSettings
import logging
import os
import sys
from pathlib import Path
from typing import Dict, Any, Tuple

class SettingsManager:
    """Manage application settings and configuration"""
    
    def __init__(self):
        """Initialize settings manager"""
        # Initialize QSettings
        self.settings = QSettings("SatelliteProcessor", "ImageProcessor")
        self.logger = logging.getLogger(__name__)
        
        # Log settings file location
        settings_file = self.settings.fileName()
        self.logger.info(f"Settings file location: {settings_file}")
        
        # Configure default paths
        network_base = r"\\TRUENAS\media\Media\SatandHam"
        sanchez_base = os.path.join(network_base, "sanchez")
        
        # Define default settings
        self.defaults = {
            # File paths
            'sanchez_path': os.path.join(sanchez_base, "Sanchez.exe"),
            'underlay_path': os.path.join(sanchez_base, "Resources", "world.200411.3x10848x5424.jpg"),
            
            # Processing defaults
            'default_crop_width': 1920,
            'default_crop_height': 1080,
            'default_scale': 2.0,
            'default_fps': 30,
            'default_encoder': 'H.264 (Maximum Compatibility)',
            
            # Additional settings can be added here
            'temp_directory': str(Path.home() / '.satellite_processor' / 'temp'),
            'cache_directory': str(Path.home() / '.satellite_processor' / 'cache')
        }
        
        # Initialize and test
        self._test_network_access(network_base)
        self._initialize_defaults()
        self._test_paths()
        self.debug_settings()
        
    def _test_network_access(self, path: str):
        """Test network path accessibility"""
        self.logger.debug(f"\nTesting network access to: {path}")
        try:
            if os.path.exists(path):
                self.logger.debug("✓ Network path exists")
                try:
                    contents = os.listdir(path)
                    self.logger.debug(f"Directory contents: {contents}")
                except Exception as e:
                    self.logger.debug(f"Error listing directory: {e}")
            else:
                self.logger.debug("✗ Network path does not exist")
                
            # Test alternate path format
            alt_path = path.replace('\\', '/')
            self.logger.debug(f"Testing alternate path format: {alt_path}")
            self.logger.debug(f"Alternate path exists: {os.path.exists(alt_path)}")
            
        except Exception as e:
            self.logger.error(f"Network access test failed: {e}")
            
    def _test_paths(self):
        """Test all critical file paths"""
        self.logger.debug("\nTesting critical paths:")
        paths_to_test = {
            'sanchez_path': self.get_setting('sanchez_path'),
            'underlay_path': self.get_setting('underlay_path')
        }
        
        for name, path in paths_to_test.items():
            self.logger.debug(f"\nTesting {name}:")
            self.logger.debug(f"Path value: {path}")
            try:
                path_obj = Path(path)
                self.logger.debug(f"Absolute path: {path_obj.absolute()}")
                self.logger.debug(f"Path exists: {path_obj.exists()}")
                if path_obj.exists():
                    self.logger.debug(f"Is file: {path_obj.is_file()}")
                    self.logger.debug(f"Parent exists: {path_obj.parent.exists()}")
                    if path_obj.parent.exists():
                        self.logger.debug("Parent directory contents:")
                        for item in path_obj.parent.iterdir():
                            self.logger.debug(f"  {item.name}")
            except Exception as e:
                self.logger.error(f"Path test failed: {e}")
        
    def _initialize_defaults(self):
        """Initialize default settings if not already set"""
        try:
            self.logger.debug("\nInitializing default settings:")
            for key, value in self.defaults.items():
                if not self.settings.contains(key):
                    self.logger.debug(f"Setting default for {key}: {value}")
                    self.settings.setValue(key, value)
                else:
                    current_value = self.settings.value(key)
                    self.logger.debug(f"Existing value for {key}: {current_value}")
            self.settings.sync()
        except Exception as e:
            self.logger.error(f"Error initializing defaults: {str(e)}")
            
    def save_settings(self, settings_dict: Dict[str, Any]):
        """Save settings to persistent storage"""
        try:
            self.logger.debug("\nSaving settings:")
            for key, value in settings_dict.items():
                self.logger.debug(f"Saving {key}: {value}")
                self.settings.setValue(key, value)
            self.settings.sync()
            self.logger.info("Settings saved successfully")
        except Exception as e:
            self.logger.error(f"Error saving settings: {str(e)}")
            raise
            
    def load_settings(self) -> Dict[str, Any]:
        """Load settings from persistent storage"""
        try:
            self.logger.debug("\nLoading settings:")
            settings = {}
            
            # Load existing settings
            for key in self.settings.allKeys():
                value = self.settings.value(key)
                settings[key] = value
                self.logger.debug(f"Loaded {key}: {value}")
                
            # Ensure all defaults exist
            for key, value in self.defaults.items():
                if key not in settings:
                    self.logger.debug(f"Adding missing default {key}: {value}")
                    settings[key] = value
                    
            return settings
        except Exception as e:
            self.logger.error(f"Error loading settings: {str(e)}")
            return self.defaults.copy()
            
    def get_setting(self, key: str, default=None) -> Any:
        """Get a single setting value"""
        try:
            if default is None and key in self.defaults:
                default = self.defaults[key]
            value = self.settings.value(key, default)
            self.logger.debug(f"Getting setting {key}: {value}")
            return value
        except Exception as e:
            self.logger.error(f"Error getting setting {key}: {str(e)}")
            return default
            
    def validate_sanchez_paths(self) -> Tuple[bool, str]:
        """Validate Sanchez executable and underlay paths"""
        self.logger.debug("\n=== Validating Sanchez Paths ===")
        try:
            sanchez_path = self.get_setting('sanchez_path')
            underlay_path = self.get_setting('underlay_path')
            
            self.logger.debug(f"Raw Sanchez path: {sanchez_path}")
            self.logger.debug(f"Raw underlay path: {underlay_path}")
            
            # Test different path formats
            paths_to_test = [
                (sanchez_path, "Original Sanchez path"),
                (str(Path(sanchez_path)), "Normalized Sanchez path"),
                (sanchez_path.replace('\\', '/'), "Forward slash Sanchez path"),
                (underlay_path, "Original underlay path"),
                (str(Path(underlay_path)), "Normalized underlay path"),
                (underlay_path.replace('\\', '/'), "Forward slash underlay path")
            ]
            
            for path, desc in paths_to_test:
                self.logger.debug(f"\nTesting {desc}: {path}")
                try:
                    exists = os.path.exists(path)
                    is_file = os.path.isfile(path)
                    parent_exists = os.path.exists(os.path.dirname(path))
                    self.logger.debug(f"Path exists: {exists}")
                    self.logger.debug(f"Is file: {is_file}")
                    self.logger.debug(f"Parent exists: {parent_exists}")
                except Exception as e:
                    self.logger.debug(f"Error testing path: {e}")
            
            # Final validation
            if not os.path.exists(sanchez_path):
                msg = f"Sanchez executable not found at: {sanchez_path}"
                self.logger.error(msg)
                return False, msg
                
            if not os.path.exists(underlay_path):
                msg = f"Underlay image not found at: {underlay_path}"
                self.logger.error(msg)
                return False, msg
                
            self.logger.info("Sanchez paths validated successfully")
            return True, "Sanchez paths validated successfully"
            
        except Exception as e:
            msg = f"Error validating Sanchez paths: {str(e)}"
            self.logger.error(msg)
            self.logger.exception("Full validation error details:")
            return False, msg
            
    def debug_settings(self):
        """Print debug information about current settings state"""
        self.logger.info("\n=== Settings Debug Information ===")
        
        # Settings file location
        self.logger.info(f"Settings file location: {self.settings.fileName()}")
        
        # Current settings
        self.logger.info("\nCurrent Settings:")
        all_keys = self.settings.allKeys()
        if all_keys:
            for key in all_keys:
                value = self.settings.value(key)
                self.logger.info(f"  {key}: {value}")
        else:
            self.logger.info("  No settings found")
            
        # Default settings
        self.logger.info("\nDefault Settings:")
        for key, value in self.defaults.items():
            self.logger.info(f"  {key}: {value}")
            
        # Test critical paths
        self.logger.info("\nTesting Critical Paths:")
        paths = [
            ('Sanchez', self.get_setting('sanchez_path')),
            ('Underlay', self.get_setting('underlay_path'))
        ]
        
        for name, path in paths:
            self.logger.info(f"\n{name} Path:")
            self.logger.info(f"  Path: {path}")
            try:
                exists = os.path.exists(path) if path else False
                self.logger.info(f"  Exists: {exists}")
                if exists:
                    is_file = os.path.isfile(path)
                    self.logger.info(f"  Is File: {is_file}")
                    if is_file:
                        size = os.path.getsize(path)
                        self.logger.info(f"  Size: {size} bytes")
            except Exception as e:
                self.logger.info(f"  Error checking path: {str(e)}")
                
        self.logger.info("\n=== End Settings Debug ===\n")