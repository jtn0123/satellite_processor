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
    try:
        # Setup logging
        log_file = setup_logging(debug=True)
        print("Starting Satellite Processor test...")
        
        # Register signal handlers
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # Create application
        app = QApplication(sys.argv)
        app.setApplicationName("Satellite Image Processor")
        app.setApplicationVersion(__version__)
        app.setOrganizationName("SatelliteProcessor")
        app.setOrganizationDomain("satelliteprocessor.org")
        
        # Create main window
        window = SatelliteProcessorGUI()
        window.show()
        
        # Handle signals in Qt event loop
        timer = QTimer()
        timer.timeout.connect(lambda: None)
        timer.start(100)
        
        return app.exec()
    
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    finally:
        # Cleanup
        if 'window' in locals():
            window.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Satellite Processor Application")
    parser.add_argument('-debug', action='store_true', help='Enable debug logging')
    args = parser.parse_args()

    # Configure logging
    log_level = logging.DEBUG if args.debug else logging.INFO
    logging.basicConfig(level=log_level, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    
    sys.exit(main())