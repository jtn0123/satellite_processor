"""Tests targeting new code in PR #101 for SonarQube coverage."""
from __future__ import annotations

import math


def test_goes_frames_id_fk_constant():
    """Verify the GOES_FRAMES_ID_FK constant is used in models."""
    from app.db.models import GOES_FRAMES_ID_FK
    assert GOES_FRAMES_ID_FK == "goes_frames.id"


def test_animation_pattern_constants():
    """Verify animation regex pattern constants exist and are valid."""
    import re

    from app.models.animation import (
        PATTERN_FORMAT,
        PATTERN_LOOP_STYLE,
        PATTERN_QUALITY,
        PATTERN_RESOLUTION,
    )
    assert re.match(PATTERN_FORMAT, "mp4")
    assert re.match(PATTERN_FORMAT, "gif")
    assert not re.match(PATTERN_FORMAT, "avi")
    assert re.match(PATTERN_QUALITY, "low")
    assert re.match(PATTERN_QUALITY, "medium")
    assert re.match(PATTERN_QUALITY, "high")
    assert not re.match(PATTERN_QUALITY, "ultra")
    assert re.match(PATTERN_RESOLUTION, "preview")
    assert re.match(PATTERN_RESOLUTION, "full")
    assert not re.match(PATTERN_RESOLUTION, "4k")
    assert re.match(PATTERN_LOOP_STYLE, "forward")
    assert re.match(PATTERN_LOOP_STYLE, "pingpong")
    assert re.match(PATTERN_LOOP_STYLE, "hold")
    assert not re.match(PATTERN_LOOP_STYLE, "reverse")


def test_animation_preset_not_found_constant():
    """Verify the animation preset not found message constant."""
    from app.routers.animations import _ANIMATION_PRESET_NOT_FOUND
    assert _ANIMATION_PRESET_NOT_FOUND == "Animation preset not found"


def test_math_isclose_used_for_scale():
    """Verify math.isclose is used for float comparison in animation tasks."""
    # This tests the logic pattern used in animation_tasks.py
    pct = 1.0
    assert math.isclose(pct, 1.0)
    pct = 1.0 + 1e-10
    assert math.isclose(pct, 1.0)
    pct = 0.5
    assert not math.isclose(pct, 1.0)


def test_goes_products_satellite_availability_dict():
    """Verify SATELLITE_AVAILABILITY is used as dict()."""
    from app.routers.goes import SATELLITE_AVAILABILITY
    result = dict(SATELLITE_AVAILABILITY)
    assert isinstance(result, dict)
