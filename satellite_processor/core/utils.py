
from datetime import datetime
import re
import logging

logger = logging.getLogger(__name__)

def parse_satellite_timestamp(filename: str) -> datetime:
    """Extract timestamp from satellite image filename"""
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