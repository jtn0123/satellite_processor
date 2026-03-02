"""GOES data management endpoints — backward-compatible re-export module.

This module has been split into:
- goes_frames.py — frame CRUD, stats, and image serving
- goes_collections.py — collection management
- goes_tags.py — tag management

All symbols are re-exported here for backward compatibility.
"""

# Re-export constants and helpers used by tests
from .goes_collections import _COLLECTION_NOT_FOUND  # noqa: F401

# The router is no longer used directly — individual routers are registered in main.py.
# Keep a dummy router for any code that does `from .goes_data import router`.
from .goes_frames import (  # noqa: F401
    _FRAME_NOT_FOUND,
    MAX_EXPORT_LIMIT,
    _frames_to_csv,
    _frames_to_json_list,
    router,  # noqa: F401
)
