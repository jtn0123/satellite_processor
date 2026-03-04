"""GOES catalog, products, and metadata endpoints."""

import asyncio
import logging

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import DEFAULT_SATELLITE
from ..db.database import get_db
from ..db.models import GoesFrame
from ..errors import APIError
from ..rate_limit import limiter
from ..services.cache import get_cached, make_cache_key
from ..services.goes_fetcher import (
    SECTOR_INTERVALS,
    SECTOR_PRODUCTS,
    VALID_BANDS,
)
from ..services.satellite_registry import SATELLITE_REGISTRY
from ._goes_shared import (
    BAND_DESCRIPTIONS,
    BAND_METADATA,
    SECTOR_DISPLAY_NAMES,
    SECTOR_FILE_SIZES_KB,
    _s3_executor,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/satellite", tags=["satellite-catalog"])


@router.get("/products")
async def list_products(response: Response):
    """List available satellites, sectors, and bands with enhanced metadata.

    Returns all registered satellites (GOES + Himawari) with per-satellite
    sectors, bands, and availability.  Each satellite entry includes a
    ``fetchable`` flag indicating whether the fetch pipeline supports it.
    """
    logger.debug("Listing satellite products")
    response.headers["Cache-Control"] = "public, max-age=300"
    cache_key = make_cache_key("products")

    # Build per-satellite detail blocks
    satellite_details = {}
    for name, cfg in SATELLITE_REGISTRY.items():
        satellite_details[name] = {
            "bucket": cfg.bucket,
            "format": cfg.format,
            "fetchable": cfg.fetchable,
            "availability": cfg.availability,
            "sectors": [
                {
                    "id": sec_id,
                    "name": sec_cfg.display_name,
                    "product": sec_cfg.product_prefix,
                    "cadence_minutes": sec_cfg.cadence_minutes,
                    "typical_file_size_kb": sec_cfg.file_size_kb,
                    "cdn_available": sec_cfg.cdn_available,
                }
                for sec_id, sec_cfg in cfg.sectors.items()
            ],
            "bands": [
                {
                    "id": band,
                    "description": cfg.band_descriptions.get(band, band),
                    **(cfg.band_metadata.get(band, {})),
                }
                for band in cfg.bands
            ],
        }

    # Backward-compatible top-level keys (GOES-centric, for existing frontend)
    cdn_sectors = {"CONUS", "FullDisk"}
    products = {
        "satellites": list(SATELLITE_REGISTRY),
        "satellite_availability": {
            name: cfg.availability for name, cfg in SATELLITE_REGISTRY.items()
        },
        "satellite_details": satellite_details,
        "sectors": [
            {
                "id": k,
                "name": SECTOR_DISPLAY_NAMES.get(k, k),
                "product": v,
                "cadence_minutes": SECTOR_INTERVALS.get(k, 10),
                "typical_file_size_kb": SECTOR_FILE_SIZES_KB.get(k, 4000),
                "cdn_available": k in cdn_sectors,
            }
            for k, v in SECTOR_PRODUCTS.items()
        ],
        "bands": [
            {
                "id": band,
                "description": BAND_DESCRIPTIONS.get(band, band),
                **(BAND_METADATA.get(band, {})),
            }
            for band in VALID_BANDS
        ],
        "default_satellite": DEFAULT_SATELLITE,
    }

    def _fetch():
        return products

    return await get_cached(cache_key, ttl=300, fetch_fn=_fetch)


@router.get("/catalog")
@limiter.limit("20/minute")
async def catalog(
    request: Request,
    satellite: str = Query(DEFAULT_SATELLITE),
    sector: str = Query("CONUS"),
    band: str = Query("C02"),
    date: str | None = Query(None, description="Date in YYYY-MM-DD format, defaults to today"),
):
    """Query NOAA S3 for available GOES captures."""
    logger.debug("GOES catalog requested")
    from datetime import UTC, datetime

    from ..services.catalog import catalog_list

    dt = None
    if date:
        try:
            dt = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=UTC)
        except ValueError:
            raise APIError(400, "invalid_date", "Date must be in YYYY-MM-DD format")

    effective_date = date or datetime.now(UTC).strftime("%Y-%m-%d")
    cache_key = make_cache_key(f"catalog:{satellite}:{sector}:{band}:{effective_date}")

    async def _fetch():
        loop = asyncio.get_running_loop()
        items = await loop.run_in_executor(_s3_executor, lambda: catalog_list(satellite, sector, band, dt))
        return {"items": items, "total": len(items)}

    return await get_cached(cache_key, ttl=300, fetch_fn=_fetch)


