"""Himawari S3 catalog service — query available imagery from NOAA public bucket.

Himawari-9 data lives in ``noaa-himawari9`` with a calendar-date path layout
(``AHI-L1b-FLDK/YYYY/MM/DD/HHMM/``) and each observation time produces 160
files (16 bands × 10 segments).  Functions here deduplicate to unique
timestamps and expose a catalog interface parallel to the GOES helpers in
``catalog.py``.
"""
from __future__ import annotations

import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any

from .goes_fetcher import _get_s3_client, _retry_s3_operation
from .satellite_registry import SATELLITE_REGISTRY

logger = logging.getLogger(__name__)

# Sector → S3 product prefix
_HIMAWARI_SECTOR_PREFIXES: dict[str, str] = {
    "FLDK": "AHI-L1b-FLDK",
    "Japan": "AHI-L1b-Japan",
    "Target": "AHI-L1b-Target",
}

# Regex for Himawari HSD filenames:
# HS_H09_20260303_0000_B13_FLDK_R20_S0510.DAT.bz2
_HIMAWARI_FILENAME_RE = re.compile(
    r"HS_H\d{2}_"
    r"(?P<date>\d{8})_"
    r"(?P<time>\d{4})_"
    r"B(?P<band>\d{2})_"
    r"(?P<sector>[A-Za-z]+)_"
    r"R(?P<resolution>\d{2})_"
    r"S(?P<segment>\d{2,4})"
)


def _build_himawari_prefix(sector: str, dt: datetime) -> str:
    """Build the S3 key prefix for a Himawari observation time.

    Returns a path like ``AHI-L1b-FLDK/2026/03/03/0000/``.
    """
    product = _HIMAWARI_SECTOR_PREFIXES.get(sector)
    if product is None:
        raise ValueError(
            f"Unknown Himawari sector: {sector}. "
            f"Valid: {list(_HIMAWARI_SECTOR_PREFIXES)}"
        )
    return (
        f"{product}/{dt.year:04d}/{dt.month:02d}/{dt.day:02d}/"
        f"{dt.hour:02d}{dt.minute:02d}/"
    )


def _build_himawari_date_prefix(sector: str, dt: datetime) -> str:
    """Build an S3 prefix for a whole day (no HHMM component).

    Returns ``AHI-L1b-FLDK/2026/03/03/``.
    """
    product = _HIMAWARI_SECTOR_PREFIXES.get(sector)
    if product is None:
        raise ValueError(f"Unknown Himawari sector: {sector}")
    return f"{product}/{dt.year:04d}/{dt.month:02d}/{dt.day:02d}/"


def _parse_himawari_filename(key: str) -> dict[str, Any] | None:
    """Extract metadata from a Himawari HSD filename.

    Returns a dict with keys: band, sector, segment, resolution, date, time,
    or *None* if the filename doesn't match the expected pattern.
    """
    filename = key.rsplit("/", 1)[-1] if "/" in key else key
    m = _HIMAWARI_FILENAME_RE.search(filename)
    if not m:
        return None
    return {
        "band": f"B{m.group('band')}",
        "sector": m.group("sector"),
        "segment": int(m.group("segment")[:2]),  # first 2 digits = segment number
        "resolution": int(m.group("resolution")),
        "date": m.group("date"),
        "time": m.group("time"),
    }


def _matches_himawari_band(key: str, band: str) -> bool:
    """Return True if the S3 key belongs to the requested band."""
    parsed = _parse_himawari_filename(key)
    if parsed is None:
        return False
    return parsed["band"] == band


def _parse_himawari_scan_time(key: str) -> datetime | None:
    """Extract the observation time from a Himawari filename.

    Returns a timezone-aware UTC datetime, or *None* for unparseable names.
    """
    parsed = _parse_himawari_filename(key)
    if parsed is None:
        return None
    try:
        return datetime.strptime(
            f"{parsed['date']}{parsed['time']}", "%Y%m%d%H%M"
        ).replace(tzinfo=UTC)
    except ValueError:
        return None


def _list_s3_keys(bucket: str, prefix: str) -> list[dict[str, Any]]:
    """Page through S3 and return all object metadata under *prefix*."""
    s3 = _get_s3_client()
    paginator = s3.get_paginator("list_objects_v2")

    def _do_list():
        results: list[dict[str, Any]] = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                results.append(obj)
        return results

    return _retry_s3_operation(_do_list, operation="himawari_list")


def list_himawari_timestamps(
    sector: str,
    band: str,
    date: datetime,
) -> list[dict[str, Any]]:
    """List unique observation timestamps from S3 for a given day.

    Returns a sorted list of ``{scan_time, key}`` dicts with one entry per
    unique timestamp (deduplicating across the 10 segments per band).
    """
    bucket = SATELLITE_REGISTRY["Himawari-9"].bucket
    prefix = _build_himawari_date_prefix(sector, date)

    try:
        objects = _list_s3_keys(bucket, prefix)
    except Exception:
        logger.warning("Failed listing Himawari S3 %s/%s", bucket, prefix, exc_info=True)
        return []

    seen: dict[str, dict[str, Any]] = {}
    for obj in objects:
        key = obj["Key"]
        if not _matches_himawari_band(key, band):
            continue
        scan_time = _parse_himawari_scan_time(key)
        if scan_time is None:
            continue
        iso = scan_time.isoformat()
        if iso not in seen:
            seen[iso] = {
                "scan_time": iso,
                "key": key,
                "size": obj.get("Size", 0),
            }

    return sorted(seen.values(), key=lambda x: x["scan_time"])


def himawari_catalog_latest(
    sector: str,
    band: str,
) -> dict[str, Any] | None:
    """Find the most recent available Himawari frame (checks last 3 hours).

    Returns a result dict compatible with GOES ``catalog_latest`` but with
    ``image_url: None`` (Himawari has no CDN).
    """
    now = datetime.now(UTC)

    for hours_ago in range(4):
        dt = now - timedelta(hours=hours_ago)
        timestamps = list_himawari_timestamps(sector, band, dt)
        if timestamps:
            latest = timestamps[-1]
            return {
                **latest,
                "satellite": "Himawari-9",
                "sector": sector,
                "band": band,
                "image_url": None,
                "mobile_url": None,
                "thumbnail_url": None,
            }

    return None
