"""
Core Utility Re-exports
-----------------------
This module re-exports utility functions from the canonical
``satellite_processor.utils`` package so that existing imports
(``from satellite_processor.core.utils import …``) continue to work.

Canonical locations:
- ``parse_satellite_timestamp`` → satellite_processor.utils.helpers
- ``is_closing``               → satellite_processor.utils.utils
"""

from satellite_processor.utils.helpers import parse_satellite_timestamp
from satellite_processor.utils.utils import is_closing

__all__ = ["parse_satellite_timestamp", "is_closing"]
