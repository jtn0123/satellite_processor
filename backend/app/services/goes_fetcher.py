"""GOES satellite data fetcher using public NOAA S3 buckets."""
from __future__ import annotations

import logging
import tempfile
import time
from datetime import UTC, datetime, timedelta
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


def _retry_s3_operation(func, *args, max_retries: int = S3_MAX_RETRIES, operation: str = "unknown", **kwargs):
    """Execute an S3 operation with exponential backoff retry and circuit breaker.

    Retries on transient errors: timeouts, throttling, connection issues.
    """
    from ..circuit_breaker import CircuitBreakerOpen, s3_circuit_breaker
    from ..metrics import S3_FETCH_COUNT, S3_FETCH_ERRORS

    if not s3_circuit_breaker.allow_request():
        S3_FETCH_ERRORS.labels(operation=operation, error_type="circuit_open").inc()
        raise CircuitBreakerOpen("s3")

    _retryable_errors = (
        ConnectTimeoutError,
        ReadTimeoutError,
        EndpointConnectionError,
        ConnectionError,
        OSError,
    )
    for attempt in range(1, max_retries + 1):
        try:
            result = func(*args, **kwargs)
            S3_FETCH_COUNT.labels(operation=operation).inc()
            s3_circuit_breaker.record_success()
            return result
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
                s3_circuit_breaker.record_failure()
                S3_FETCH_ERRORS.labels(operation=operation, error_type=error_code or "client_error").inc()
                raise
        except _retryable_errors as exc:
            if attempt < max_retries:
                delay = S3_BASE_DELAY * (2 ** (attempt - 1))
                logger.warning(
                    "S3 connection error (attempt %d/%d), retrying in %.1fs",
                    attempt, max_retries, delay,
                )
                time.sleep(delay)
            else:
                s3_circuit_breaker.record_failure()
                S3_FETCH_ERRORS.labels(operation=operation, error_type=type(exc).__name__).inc()
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
    base = datetime(year, 1, 1, tzinfo=UTC) + timedelta(days=doy - 1)
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

        pages = _retry_s3_operation(_do_list, operation="list")
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


# Maximum output dimensions per sector. FullDisk (21696x21696) needs heavy
# downsampling; CONUS (5424x3000) is moderate; Mesoscale (1000x1000) is small
# enough to keep as-is.
SECTOR_MAX_DIM: dict[str, int] = {
    "FullDisk": 4096,
    "CONUS": 4096,
    "Mesoscale1": 2048,
    "Mesoscale2": 2048,
}


