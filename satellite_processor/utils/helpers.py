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
    """Parse timestamp from satellite image filename with better logging"""
    logger = logging.getLogger(__name__)
    
    try:
        match = re.search(r'(\d{8}T\d{6}Z)', filename)
        if match:
            timestamp = datetime.strptime(match.group(1), '%Y%m%dT%H%M%SZ')
            logger.debug(f"Successfully parsed timestamp from {filename}: {timestamp}")
            return timestamp
            
        logger.warning(f"No timestamp pattern found in filename: {filename}")
        return datetime.min
        
    except Exception as e:
        logger.error(f"Failed to parse timestamp from {filename}: {e}")
        return datetime.min