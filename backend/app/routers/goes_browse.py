"""GOES composite browse and management endpoints."""

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db.models import Composite, Job
from ..errors import APIError, validate_uuid
from ..models.goes import CompositeCreateRequest, CompositeResponse
from ..models.pagination import PaginatedResponse, PaginationParams
from ..rate_limit import limiter
from ._goes_shared import COMPOSITE_RECIPES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/satellite", tags=["satellite-browse"])


@router.get("/composite-recipes")
@limiter.limit("60/minute")
async def list_composite_recipes(request: Request):
    """List available composite recipes."""
    return [
        {"id": k, "name": v["name"], "bands": v["bands"]}
        for k, v in COMPOSITE_RECIPES.items()
    ]


@router.post("/composites")
@limiter.limit("30/minute")
async def create_composite(
    request: Request,
    payload: CompositeCreateRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Create a band composite image via Celery task."""
    logger.info("Creating composite")
    recipe = payload.recipe
    if recipe not in COMPOSITE_RECIPES:
        raise APIError(400, "bad_request", f"Unknown recipe: {recipe}")

    satellite = payload.satellite
    sector = payload.sector
    capture_time = payload.capture_time

    composite_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    job = Job(id=job_id, name=f"{satellite} {sector} {recipe} Composite", status="pending", job_type="composite")
    db.add(job)

    composite = Composite(
        id=composite_id,
        name=COMPOSITE_RECIPES[recipe]["name"],
        recipe=recipe,
        satellite=satellite,
        sector=sector,
        capture_time=datetime.fromisoformat(capture_time),
        status="pending",
        job_id=job_id,
    )
    db.add(composite)
    await db.commit()

    from ..tasks.composite_task import generate_composite

    generate_composite.delay(composite_id, job_id, {
        "recipe": recipe,
        "satellite": satellite,
        "sector": sector,
        "capture_time": capture_time,
        "bands": COMPOSITE_RECIPES[recipe]["bands"],
    })

    return {
        "id": composite_id,
        "job_id": job_id,
        "status": "pending",
        "message": f"Generating {COMPOSITE_RECIPES[recipe]['name']} composite",
    }


@router.get("/composites", response_model=PaginatedResponse[CompositeResponse])
@limiter.limit("60/minute")
async def list_composites(
    request: Request,
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    """List generated composites."""
    logger.debug("Listing composites")
    total = (await db.execute(select(func.count(Composite.id)))).scalar() or 0
    result = await db.execute(
        select(Composite)
        .order_by(Composite.created_at.desc())
        .offset(pagination.offset)
        .limit(pagination.limit)
    )
    composites = result.scalars().all()
    items = [
        CompositeResponse(
            id=c.id,
            name=c.name,
            recipe=c.recipe,
            satellite=c.satellite,
            sector=c.sector,
            capture_time=c.capture_time.isoformat() if c.capture_time else None,
            file_path=None,
            file_size=c.file_size,
            status=c.status,
            error=c.error,
            created_at=c.created_at.isoformat() if c.created_at else None,
            image_url=f"/api/satellite/composites/{c.id}/image" if c.file_path else None,
        )
        for c in composites
    ]
    return PaginatedResponse(items=items, total=total, page=pagination.page, limit=pagination.limit)


@router.get("/composites/{composite_id}")
@limiter.limit("60/minute")
async def get_composite(request: Request, composite_id: str, db: AsyncSession = Depends(get_db)):
    """Get composite detail."""
    logger.debug("Composite requested: id=%s", composite_id)
    validate_uuid(composite_id, "composite_id")
    result = await db.execute(select(Composite).where(Composite.id == composite_id))
    c = result.scalars().first()
    if not c:
        raise APIError(404, "not_found", "Composite not found")
    return {
        "id": c.id,
        "name": c.name,
        "recipe": c.recipe,
        "satellite": c.satellite,
        "sector": c.sector,
        "capture_time": c.capture_time.isoformat() if c.capture_time else None,
        "file_size": c.file_size,
        "status": c.status,
        "error": c.error,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "image_url": f"/api/satellite/composites/{c.id}/image" if c.file_path else None,
    }


# Bug #11: Dedicated composite image endpoint
@router.get("/composites/{composite_id}/image")
@limiter.limit("60/minute")
async def get_composite_image(request: Request, composite_id: str, db: AsyncSession = Depends(get_db)):
    """Serve the composite image file."""
    logger.debug("Composite image requested: id=%s", composite_id)
    validate_uuid(composite_id, "composite_id")
    result = await db.execute(select(Composite).where(Composite.id == composite_id))
    c = result.scalars().first()
    if not c:
        raise APIError(404, "not_found", "Composite not found")
    if not c.file_path:
        raise APIError(404, "not_found", "Composite image not yet generated")

    from pathlib import Path

    file_path = Path(c.file_path)
    if not file_path.exists():
        raise APIError(404, "not_found", "Composite image file not found on disk")

    import mimetypes

    from starlette.responses import FileResponse

    media_type = mimetypes.guess_type(str(file_path))[0] or "image/png"

    return FileResponse(
        str(file_path),
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
