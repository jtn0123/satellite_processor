import logging
import sys
from PyQt6.QtWidgets import QApplication
from satellite_processor.gui.main_window import SatelliteProcessorGUI
# ...other imports...

def main(debug=False):
    """Initialize application with proper logging setup"""
    # Remove any existing handlers to prevent duplication
    root_logger = logging.getLogger()
    if not root_logger.handlers:
        logging.basicConfig(
            level=logging.DEBUG if debug else logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.StreamHandler(sys.stdout)
            ]
        )
    else:
        root_logger.setLevel(logging.DEBUG if debug else logging.INFO)

    logger = logging.getLogger('satellite_processor')
    logger.info("=== Application Started ===")
    
    app = QApplication(sys.argv)
    window = SatelliteProcessorGUI()
    window.show()
    sys.exit(app.exec())

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Satellite Image Processor')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode with detailed logging')
    args = parser.parse_args()

    main(debug=args.debug)