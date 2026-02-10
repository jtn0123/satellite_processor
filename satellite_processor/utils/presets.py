"""
Preset Management
----------------
Responsibilities:
- Managing processing presets using JSON file storage
- Importing/exporting presets to files
- Preset validation

Does NOT handle:
- Image processing
- File operations
- Configuration (see utils.py)
"""

import json
import logging
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)


class PresetManager:
    """Manage processing presets using JSON file storage"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self._presets_file = Path.home() / ".satellite_processor" / "presets.json"
        self._presets_file.parent.mkdir(parents=True, exist_ok=True)

    def _load_presets_from_file(self) -> dict:
        """Load presets from JSON file"""
        try:
            if self._presets_file.exists():
                with open(self._presets_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            return {}
        except Exception as e:
            self.logger.error(f"Error loading presets file: {e}")
            return {}

    def _save_presets_to_file(self, presets: dict):
        """Save presets to JSON file"""
        try:
            with open(self._presets_file, "w", encoding="utf-8") as f:
                json.dump(presets, f, indent=4)
        except Exception as e:
            self.logger.error(f"Error saving presets file: {e}")

    def save_preset(self, name: str, params: dict):
        """Save a new preset"""
        try:
            presets = self.get_presets()
            presets[name] = {"params": params, "created": str(datetime.now())}
            self._save_presets_to_file(presets)
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
        return self._load_presets_from_file()

    def delete_preset(self, name: str):
        """Delete a preset"""
        try:
            presets = self.get_presets()
            if name in presets:
                del presets[name]
                self._save_presets_to_file(presets)
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
