# satellite_processor/satellite_processor/app.py
import sys
from PyQt6.QtWidgets import QApplication # type: ignore
from PyQt6.QtCore import Qt # type: ignore
import argparse
import logging
from pathlib import Path
from gui.main_window import SatelliteProcessorGUI, MainWindow
from utils.logging_config import setup_logging
from .core.settings_manager import SettingsManager
from .core.processor import SatelliteImageProcessor

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

def setup_logging():
    """Configure logging with console and file output"""
    # Create logs directory if it doesn't exist
    log_dir = Path.cwd() / 'logs'
    log_dir.mkdir(exist_ok=True)
    
    # Configure logging format
    log_format = '%(asctime)s - %(levelname)s - %(name)s - %(message)s'
    formatter = logging.Formatter(log_format)
    
    # Console handler with DEBUG level
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG)
    console_handler.setFormatter(formatter)
    
    # File handler
    file_handler = logging.FileHandler(log_dir / 'satellite_processor.log')
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)
    
    # Root logger configuration
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)
    
    # Log startup message
    root_logger.info("Application starting - Logging configured")

def main():
    app = QApplication(sys.argv)
    
    # Create settings manager first
    settings_manager = SettingsManager()
    
    # Create processor with settings manager
    processor = SatelliteImageProcessor(settings_manager=settings_manager)
    
    # Create main window with both dependencies
    window = MainWindow(settings_manager=settings_manager, processor=processor)
    window.show()
    
    return app.exec()

if __name__ == "__main__":
    main()
