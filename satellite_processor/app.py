# satellite_processor/satellite_processor/app.py
import sys
from PyQt6.QtWidgets import QApplication # type: ignore
from PyQt6.QtCore import Qt # type: ignore
import argparse
import logging
from pathlib import Path
from gui.main_window import SatelliteProcessorGUI
from utils.logging_config import setup_logging

def parse_arguments():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description="Satellite Image Processor")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode")
    parser.add_argument("--input-dir", type=str, help="Input directory containing images")
    parser.add_argument("--output-dir", type=str, help="Output directory for processed files")
    return parser.parse_args()

def initialize_app():
    """Initialize application settings"""
    # Enable high DPI scaling
    QApplication.setAttribute(Qt.ApplicationAttribute.AA_EnableHighDpiScaling)
    QApplication.setAttribute(Qt.ApplicationAttribute.AA_UseHighDpiPixmaps)
    
    # Create application instance
    app = QApplication(sys.argv)
    
    # Set application style and metadata
    app.setStyle("Fusion")
    app.setApplicationName("Satellite Image Processor")
    app.setApplicationVersion("1.0.0")
    
    return app

def main():
    """Main application entry point"""
    try:
        # Parse arguments
        args = parse_arguments()
        
        # Setup logging
        setup_logging()
        logger = logging.getLogger(__name__)
        
        # Initialize application
        app = initialize_app()
        
        # Create and show main window
        window = SatelliteProcessorGUI()
        
        # Apply command line arguments if provided
        if args.input_dir:
            window.input_path.setText(args.input_dir)
        if args.output_dir:
            window.output_path.setText(args.output_dir)
            
        window.show()
        
        # Start application event loop
        sys.exit(app.exec())
        
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.critical(f"Application failed to start: {str(e)}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
