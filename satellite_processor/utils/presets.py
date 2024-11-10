# satellite_processor/satellite_processor/utils/presets.py
from PyQt6.QtCore import QSettings
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class PresetManager:
    """Manage processing presets"""
    def __init__(self):
        self.settings = QSettings("SatelliteProcessor", "ImageProcessor")
        self.logger = logging.getLogger(__name__)
        
    def save_preset(self, name: str, params: dict):
        """Save a new preset"""
        try:
            presets = self.get_presets()
            presets[name] = {
                'params': params,
                'created': str(Path.ctime(Path.cwd()))
            }
            self.settings.setValue("presets", json.dumps(presets))
            self.logger.info(f"Preset '{name}' saved successfully")
        except Exception as e:
            self.logger.error(f"Error saving preset '{name}': {str(e)}")
            raise
            
    def load_preset(self, name: str) -> dict:
        """Load a preset by name"""
        try:
            presets = self.get_presets()
            preset_data = presets.get(name, {})
            return preset_data.get('params', {})
        except Exception as e:
            self.logger.error(f"Error loading preset '{name}': {str(e)}")
            return {}
            
    def get_presets(self) -> dict:
        """Get all available presets"""
        try:
            presets_str = self.settings.value("presets", "{}")
            return json.loads(presets_str)
        except Exception as e:
            self.logger.error(f"Error getting presets: {str(e)}")
            return {}
            
    def delete_preset(self, name: str):
        """Delete a preset"""
        try:
            presets = self.get_presets()
            if name in presets:
                del presets[name]
                self.settings.setValue("presets", json.dumps(presets))
                self.logger.info(f"Preset '{name}' deleted successfully")
        except Exception as e:
            self.logger.error(f"Error deleting preset '{name}': {str(e)}")

def load_presets(presets_path: Path = None) -> dict:
    """Load processing presets from JSON file"""
    if presets_path is None:
        presets_path = Path.home() / '.satellite_processor' / 'presets.json'
    try:
        if presets_path.exists():
            with open(presets_path, 'r') as f:
                return json.load(f)
        return {}
    except Exception as e:
        logger.error(f"Error loading presets: {e}")
        return {}

def save_presets(presets: dict, presets_path: Path = None) -> bool:
    """Save processing presets to JSON file"""
    if presets_path is None:
        presets_path = Path.home() / '.satellite_processor' / 'presets.json'
    try:
        presets_path.parent.mkdir(parents=True, exist_ok=True)
        with open(presets_path, 'w') as f:
            json.dump(presets, f, indent=4)
        return True
    except Exception as e:
        logger.error(f"Error saving presets: {e}")
        return False
