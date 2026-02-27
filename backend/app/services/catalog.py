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

# CDN sector mapping: internal sector names → CDN path segments
CDN_SECTOR_MAP: dict[str, str] = {
    "CONUS": "CONUS",
    "FullDisk": "FD",
    "Mesoscale1": "MESO1",
    "Mesoscale2": "MESO2",
}

# CDN resolution defaults per sector
CDN_RESOLUTIONS: dict[str, dict[str, str]] = {
    "CONUS": {"desktop": "2500x1500", "mobile": "1250x750", "thumbnail": "625x375"},
    "FullDisk": {"desktop": "1808x1808", "mobile": "1808x1808", "thumbnail": "678x678"},
    "Mesoscale1": {"desktop": "2500x1500", "mobile": "1250x750", "thumbnail": "625x375"},
    "Mesoscale2": {"desktop": "2500x1500", "mobile": "1250x750", "thumbnail": "625x375"},
}

logger = logging.getLogger(__name__)


def build_cdn_urls(
    satellite: str, sector: str, band: str
) -> dict[str, str] | None:
    """Build NOAA CDN image URLs for multiple resolutions.

    The CDN always serves the latest image at each resolution — no timestamp
    is needed in the filename.

    Returns dict with keys: desktop, mobile, thumbnail — or None on failure.
    """
    if sector in ("Mesoscale1", "Mesoscale2"):
        return None

    # Satellite: "GOES-19" → "GOES19"
    sat_cdn = satellite.replace("-", "")

    # Sector mapping
    cdn_sector = CDN_SECTOR_MAP.get(sector)
    if cdn_sector is None:
        logger.warning("No CDN sector mapping for %s", sector)
        return None

    # Band: "C02" → "02", but GEOCOLOR stays as-is
    if band == "GEOCOLOR":
        cdn_band = "GEOCOLOR"
    elif band.startswith("C"):
        cdn_band = band.lstrip("C")
    else:
        cdn_band = band

    resolutions = CDN_RESOLUTIONS.get(sector, CDN_RESOLUTIONS["CONUS"])
    base = f"https://cdn.star.nesdis.noaa.gov/{sat_cdn}/ABI/{cdn_sector}/{cdn_band}"

    return {
        res_key: f"{base}/{res_val}.jpg"
        for res_key, res_val in resolutions.items()
    }


def _normalize_date(date: datetime | None) -> datetime:
    """Normalize an optional date to a UTC-aware datetime (defaults to now)."""
    if date is None:
        return datetime.now(UTC)
    if date.tzinfo is not None:
        return date.astimezone(UTC)
    return date.replace(tzinfo=UTC)


def _collect_matching_entries(
    s3: Any,
    bucket: str,
    prefix: str,
    sector: str,
    band: str,
) -> list[dict[str, Any]]:
    """Page through S3 listing and return matching entries."""
    results: list[dict[str, Any]] = []
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
    return results


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
    date = _normalize_date(date)

    bucket = SATELLITE_BUCKETS[satellite]
    s3 = _get_s3_client()
    results: list[dict[str, Any]] = []

    base = date.replace(hour=0, minute=0, second=0, microsecond=0)
    for hour in range(24):
        dt = base + timedelta(hours=hour)
        if dt > datetime.now(UTC):
            break
        prefix = _build_s3_prefix(satellite, sector, band, dt)
        try:
            results.extend(_collect_matching_entries(s3, bucket, prefix, sector, band))
        except Exception:
            logger.warning("Failed listing %s/%s", bucket, prefix, exc_info=True)

    results.sort(key=lambda x: x["scan_time"])
    return results


def _is_newer_scan(scan_time: datetime, current_latest: dict[str, Any] | None) -> bool:
    """Check whether scan_time is newer than the current latest entry."""
    if current_latest is None:
        return True
    existing = _normalize_date(datetime.fromisoformat(current_latest["scan_time"]))
    return scan_time > existing


def catalog_latest(
    satellite: str,
    sector: str,
    band: str = "C02",
) -> dict[str, Any] | None:
    """Find the most recent available frame (checks last 2 hours)."""
    validate_params(satellite, sector, band)
    bucket = SATELLITE_BUCKETS[satellite]
    s3 = _get_s3_client()

    now = datetime.now(UTC)
    latest: dict[str, Any] | None = None

    for hours_ago in range(3):
        dt = now - timedelta(hours=hours_ago)
        dt = dt.replace(minute=0, second=0, microsecond=0)
        prefix = _build_s3_prefix(satellite, sector, band, dt)
        try:
            entries = _collect_matching_entries(s3, bucket, prefix, sector, band)
            for entry in entries:
                scan_time = _normalize_date(datetime.fromisoformat(entry["scan_time"]))
                if _is_newer_scan(scan_time, latest):
                    latest = {
                        **entry,
                        "satellite": satellite,
                        "sector": sector,
                        "band": band,
                    }
        except Exception:
            logger.warning("Failed listing %s/%s", bucket, prefix, exc_info=True)
        # Early exit: if we found results in this hour, no need to check older hours
        if latest is not None:
            break

    if latest is not None:
        cdn_urls = build_cdn_urls(satellite, sector, band)
        if cdn_urls:
            latest["image_url"] = cdn_urls["desktop"]
            latest["thumbnail_url"] = cdn_urls["thumbnail"]
            latest["mobile_url"] = cdn_urls["mobile"]
        else:
            # Fallback to S3 URL if CDN URL can't be built
            s3_fallback = f"https://{bucket}.s3.amazonaws.com/{latest['key']}"
            latest["image_url"] = s3_fallback
            latest["mobile_url"] = s3_fallback
            latest["thumbnail_url"] = s3_fallback

    return latest


def catalog_available(satellite: str) -> dict[str, Any]:
    """Check which sectors have recent data (last 2 hours) on S3."""
    from ..services.goes_fetcher import SECTOR_PRODUCTS as _SECTOR_PRODUCTS

    bucket = SATELLITE_BUCKETS.get(satellite)
    if not bucket:
        raise ValueError(f"Unknown satellite: {satellite}")
    s3 = _get_s3_client()
    now = datetime.now(UTC)

    available_sectors: list[str] = []
    for sector in _SECTOR_PRODUCTS:
        found = False
        for hours_ago in range(2):
            dt = now - timedelta(hours=hours_ago)
            dt = dt.replace(minute=0, second=0, microsecond=0)
            prefix = _build_s3_prefix(satellite, sector, "C02", dt)
            try:
                resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=1)
                if resp.get("Contents"):
                    found = True
                    break
            except Exception:
                logger.warning("Failed checking availability %s/%s", bucket, prefix, exc_info=True)
        if found:
            available_sectors.append(sector)

    return {
        "satellite": satellite,
        "available_sectors": available_sectors,
        "checked_at": now.isoformat(),
    }
