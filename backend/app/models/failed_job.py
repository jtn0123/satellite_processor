"""SQLAlchemy model for dead-letter tracking of failed Celery tasks."""
from __future__ import annotations

from sqlalchemy import Column, DateTime, Integer, String, Text

from ..db.database import Base
from ..utils import utcnow


def _gen_uuid() -> str:
    import uuid
    return str(uuid.uuid4())


class FailedJob(Base):
    __tablename__ = "failed_jobs"

    id = Column(String(36), primary_key=True, default=_gen_uuid)
    task_name = Column(String(255), nullable=False, index=True)
    task_id = Column(String(255), nullable=False, index=True)
    args = Column(Text, default="[]")
    kwargs = Column(Text, default="{}")
    exception = Column(Text, nullable=False)
    traceback = Column(Text, default="")
    failed_at = Column(DateTime, default=utcnow, index=True)
    retried_count = Column(Integer, default=0)
