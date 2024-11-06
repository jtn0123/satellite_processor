# satellite_processor/satellite_processor/utils/logging_config.py
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import os
import sys
import platform
from datetime import datetime

class ColoredFormatter(logging.Formatter):
    """Custom formatter with colored output"""
    
    COLORS = {
        'DEBUG': '\033[36m',     # Cyan
        'INFO': '\033[32m',      # Green
        'WARNING': '\033[33m',   # Yellow
        'ERROR': '\033[31m',     # Red
        'CRITICAL': '\033[41m',  # Red background
        'RESET': '\033[0m'       # Reset color
    }
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Enable Windows color support
        if platform.system() == 'Windows':
            os.system('color')
    
    def format(self, record):
        if not getattr(record, 'is_file_handler', False):
            level_name = record.levelname
            if level_name in self.COLORS:
                record.levelname = f"{self.COLORS[level_name]}{level_name}{self.COLORS['RESET']}"
        return super().format(record)

def setup_logging(debug=False):
    """Setup logging configuration"""
    try:
        # Create logs directory
        log_dir = Path.home() / ".satellite_processor" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        
        # Create log filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = log_dir / f"SatelliteProcessor_{timestamp}.log"
        
        # Configure logging
        level = logging.DEBUG if debug else logging.INFO
        formatter = ColoredFormatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%H:%M:%S'
        )
        
        # File handler with rotation (10 MB max size, keep 5 backup files)
        file_handler = RotatingFileHandler(
            log_file, 
            maxBytes=10*1024*1024,  # 10 MB
            backupCount=5
        )
        file_handler.setFormatter(formatter)
        file_handler.addFilter(lambda record: setattr(record, 'is_file_handler', True) or True)
        
        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        
        # Root logger configuration
        root_logger = logging.getLogger()
        root_logger.setLevel(level)
        root_logger.addHandler(file_handler)
        root_logger.addHandler(console_handler)
        
        # Log system information
        root_logger.info("=== Application Started ===")
        root_logger.info(f"Application: SatelliteProcessor")
        root_logger.info(f"Log file: {log_file}")
        root_logger.info(f"Python version: {sys.version}")
        root_logger.info(f"Operating system: {os.name}")
        root_logger.info(f"Current working directory: {os.getcwd()}")
        
        return log_file
        
    except Exception as e:
        print(f"Error setting up logging: {e}")
        raise