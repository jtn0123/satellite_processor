"""GOES satellite data endpoints — backward-compatible re-export module.

This module has been split into:
- goes_catalog.py — catalog/products/latest endpoints
- goes_fetch.py — fetch/download endpoints
- goes_browse.py — composite browse/management endpoints

All symbols are re-exported here for backward compatibility.
"""

# Re-export shared constants
from ..services.goes_fetcher import (  # noqa: F401
    SATELLITE_AVAILABILITY,
    SATELLITE_BUCKETS,
    SECTOR_INTERVALS,
    SECTOR_PRODUCTS,
    VALID_BANDS,
)
from ._goes_shared import (  # noqa: F401
    BAND_DESCRIPTIONS,
    BAND_METADATA,
    COMPOSITE_RECIPES,
    SECTOR_DISPLAY_NAMES,
    SECTOR_FILE_SIZES_KB,
    _s3_executor,
)

# The router is no longer used directly — individual routers are registered in main.py.
# Keep a dummy router for any code that does `from .goes import router`.
from .goes_catalog import router  # noqa: F401
