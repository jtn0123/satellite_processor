"""Error collection endpoints for frontend error reporting."""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select

from ..db.database import async_session
from ..db.models import ErrorLog
from ..rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/errors", tags=["errors"])


class ErrorReportIn(BaseModel):
    message: str = Field(..., max_length=2000)
    stack: str | None = Field(None, max_length=10000)
    context: dict | None = None
    url: str | None = Field(None, max_length=2000)
    timestamp: str | None = None
    userAgent: str | None = Field(None, max_length=500)


class ErrorReportOut(BaseModel):
    id: int
    message: str
    stack: str | None
    context: dict | None
    url: str | None
    user_agent: str | None
    client_ip: str | None
    created_at: str


@router.post("", status_code=201)
@limiter.limit("10/minute")
async def report_error(request: Request, body: ErrorReportIn) -> JSONResponse:
    """Collect a frontend error report. No auth required."""
    client = request.client
    client_ip = client.host if client else None

    async with async_session() as db:
        error = ErrorLog(
            message=body.message,
            stack=body.stack,
            context=body.context,
            url=body.url,
            user_agent=body.userAgent,
            client_ip=client_ip,
            created_at=datetime.now(UTC),
        )
        db.add(error)
        await db.commit()

    return JSONResponse(status_code=201, content={"status": "ok"})


@router.get("")
async def list_errors(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> dict:
    """List recent errors with pagination. Auth required (handled by global middleware)."""
    async with async_session() as db:
        total = (await db.execute(select(func.count(ErrorLog.id)))).scalar() or 0
        rows = (
            await db.execute(
                select(ErrorLog)
                .order_by(ErrorLog.created_at.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        ).scalars().all()

        items = [
            ErrorReportOut(
                id=r.id,
                message=r.message,
                stack=r.stack,
                context=r.context,
                url=r.url,
                user_agent=r.user_agent,
                client_ip=r.client_ip,
                created_at=r.created_at.isoformat() if r.created_at else "",
            ).model_dump()
            for r in rows
        ]

    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.delete("")
async def clear_errors() -> dict:
    """Clear all error logs. Auth required (handled by global middleware)."""
    async with async_session() as db:
        result = await db.execute(delete(ErrorLog))
        await db.commit()
        return {"deleted": result.rowcount}
