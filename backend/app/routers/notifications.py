"""Notification events endpoints."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db.models import Notification
from ..errors import APIError

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    message: str
    timestamp: str | None = None
    read: bool

    @classmethod
    def from_orm_model(cls, n: Notification) -> "NotificationResponse":
        return cls(
            id=n.id,
            type=n.type,
            message=n.message,
            timestamp=n.created_at.isoformat() if n.created_at else None,
            read=n.read or False,
        )


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(db: AsyncSession = Depends(get_db)):
    """Return last 50 notifications, newest first."""
    result = await db.execute(
        select(Notification).order_by(Notification.created_at.desc()).limit(50)
    )
    return [NotificationResponse.from_orm_model(n) for n in result.scalars().all()]


@router.post("/{notification_id}/read")
async def mark_read(notification_id: str, db: AsyncSession = Depends(get_db)):
    """Mark a notification as read."""
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id)
    )
    notif = result.scalars().first()
    if not notif:
        raise APIError(404, "not_found", "Notification not found")
    notif.read = True
    await db.commit()
    return {"id": notification_id, "read": True}
