"""GOES satellite data fetcher using public NOAA S3 buckets."""
from __future__ import annotations

import logging
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import boto3
import numpy as np
from botocore import UNSIGNED
from botocore.config import Config
from botocore.exceptions import (
    ClientError,
    ConnectTimeoutError,
    EndpointConnectionError,
    ReadTimeoutError,
)
from PIL import Image as PILImage

logger = logging.getLogger(__name__)

# Retry configuration for S3 operations
S3_MAX_RETRIES = 3
S3_BASE_DELAY = 1.0  # seconds
S3_READ_TIMEOUT = 60  # seconds per object download
S3_CONNECT_TIMEOUT = 10  # seconds

# Satellite → S3 bucket mapping
SATELLITE_BUCKETS: dict[str, str] = {
    "GOES-16": "noaa-goes16",
    "GOES-18": "noaa-goes18",
    "GOES-19": "noaa-goes19",
}

# Satellite availability metadata
SATELLITE_AVAILABILITY: dict[str, dict[str, Any]] = {
    "GOES-16": {
        "available_from": "2017-01-01",
        "available_to": "2025-04-07",
        "status": "historical",
        "description": "GOES-East (historical, replaced by GOES-19)",
    },
    "GOES-18": {
        "available_from": "2022-01-01",
        "available_to": None,
        "status": "active",
        "description": "GOES-West (active)",
    },
    "GOES-19": {
        "available_from": "2024-01-01",
        "available_to": None,
        "status": "active",
        "description": "GOES-East (active, replaced GOES-16)",
    },
}

# Sector → product prefix mapping
SECTOR_PRODUCTS: dict[str, str] = {
    "FullDisk": "ABI-L2-CMIPF",
    "CONUS": "ABI-L2-CMIPC",
    "Mesoscale1": "ABI-L2-CMIPM",
    "Mesoscale2": "ABI-L2-CMIPM",
}

# All 16 ABI bands
VALID_BANDS: list[str] = [f"C{i:02d}" for i in range(1, 17)]

# Expected scan intervals per sector (minutes)
SECTOR_INTERVALS: dict[str, int] = {
    "FullDisk": 10,
    "CONUS": 5,
    "Mesoscale1": 1,
    "Mesoscale2": 1,
}


def _get_s3_client():
    """Create an unsigned S3 client for public NOAA buckets."""
    return boto3.client(
        "s3",
        config=Config(
            signature_version=UNSIGNED,
            connect_timeout=S3_CONNECT_TIMEOUT,
            read_timeout=S3_READ_TIMEOUT,
            retries={"max_attempts": 0},  # We handle retries ourselves
        ),
    )


def _retry_s3_operation(func, *args, max_retries: int = S3_MAX_RETRIES, **kwargs):
    """Execute an S3 operation with exponential backoff retry.

    Retries on transient errors: timeouts, throttling, connection issues.
    """
    _retryable_errors = (
        ConnectTimeoutError,
        ReadTimeoutError,
        EndpointConnectionError,
        ConnectionError,
        OSError,
    )
    for attempt in range(1, max_retries + 1):
        try:
            return func(*args, **kwargs)
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code", "")
            if error_code in ("Throttling", "SlowDown", "RequestTimeout") and attempt < max_retries:
                delay = S3_BASE_DELAY * (2 ** (attempt - 1))
                logger.warning(
                    "S3 throttled/timeout (attempt %d/%d, code=%s), retrying in %.1fs",
                    attempt, max_retries, error_code, delay,
                )
                time.sleep(delay)
            else:
                raise
        except _retryable_errors:
            if attempt < max_retries:
                delay = S3_BASE_DELAY * (2 ** (attempt - 1))
                logger.warning(
                    "S3 connection error (attempt %d/%d), retrying in %.1fs",
                    attempt, max_retries, delay,
                )
                time.sleep(delay)
            else:
                raise


