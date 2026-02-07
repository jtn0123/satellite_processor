import logging
import logging.handlers
import sys
from pathlib import Path
from datetime import datetime


def setup_logging(log_dir: str = None, debug: bool = False) -> None:
    """Setup application logging configuration"""
    # Create logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG if debug else logging.INFO)

    # Create formatters with consistent styling
    file_formatter = logging.Formatter(
        "[%(asctime)s] %(levelname)-8s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    console_formatter = logging.Formatter(
        "%(levelname)s: %(message)s"
        if not debug
        else "[%(name)s] %(levelname)s: %(message)s"
    )

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(console_formatter)
    console_handler.setLevel(logging.INFO)
    root_logger.addHandler(console_handler)

    # Add debug handler if enabled
    if debug:
        debug_handler = logging.StreamHandler(sys.stdout)
        debug_handler.setFormatter(file_formatter)
        debug_handler.setLevel(logging.DEBUG)
        root_logger.addHandler(debug_handler)

    # File handler (if log directory provided)
    if log_dir:
        log_dir = Path(log_dir)
        log_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = log_dir / f"satellite_processor_{timestamp}.log"

        file_handler = logging.handlers.RotatingFileHandler(
            log_file, maxBytes=10 * 1024 * 1024, backupCount=5  # 10MB
        )
        file_handler.setFormatter(file_formatter)
        file_handler.setLevel(logging.DEBUG)
        root_logger.addHandler(file_handler)

    # Set specific levels for different modules
    logging.getLogger("satellite_processor.core.processor").setLevel(logging.INFO)
    logging.getLogger("satellite_processor.core.image_operations").setLevel(
        logging.INFO
    )
    logging.getLogger("satellite_processor.gui").setLevel(logging.INFO)

    # Suppress external library logging
    for logger_name in ["PIL", "matplotlib", "urllib3"]:
        logging.getLogger(logger_name).setLevel(logging.WARNING)
