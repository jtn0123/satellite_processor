from datetime import datetime
import json
from pathlib import Path
import logging
import re

logger = logging.getLogger(__name__)

def load_config(config_path: Path = None) -> dict:
    """Load configuration from JSON file"""
    if config_path is None:
        config_path = Path.home() / '.satellite_processor' / 'config.json'
    try:
        if config_path.exists():
            with open(config_path, 'r') as f:
                return json.load(f)
        return {}
    except Exception as e:
        logger.error(f"Error loading config: {e}")
        return {}

def save_config(config: dict, config_path: Path = None) -> bool:
    """Save configuration to JSON file"""
    if config_path is None:
        config_path = Path.home() / '.satellite_processor' / 'config.json'
    try:
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=4)
        return True
    except Exception as e:
        logger.error(f"Error saving config: {e}")
        return False

def parse_satellite_timestamp(filename: str) -> datetime:
    """Parse timestamp from satellite image filename"""
    try:
        match = re.search(r'(\d{8}T\d{6}Z)', filename)
        if match:
            return datetime.strptime(match.group(1), '%Y%m%dT%H%M%SZ')
        return datetime.min
    except Exception as e:
        logger.warning(f"Could not parse timestamp from filename: {filename}")
        return datetime.min

def is_closing(window) -> bool:
    """Check if window is in closing state"""
    return getattr(window, '_is_closing', False)

def calculate_uits(options: dict) -> float:
    """Calculate UITS value based on options"""
    # Implementation here
    return 0.0

def validate_uits(value: float) -> bool:
    """Validate UITS value"""
    # Implementation here
    return True