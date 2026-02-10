"""ORM models for jobs, images, and presets"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, BigInteger, Column, DateTime, Index, Integer, String, Text

from .database import Base


def gen_uuid():
    return str(uuid.uuid4())


def _utcnow():
    return datetime.now(timezone.utc)


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    status = Column(String(20), default="pending", index=True)
    job_type = Column(String(20), default="image_process")
    params = Column(JSON, default=dict)
    progress = Column(Integer, default=0)
    status_message = Column(Text, default="")
    input_path = Column(Text, default="")
    output_path = Column(Text, default="")
    error = Column(Text, default="")
    created_at = Column(DateTime, default=_utcnow, index=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_jobs_status_created_at", "status", "created_at"),
    )


class Image(Base):
    __tablename__ = "images"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    filename = Column(Text, nullable=False)
    original_name = Column(Text, nullable=False)
    file_path = Column(Text, nullable=False)
    file_size = Column(BigInteger, default=0)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    satellite = Column(String(20), nullable=True, index=True)
    channel = Column(String(10), nullable=True)
    captured_at = Column(DateTime, nullable=True)
    uploaded_at = Column(DateTime, default=_utcnow, index=True)


class Preset(Base):
    __tablename__ = "presets"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(100), unique=True, nullable=False, index=True)
    params = Column(JSON, default=dict)
    created_at = Column(DateTime, default=_utcnow)