def _build_s3_prefix(_satellite: str, sector: str, _band: str, dt_obj: datetime) -> str:
    """Build the S3 key prefix for a specific hour.

    Note: satellite and band are accepted for future use (bucket selection,
    band-specific products) but not yet used in the prefix.
    """
    product = SECTOR_PRODUCTS[sector]
    day_of_year = dt_obj.timetuple().tm_yday
    return f"{product}/{dt_obj.year}/{day_of_year:03d}/{dt_obj.hour:02d}/"


def _parse_scan_time(key: str) -> datetime | None:
    """Extract scan start time from S3 key filename.

    Filename pattern: OR_ABI-L2-CMIPF-M6C02_G16_sYYYYDDDHHMMSSs_...
    The 's' prefix before the timestamp is part of the GOES naming convention.
    """
    import re

    match = re.search(r"_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})\d", key)
    if not match:
        return None
    year, doy, hour, minute, second = (int(x) for x in match.groups())
    base = datetime(year, 1, 1) + timedelta(days=doy - 1)
    return base.replace(hour=hour, minute=minute, second=second)


def _matches_sector_and_band(key: str, sector: str, band: str) -> bool:
    """Check if an S3 key matches the requested sector and band."""
    filename = key.rsplit("/", 1)[-1] if "/" in key else key
    # Check band — mode can be M3, M4, or M6
    band_found = False
    for mode in ("M3", "M4", "M6"):
        if f"-{mode}{band}_" in filename:
            band_found = True
            break
    if not band_found:
        return False
    # For Mesoscale, check M1 vs M2
    # Pattern: OR_ABI-L2-CMIPM1-M6C02 vs OR_ABI-L2-CMIPM2-M6C02
    if sector == "Mesoscale1" and "CMIPM1" not in filename:
        return False
    if sector == "Mesoscale2" and "CMIPM2" not in filename:
        return False
    return True


def validate_params(satellite: str, sector: str, band: str) -> None:
    """Validate satellite, sector, and band parameters."""
    if satellite not in SATELLITE_BUCKETS:
        raise ValueError(f"Unknown satellite: {satellite}. Valid: {list(SATELLITE_BUCKETS)}")
    if sector not in SECTOR_PRODUCTS:
        raise ValueError(f"Unknown sector: {sector}. Valid: {list(SECTOR_PRODUCTS)}")
    if band not in VALID_BANDS:
        raise ValueError(f"Unknown band: {band}. Valid: {VALID_BANDS}")


def _list_hour(
    s3, bucket: str, prefix: str, sector: str, band: str,
    start_time: datetime, end_time: datetime,
) -> list[dict[str, Any]]:
    """List matching files for a single hour prefix."""
    results: list[dict[str, Any]] = []
    try:
        paginator = s3.get_paginator("list_objects_v2")

        def _do_list():
            return list(paginator.paginate(Bucket=bucket, Prefix=prefix))

        pages = _retry_s3_operation(_do_list)
        for page in pages:
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if not _matches_sector_and_band(key, sector, band):
                    continue
                scan_time = _parse_scan_time(key)
                if scan_time and start_time <= scan_time <= end_time:
                    results.append({"key": key, "scan_time": scan_time, "size": obj["Size"]})
    except (ClientError, ConnectTimeoutError, ReadTimeoutError, EndpointConnectionError) as exc:
        logger.warning("Failed to list S3 prefix %s/%s: %s", bucket, prefix, exc)
    except Exception:
        logger.warning("Failed to list S3 prefix %s/%s", bucket, prefix, exc_info=True)
    return results


def list_available(
    satellite: str,
    sector: str,
    band: str,
    start_time: datetime,
    end_time: datetime,
) -> list[dict[str, Any]]:
    """List available GOES files on S3 for the given parameters and time range.

    Returns list of dicts with 'key', 'scan_time', 'size' fields.
    """
    validate_params(satellite, sector, band)
    bucket = SATELLITE_BUCKETS[satellite]
    s3 = _get_s3_client()

    results: list[dict[str, Any]] = []
    current = start_time.replace(minute=0, second=0, microsecond=0)
    end_ceil = end_time.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)

    while current < end_ceil:
        prefix = _build_s3_prefix(satellite, sector, band, current)
        results.extend(_list_hour(s3, bucket, prefix, sector, band, start_time, end_time))
        current += timedelta(hours=1)

    results.sort(key=lambda x: x["scan_time"])
    return results


