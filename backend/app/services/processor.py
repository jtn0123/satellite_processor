"""Shared processor configuration utility.

The ProcessorService class was removed (unused dead code — audit #3 finding #3).
"""

import sys
from pathlib import Path

# Add parent project to path so we can import the core module
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from satellite_processor.core.processor import SatelliteImageProcessor
from satellite_processor.core.settings_schema import to_core_settings


def configure_processor(processor: SatelliteImageProcessor, params: dict):
    # Unify API-style settings to core format (#14)
    params = to_core_settings(params)
    """Configure processor settings from API params — single source of truth.

    Used by both the Celery tasks and any direct processor invocations.
    """
    sm = processor.settings_manager

    if params.get("crop"):
        crop = params["crop"]
        sm.set("crop_enabled", True)
        sm.set("crop_x", crop.get("x", 0))
        sm.set("crop_y", crop.get("y", 0))
        sm.set("crop_width", crop.get("w", 1920))
        sm.set("crop_height", crop.get("h", 1080))

    if params.get("false_color"):
        fc = params["false_color"]
        sm.set("false_color_enabled", True)
        sm.set("false_color_method", fc.get("method", "vegetation"))

    if params.get("timestamp"):
        ts = params["timestamp"]
        sm.set("timestamp_enabled", True)
        sm.set("timestamp_position", ts.get("position", "bottom-left"))

    if params.get("scale"):
        sc = params["scale"]
        sm.set("scale_enabled", True)
        sm.set("scale_factor", sc.get("factor", 1.0))
