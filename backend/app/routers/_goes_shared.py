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

# Composite recipe band orderings.
#
# These are R/G/B channel orderings per NOAA's GOES Quick Guides:
# - True Color:     C02 (Red 0.64µm) + C03 (Veggie 0.86µm, as green proxy) + C01 (Blue 0.47µm)
# - Natural Color:  C03 (Veggie 0.86µm) + C02 (Red 0.64µm) + C01 (Blue 0.47µm)
#     Distinct from True Color by swapping Red<->Veggie to emphasize vegetation.
# - Fire Detection: C07 (Shortwave IR 3.9µm) + C06 (Cloud Particle 2.24µm) +
#                   C05 (Snow/Ice 1.61µm) — the daytime fire RGB (NOAA quick-guide).
#     Previously shared C07/C06/C02 with natural_color which was a typo; fire-
#     detection should use C07/C06/C05.
COMPOSITE_RECIPES = {
    "true_color": {"name": "True Color", "bands": ["C02", "C03", "C01"]},
    "natural_color": {"name": "Natural Color", "bands": ["C03", "C02", "C01"]},
    "fire_detection": {"name": "Fire Detection", "bands": ["C07", "C06", "C05"]},
    "dust_ash": {"name": "Dust/Ash", "bands": ["C15", "C14", "C13", "C11"]},
    "day_cloud_phase": {"name": "Day Cloud Phase", "bands": ["C13", "C02", "C05"]},
    "airmass": {"name": "Airmass", "bands": ["C08", "C10", "C12", "C13"]},
    "himawari_true_color": {"name": "Himawari True Color", "bands": ["B03", "B02", "B01"]},
}
