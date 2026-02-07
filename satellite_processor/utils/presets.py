"""
Preset Management
----------------
Responsibilities:
- Managing processing presets using QSettings
- Importing/exporting presets to files
- Preset validation

Does NOT handle:
- Image processing
- File operations
- Configuration (see utils.py)
"""

from PyQt6.QtCore import QSettings
import json
import logging
from pathlib import Path
from datetime import datetime

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
            presets[name] = {"params": params, "created": str(datetime.now())}
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
            return preset_data.get("params", {})
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

    def export_presets(self, file_path: Path) -> bool:
        """Export presets to file"""
        try:
            with open(file_path, "w") as f:
                json.dump(self.get_presets(), f, indent=4)
            return True
        except Exception as e:
            self.logger.error(f"Error exporting presets: {e}")
            return False

    def import_presets(self, file_path: Path) -> bool:
        """Import presets from file"""
        try:
            with open(file_path, "r") as f:
                presets = json.load(f)
            for name, data in presets.items():
                self.save_preset(name, data["params"])
            return True
        except Exception as e:
            self.logger.error(f"Error importing presets: {e}")
            return False