def _netcdf_to_png(nc_bytes: bytes, output_path: Path) -> Path:
    """Convert NetCDF CMI data to a PNG image."""
    try:
        import xarray as xr

        with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
            tmp.write(nc_bytes)
            tmp_path = tmp.name

        ds = xr.open_dataset(tmp_path, engine="netcdf4")
        cmi = ds["CMI"].values
        ds.close()
        Path(tmp_path).unlink(missing_ok=True)
    except Exception:
        logger.warning("xarray/netCDF4 unavailable, generating placeholder image")
        # Generate a small placeholder if netcdf libs are missing
        img = PILImage.new("L", (100, 100), 128)
        img.save(str(output_path))
        return output_path

    # Normalize to 0-255
    valid = cmi[~np.isnan(cmi)]
    if len(valid) == 0:
        img = PILImage.new("L", (cmi.shape[1] if len(cmi.shape) > 1 else 100, cmi.shape[0] if len(cmi.shape) > 0 else 100), 0)
    else:
        vmin, vmax = np.nanpercentile(cmi, [2, 98])
        if vmax <= vmin:
            vmax = vmin + 1
        normalized = np.clip((cmi - vmin) / (vmax - vmin) * 255, 0, 255)
        normalized = np.nan_to_num(normalized, nan=0).astype(np.uint8)
        img = PILImage.fromarray(normalized)

    img.save(str(output_path))
    return output_path


def fetch_frames(
    satellite: str,
    sector: str,
    band: str,
    start_time: datetime,
    end_time: datetime,
    output_dir: str,
    on_progress: Any | None = None,
) -> list[dict[str, Any]]:
    """Download GOES frames and convert to PNG.

    Returns list of dicts with 'path', 'scan_time', 'satellite', 'band' fields.
    """
    validate_params(satellite, sector, band)
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    available = list_available(satellite, sector, band, start_time, end_time)
    if not available:
        return []

    bucket = SATELLITE_BUCKETS[satellite]
    s3 = _get_s3_client()
    results: list[dict[str, Any]] = []

    for i, item in enumerate(available):
        try:
            response = _retry_s3_operation(s3.get_object, Bucket=bucket, Key=item["key"])
            nc_bytes = response["Body"].read()

            scan_time: datetime = item["scan_time"]
            png_name = f"{satellite}_{sector}_{band}_{scan_time.strftime('%Y%m%dT%H%M%S')}.png"
            png_path = out / png_name
            _netcdf_to_png(nc_bytes, png_path)

            results.append({
                "path": str(png_path),
                "scan_time": scan_time,
                "satellite": satellite,
                "band": band,
                "sector": sector,
            })

            if on_progress:
                on_progress(i + 1, len(available))

        except (ClientError, ConnectTimeoutError, ReadTimeoutError, EndpointConnectionError) as exc:
            logger.warning("Failed to fetch %s: %s", item["key"], exc)
        except Exception:
            logger.exception("Unexpected error fetching %s", item["key"])

    return results


def fetch_single_preview(
    satellite: str,
    sector: str,
    band: str,
    time: datetime,
) -> bytes | None:
    """Fetch the closest single frame to the given time and return PNG bytes."""
    validate_params(satellite, sector, band)
    window = timedelta(minutes=SECTOR_INTERVALS.get(sector, 10) * 2)
    available = list_available(satellite, sector, band, time - window, time + window)
    if not available:
        return None

    # Find closest
    closest = min(available, key=lambda x: abs((x["scan_time"] - time).total_seconds()))
    s3 = _get_s3_client()
    try:
        response = _retry_s3_operation(
            s3.get_object, Bucket=SATELLITE_BUCKETS[satellite], Key=closest["key"],
        )
        nc_bytes = response["Body"].read()
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        try:
            _netcdf_to_png(nc_bytes, tmp_path)
            return tmp_path.read_bytes()
        finally:
            tmp_path.unlink(missing_ok=True)
    except Exception:
        logger.exception("Failed to fetch preview")
        return None