def _netcdf_to_png_from_file(nc_path: Path, output_path: Path, sector: str = "FullDisk") -> Path:
    """Convert a NetCDF file on disk to PNG (memory-efficient).

    For large arrays (e.g. FullDisk 21696x21696), uses strided slicing to
    downsample during load, keeping peak memory well under 500MB.
    """
    try:
        import netCDF4

        nc = netCDF4.Dataset(str(nc_path), "r")
        cmi_var = nc.variables["CMI"]
        shape = cmi_var.shape  # e.g. (21696, 21696)

        # Calculate stride based on sector-specific max dimension
        max_dim = SECTOR_MAX_DIM.get(sector, 4096)
        stride = max(1, max(shape[0], shape[1]) // max_dim)

        if stride > 1:
            logger.info(
                "Downsampling CMI %dx%d by stride %d → ~%dx%d",
                shape[0], shape[1], stride,
                shape[0] // stride, shape[1] // stride,
            )
            # Strided read — netCDF4 only reads the selected elements from disk
            cmi = cmi_var[::stride, ::stride]
        else:
            cmi = cmi_var[:]

        nc.close()

        # Convert masked array to regular numpy, replacing fill values with NaN
        if hasattr(cmi, "filled"):
            cmi = cmi.filled(np.nan).astype(np.float32)
        else:
            cmi = np.asarray(cmi, dtype=np.float32)

    except Exception:
        logger.warning("netCDF4 unavailable or read failed, generating placeholder")
        img = PILImage.new("L", (100, 100), 128)
        img.save(str(output_path))
        return output_path

    # Normalize to 0-255
    valid = cmi[~np.isnan(cmi)]
    if len(valid) == 0:
        h = cmi.shape[0] if len(cmi.shape) > 0 else 100
        w = cmi.shape[1] if len(cmi.shape) > 1 else 100
        img = PILImage.new("L", (w, h), 0)
    else:
        vmin, vmax = np.nanpercentile(cmi, [2, 98])
        if vmax <= vmin:
            vmax = vmin + 1
        # In-place operations to avoid copies
        np.clip(cmi, vmin, vmax, out=cmi)
        cmi -= vmin
        cmi *= 255.0 / (vmax - vmin)
        np.nan_to_num(cmi, nan=0, copy=False)
        img = PILImage.fromarray(cmi.astype(np.uint8))

    img.save(str(output_path))
    return output_path


def _netcdf_to_png(nc_bytes: bytes, output_path: Path, sector: str = "FullDisk") -> Path:
    """Convert NetCDF CMI data (bytes) to a PNG image."""
    with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
        tmp.write(nc_bytes)
        tmp_path = Path(tmp.name)
    try:
        return _netcdf_to_png_from_file(tmp_path, output_path, sector=sector)
    finally:
        tmp_path.unlink(missing_ok=True)


def _check_disk_space(path: Path, min_gb: float = 1.0) -> None:
    """Raise if available disk space is below threshold."""
    import shutil
    usage = shutil.disk_usage(path)
    free_gb = usage.free / (1024 ** 3)
    if free_gb < min_gb:
        raise OSError(
            f"Insufficient disk space: {free_gb:.1f} GB free, need at least {min_gb} GB. "
            f"Free up space or reduce the time range."
        )


# Maximum frames per single fetch to prevent OOM / disk exhaustion
MAX_FRAMES_PER_FETCH = 100


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

    # Check disk space before starting
    _check_disk_space(out, min_gb=1.0)

    available = list_available(satellite, sector, band, start_time, end_time)
    if not available:
        return []

    if len(available) > MAX_FRAMES_PER_FETCH:
        logger.warning(
            "Limiting fetch from %d to %d frames (max per job)",
            len(available), MAX_FRAMES_PER_FETCH,
        )
        available = available[:MAX_FRAMES_PER_FETCH]

    bucket = SATELLITE_BUCKETS[satellite]
    s3 = _get_s3_client()
    results: list[dict[str, Any]] = []

    for i, item in enumerate(available):
        try:
            # Check disk space every 10 frames
            if i > 0 and i % 10 == 0:
                _check_disk_space(out, min_gb=0.5)

            # Stream to temp file instead of holding full NetCDF in memory
            scan_time: datetime = item["scan_time"]
            png_name = f"{satellite}_{sector}_{band}_{scan_time.strftime('%Y%m%dT%H%M%S')}.png"
            png_path = out / png_name

            with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp_nc:
                tmp_nc_path = Path(tmp_nc.name)
                response = _retry_s3_operation(
                    s3.get_object, Bucket=bucket, Key=item["key"], operation="get",
                )
                # Stream in chunks to avoid holding entire file in memory
                for chunk in response["Body"].iter_chunks(chunk_size=1024 * 1024):
                    tmp_nc.write(chunk)

            try:
                _netcdf_to_png_from_file(tmp_nc_path, png_path, sector=sector)
            finally:
                tmp_nc_path.unlink(missing_ok=True)

            results.append({
                "path": str(png_path),
                "scan_time": scan_time,
                "satellite": satellite,
                "band": band,
                "sector": sector,
            })

            if on_progress:
                on_progress(i + 1, len(available))

        except OSError:
            # Disk space errors should stop the whole job
            raise
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
            s3.get_object, Bucket=SATELLITE_BUCKETS[satellite], Key=closest["key"], operation="get",
        )
        nc_bytes = response["Body"].read()
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        try:
            _netcdf_to_png(nc_bytes, tmp_path, sector=sector)
            return tmp_path.read_bytes()
        finally:
            tmp_path.unlink(missing_ok=True)
    except Exception:
        logger.exception("Failed to fetch preview")
        return None
