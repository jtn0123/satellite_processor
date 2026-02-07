"""
Core Utilities
-------------
Responsibilities:
- Configuration file handling (load/save)
- Window state management
- UITS calculations and validation

Does NOT handle:
- Timestamp parsing (see helpers.py)
- File operations (see file_manager.py)
- Image processing
"""

import json
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


def get_default_settings() -> dict:
    return {
        "last_input_dir": "",
        "last_output_dir": "",
        "sanchez_path": "",
        "underlay_path": "",
        "window_size": (1600, 900),
        "window_pos": (100, 100),
        "processing_options": {
            # ...existing options...
        },
    }


def load_config(config_path: Path = None) -> dict:
    """Load configuration from JSON file"""
    if config_path is None:
        config_path = Path.home() / ".satellite_processor" / "config.json"
    try:
        if config_path.exists():
            with open(config_path, "r") as f:
                loaded_settings = json.load(f)
                settings = {**get_default_settings(), **loaded_settings}
                return settings
        return get_default_settings()
    except Exception as e:
        logger.error(f"Error loading config: {e}")
        return get_default_settings()


def save_config(config: dict, config_path: Path = None) -> bool:
    """Save configuration to JSON file"""
    if config_path is None:
        config_path = Path.home() / ".satellite_processor" / "config.json"
    try:
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(config_path, "w") as f:
            json.dump(config, f, indent=4)
        return True
    except Exception as e:
        logger.error(f"Error saving config: {e}")
        return False


def is_closing(window) -> bool:
    """Check if window is in closing state"""
    return getattr(window, "_is_closing", False)


def calculate_uits(options: dict) -> float:
    """Calculate UITS value based on options"""
    # Implementation here
    return 0.0


def validate_uits(value: float) -> bool:
    """Validate UITS value"""
    # Implementation here
    return True
