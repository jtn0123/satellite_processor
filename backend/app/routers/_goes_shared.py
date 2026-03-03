"""Shared constants and utilities for GOES router modules."""

import atexit
from concurrent.futures import ThreadPoolExecutor

from ..services.satellite_registry import SATELLITE_REGISTRY

# Bug #18: Dedicated thread pool for S3 operations
_s3_executor = ThreadPoolExecutor(max_workers=4)
atexit.register(_s3_executor.shutdown, wait=False)

# ---------------------------------------------------------------------------
# Band descriptions & metadata — sourced from registry, merged across all
# satellites so that endpoints can look up any band regardless of satellite.
# ---------------------------------------------------------------------------

BAND_DESCRIPTIONS: dict[str, str] = {}
BAND_METADATA: dict[str, dict] = {}
for _cfg in SATELLITE_REGISTRY.values():
    BAND_DESCRIPTIONS.update(_cfg.band_descriptions)
    BAND_METADATA.update(_cfg.band_metadata)

# ---------------------------------------------------------------------------
# Sector helpers — merged across all satellites
# ---------------------------------------------------------------------------

SECTOR_DISPLAY_NAMES: dict[str, str] = {}
SECTOR_FILE_SIZES_KB: dict[str, int] = {}
for _cfg in SATELLITE_REGISTRY.values():
    for _sec_name, _sec_cfg in _cfg.sectors.items():
        SECTOR_DISPLAY_NAMES[_sec_name] = _sec_cfg.display_name
        SECTOR_FILE_SIZES_KB[_sec_name] = _sec_cfg.file_size_kb

COMPOSITE_RECIPES = {
    "true_color": {"name": "True Color", "bands": ["C02", "C03", "C01"]},
    "natural_color": {"name": "Natural Color", "bands": ["C07", "C06", "C02"]},
    "fire_detection": {"name": "Fire Detection", "bands": ["C07", "C06", "C02"]},
    "dust_ash": {"name": "Dust/Ash", "bands": ["C15", "C14", "C13", "C11"]},
    "day_cloud_phase": {"name": "Day Cloud Phase", "bands": ["C13", "C02", "C05"]},
    "airmass": {"name": "Airmass", "bands": ["C08", "C10", "C12", "C13"]},
}
