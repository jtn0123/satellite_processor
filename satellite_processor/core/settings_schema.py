"""
Settings Schema Unification (#14)
---------------------------------
Maps between core SettingsManager keys (string-based video_quality)
and API SettingsUpdate keys (integer CRF video_quality 0-51).
"""

from __future__ import annotations

from typing import Any

# Canonical mapping: core quality string -> CRF integer
_QUALITY_TO_CRF: dict[str, int] = {
    "high": 18,
    "medium": 23,
    "low": 28,
}

_CRF_THRESHOLDS: list[tuple[int, str]] = [
    (20, "high"),
    (25, "medium"),
]


def _crf_to_quality(crf: int) -> str:
    for threshold, label in _CRF_THRESHOLDS:
        if crf <= threshold:
            return label
    return "low"


def to_core_settings(api_params: dict[str, Any]) -> dict[str, Any]:
    """Convert API-style settings (int CRF) to core SettingsManager keys.

    Example:
        >>> to_core_settings({"video_quality": 23})
        {"video_quality": "medium"}
    """
    result = dict(api_params)
    vq = result.get("video_quality")
    if isinstance(vq, int):
        result["video_quality"] = _crf_to_quality(vq)
    return result


def from_core_settings(core_settings: dict[str, Any]) -> dict[str, Any]:
    """Convert core SettingsManager keys (string quality) to API-style int CRF.

    Example:
        >>> from_core_settings({"video_quality": "high"})
        {"video_quality": 18}
    """
    result = dict(core_settings)
    vq = result.get("video_quality")
    if isinstance(vq, str) and vq in _QUALITY_TO_CRF:
        result["video_quality"] = _QUALITY_TO_CRF[vq]
    return result