@router.get("/catalog/latest")
@limiter.limit("30/minute")
async def catalog_latest(
    request: Request,
    response: Response,
    satellite: str = Query(DEFAULT_SATELLITE),
    sector: str = Query("CONUS"),
    band: str = Query("C02"),
):
    """Return the most recent available frame on S3 (checks last 2 hours)."""
    logger.debug("GOES catalog latest requested")
    response.headers["Cache-Control"] = "public, max-age=60"
    from ..services.catalog import catalog_latest as _catalog_latest

    cache_key = make_cache_key(f"catalog-latest:{satellite}:{sector}:{band}")

    async def _fetch():
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(_s3_executor, lambda: _catalog_latest(satellite, sector, band))

    result = await get_cached(cache_key, ttl=60, fetch_fn=_fetch)
    if not result:
        raise APIError(404, "not_found", "No recent frames found")
    return result


@router.get("/catalog/available")
@limiter.limit("10/minute")
async def catalog_available(
    request: Request,
    satellite: str = Query(DEFAULT_SATELLITE),
):
    """Check which sectors have recent data (last 2 hours) on S3."""
    logger.debug("GOES catalog available requested")
    from ..services.catalog import catalog_available as _catalog_available

    cache_key = make_cache_key(f"catalog-available:{satellite}")

    async def _fetch():
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(_s3_executor, lambda: _catalog_available(satellite))

    return await get_cached(cache_key, ttl=120, fetch_fn=_fetch)


@router.get("/preview/band-samples")
@limiter.limit("10/minute")
async def band_sample_thumbnails(
    request: Request,
    satellite: str = Query(DEFAULT_SATELLITE),
    sector: str = Query("CONUS"),
    db: AsyncSession = Depends(get_db),
):
    """Return thumbnail URLs for the latest frame of each band."""
    logger.debug("Band sample thumbnails requested")

    cache_key = make_cache_key(f"band-samples:{satellite}:{sector}")

    async def _fetch():
        results = {}
        for band_id in VALID_BANDS:
            result = await db.execute(
                select(GoesFrame.id, GoesFrame.thumbnail_path)
                .where(
                    GoesFrame.satellite == satellite,
                    GoesFrame.sector == sector,
                    GoesFrame.band == band_id,
                )
                .order_by(GoesFrame.capture_time.desc())
                .limit(1)
            )
            row = result.first()
            if row and row.thumbnail_path:
                results[band_id] = f"/api/satellite/frames/{row.id}/thumbnail"
            else:
                results[band_id] = None
        return {
            "satellite": satellite,
            "sector": sector,
            "thumbnails": results,
        }

    return await get_cached(cache_key, ttl=300, fetch_fn=_fetch)


@router.get("/band-availability")
@limiter.limit("30/minute")
async def band_availability(
    request: Request,
    satellite: str = Query(DEFAULT_SATELLITE),
    sector: str = Query("CONUS"),
    db: AsyncSession = Depends(get_db),
):
    """Return frame count per band for the given satellite/sector."""
    logger.debug("Band availability requested")
    from sqlalchemy import func

    result = await db.execute(
        select(GoesFrame.band, func.count())
        .where(GoesFrame.satellite == satellite, GoesFrame.sector == sector)
        .group_by(GoesFrame.band)
    )
    counts = {row[0]: row[1] for row in result.all()}
    return {"counts": counts}


@router.get("/latest")
@limiter.limit("30/minute")
async def get_latest_frame(
    request: Request,
    response: Response,
    satellite: str = Query(DEFAULT_SATELLITE),
    sector: str = Query("CONUS"),
    band: str = Query("C02"),
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent GoesFrame for the given satellite/sector/band."""
    logger.debug("Latest frame requested")
    response.headers["Cache-Control"] = "public, max-age=30"
    result = await db.execute(
        select(GoesFrame)
        .where(
            GoesFrame.satellite == satellite,
            GoesFrame.sector == sector,
            GoesFrame.band == band,
        )
        .order_by(GoesFrame.capture_time.desc())
        .limit(1)
    )
    frame = result.scalars().first()
    if not frame:
        raise APIError(404, "not_found", "No frames found for the given parameters")
    from ..services.catalog import build_cdn_urls
    cdn_urls = build_cdn_urls(frame.satellite, frame.sector, frame.band)
    mobile_url = cdn_urls["mobile"] if cdn_urls else f"/api/satellite/frames/{frame.id}/image"

    return {
        "id": frame.id,
        "satellite": frame.satellite,
        "sector": frame.sector,
        "band": frame.band,
        "capture_time": frame.capture_time.isoformat() if frame.capture_time else None,
        "file_size": frame.file_size,
        "width": frame.width,
        "height": frame.height,
        "image_url": f"/api/satellite/frames/{frame.id}/image",
        "thumbnail_url": f"/api/satellite/frames/{frame.id}/thumbnail",
        "mobile_url": mobile_url,
    }
