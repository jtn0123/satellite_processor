"""
Utility Functions Module
Responsibilities:
- Parse satellite timestamps
- Provide common utility functions
- Handle window state checking
- Provide shared helper methods
Dependencies:
- None (uses standard libraries)
Used throughout application for:
- Time parsing
- Window state management
- Common operations
"""

from __future__ import annotations

# Canonical parse_satellite_timestamp lives in satellite_processor/utils/helpers.py
from ..utils.helpers import parse_satellite_timestamp  # noqa: F401


def is_closing(window) -> bool:
    """Check if window is in closing state"""
    return getattr(window, "_is_closing", False)
