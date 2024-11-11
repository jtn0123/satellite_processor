"""
Utility Helper Functions
-----------------------
Responsibilities:
- Timestamp parsing and validation
- Date/time conversions
- String formatting utilities

Does NOT handle:
- File operations
- Image processing
- Configuration
- GUI operations
"""

from datetime import datetime
import re
import logging

logger = logging.getLogger(__name__)

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