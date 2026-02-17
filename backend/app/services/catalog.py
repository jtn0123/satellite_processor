"""GOES S3 catalog service — query available imagery from NOAA public buckets."""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from ..services.goes_fetcher import (
    SATELLITE_BUCKETS,
    _build_s3_prefix,
    _get_s3_client,
    _matches_sector_and_band,
    _parse_scan_time,
    validate_params,
)

logger = logging.getLogger(__name__)


def catalog_list(
    satellite: str,
    sector: str,
    band: str,
    date: datetime | None = None,
) -> list[dict[str, Any]]:
    """List available captures for a given satellite/sector/band/date.

    Returns list of dicts: {scan_time, size, key}
    """
    validate_params(satellite, sector, band)
    if date is None:
        date = datetime.now(UTC)

    bucket = SATELLITE_BUCKETS[satellite]
    s3 = _get_s3_client()
    results: list[dict[str, Any]] = []

    # Iterate all 24 hours of the given date
    base = date.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=UTC)
    for hour in range(24):
        dt = base + timedelta(hours=hour)
        # Don't query future hours
        if dt > datetime.now(UTC):
            break
        prefix = _build_s3_prefix(satellite, sector, band, dt)
        try:
            paginator = s3.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
                for obj in page.get("Contents", []):
                    key = obj["Key"]
                    if not _matches_sector_and_band(key, sector, band):
                        continue
                    scan_time = _parse_scan_time(key)
                    if scan_time:
                        results.append({
                            "scan_time": scan_time.isoformat(),
                            "size": obj["Size"],
                            "key": key,
                        })
        except Exception:
            logger.warning("Failed listing %s/%s", bucket, prefix, exc_info=True)

    results.sort(key=lambda x: x["scan_time"])
    return results


def catalog_latest(
    satellite: str,
    sector: str,
) -> dict[str, Any] | None:
    """Find the most recent available frame (checks last 2 hours, all bands C02 default)."""
    band = "C02"  # Use C02 (Red) as representative band
    validate_params(satellite, sector, band)
    bucket = SATELLITE_BUCKETS[satellite]
    s3 = _get_s3_client()

    now = datetime.now(UTC)
    latest: dict[str, Any] | None = None

    for hours_ago in range(2):
        dt = now - timedelta(hours=hours_ago)
        dt = dt.replace(minute=0, second=0, microsecond=0)
        prefix = _build_s3_prefix(satellite, sector, band, dt)
        try:
            paginator = s3.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
                for obj in page.get("Contents", []):
                    key = obj["Key"]
                    if not _matches_sector_and_band(key, sector, band):
                        continue
                    scan_time = _parse_scan_time(key)
                    if scan_time and (latest is None or scan_time > datetime.fromisoformat(latest["scan_time"]).replace(tzinfo=UTC)):
                        latest = {
                            "scan_time": scan_time.isoformat(),
                            "size": obj["Size"],
                            "key": key,
                            "satellite": satellite,
                            "sector": sector,
                            "band": band,
                        }
        except Exception:
            logger.warning("Failed listing %s/%s", bucket, prefix, exc_info=True)

    return latest
