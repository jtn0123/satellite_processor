# test_app.py
import sys
import os
import signal
import json
import argparse
import logging
from pathlib import Path

CONFIG_FILE = 'gui_config.json'

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return {'last_input': '', 'last_output': ''}

def save_config(input_path, output_path):
    config = {
        'last_input': input_path,
        'last_output': output_path
    }
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f)

# Add the project root to Python path
project_root = Path(__file__).resolve().parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from satellite_processor.utils.logging_config import setup_logging
from PyQt6.QtWidgets import QApplication # type: ignore
from PyQt6.QtCore import QTimer # type: ignore
from satellite_processor.gui.main_window import SatelliteProcessorGUI

__version__ = "1.0.0"

def signal_handler(signum, frame):
    """Handle system signals for clean shutdown"""
    QApplication.quit()

def main():
    app = QApplication(sys.argv)
    window = SatelliteProcessorGUI()
    window.show()
    return app.exec()

if __name__ == "__main__":
    sys.exit(main())