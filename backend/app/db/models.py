"""ORM models for jobs, images, presets, GOES frames, collections, and tags"""

import uuid

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from ..utils import utcnow
from .database import Base


def gen_uuid():
    return str(uuid.uuid4())


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
    task_id = Column(String(255), nullable=True, index=True)
    created_at = Column(DateTime, default=utcnow, index=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        Index("ix_jobs_status_created_at", "status", "created_at"),
        CheckConstraint("progress >= 0 AND progress <= 100", name="ck_jobs_progress"),
        CheckConstraint(
            "status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')",
            name="ck_jobs_status",
        ),
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
    source = Column(String(20), default="local")
    uploaded_at = Column(DateTime, default=utcnow, index=True)


class Preset(Base):
    __tablename__ = "presets"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(100), unique=True, nullable=False, index=True)
    params = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)


# --- GOES Data Management Models ---


class GoesFrame(Base):
    __tablename__ = "goes_frames"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    satellite = Column(String(20), nullable=False, index=True)
    sector = Column(String(20), nullable=False, index=True)
    band = Column(String(10), nullable=False, index=True)
    capture_time = Column(DateTime, nullable=False, index=True)
    file_path = Column(Text, nullable=False)
    file_size = Column(BigInteger, default=0)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    thumbnail_path = Column(Text, nullable=True)
    source_job_id = Column(String(36), ForeignKey("jobs.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    source_job = relationship("Job", foreign_keys=[source_job_id])
    tags = relationship("Tag", secondary="frame_tags", back_populates="frames")
    collections = relationship(
        "Collection", secondary="collection_frames", back_populates="frames"
    )

    __table_args__ = (
        Index("ix_goes_frames_sat_band", "satellite", "band"),
        Index("ix_goes_frames_capture", "capture_time"),
        CheckConstraint("file_size >= 0", name="ck_goes_frames_file_size"),
    )


class Collection(Base):
    __tablename__ = "collections"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    frames = relationship(
        "GoesFrame", secondary="collection_frames", back_populates="collections"
    )


class CollectionFrame(Base):
    __tablename__ = "collection_frames"

    collection_id = Column(
        String(36), ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True
    )
    frame_id = Column(
        String(36), ForeignKey("goes_frames.id", ondelete="CASCADE"), primary_key=True
    )


class Tag(Base):
    __tablename__ = "tags"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(100), unique=True, nullable=False, index=True)
    color = Column(String(7), default="#3b82f6")

    frames = relationship(
        "GoesFrame", secondary="frame_tags", back_populates="tags"
    )


class FrameTag(Base):
    __tablename__ = "frame_tags"

    frame_id = Column(
        String(36), ForeignKey("goes_frames.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id = Column(
        String(36), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )


class CropPreset(Base):
    __tablename__ = "crop_presets"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(200), nullable=False, unique=True)
    x = Column(Integer, nullable=False)
    y = Column(Integer, nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=utcnow)


class Animation(Base):
    __tablename__ = "animations"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(200), nullable=False)
    status = Column(String(20), default="pending", index=True)
    frame_count = Column(Integer, default=0)
    fps = Column(Integer, default=10)
    format = Column(String(10), default="mp4")
    quality = Column(String(10), default="medium")
    crop_preset_id = Column(String(36), ForeignKey("crop_presets.id"), nullable=True)
    false_color = Column(Integer, default=0)  # Boolean as int for SQLite compat
    scale = Column(String(10), default="100%")
    output_path = Column(Text, nullable=True)
    file_size = Column(BigInteger, default=0)
    duration_seconds = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow, index=True)
    completed_at = Column(DateTime, nullable=True)
    error = Column(Text, default="")
    job_id = Column(String(36), ForeignKey("jobs.id"), nullable=True)

    crop_preset = relationship("CropPreset", foreign_keys=[crop_preset_id])
    job = relationship("Job", foreign_keys=[job_id])


# --- Phase 3: Scheduling & Cleanup Models ---


class FetchPreset(Base):
    __tablename__ = "fetch_presets"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(200), nullable=False, unique=True)
    satellite = Column(String(20), nullable=False)
    sector = Column(String(20), nullable=False)
    band = Column(String(10), nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow)

    schedules = relationship("FetchSchedule", back_populates="preset", cascade="all, delete-orphan")


class FetchSchedule(Base):
    __tablename__ = "fetch_schedules"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(200), nullable=False)
    preset_id = Column(String(36), ForeignKey("fetch_presets.id", ondelete="CASCADE"), nullable=False)
    interval_minutes = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=False)
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    preset = relationship("FetchPreset", back_populates="schedules")

    __table_args__ = (
        CheckConstraint("interval_minutes > 0", name="ck_fetch_schedules_interval"),
    )


class Composite(Base):
    __tablename__ = "composites"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(200), nullable=False)
    recipe = Column(String(50), nullable=False)
    satellite = Column(String(20), nullable=False)
    sector = Column(String(20), nullable=False)
    capture_time = Column(DateTime, nullable=False)
    file_path = Column(Text, nullable=True)
    file_size = Column(BigInteger, default=0)
    status = Column(String(20), default="pending", index=True)
    error = Column(Text, default="")
    job_id = Column(String(36), ForeignKey("jobs.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    job = relationship("Job", foreign_keys=[job_id])


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    type = Column(String(30), nullable=False, index=True)
    message = Column(Text, nullable=False)
    read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=utcnow, index=True)

    __table_args__ = (
        CheckConstraint(
            "type IN ('fetch_complete', 'fetch_failed', 'schedule_run')",
            name="ck_notifications_type",
        ),
    )


class JobLog(Base):
    __tablename__ = "job_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(
        String(36),
        ForeignKey("jobs.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    timestamp = Column(DateTime, default=utcnow, nullable=False)
    level = Column(String(10), default="info")  # info, warn, error, debug
    message = Column(Text, nullable=False)


class CleanupRule(Base):
    __tablename__ = "cleanup_rules"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(200), nullable=False)
    rule_type = Column(String(20), nullable=False)  # 'max_age_days' or 'max_storage_gb'
    value = Column(Float, nullable=False)
    protect_collections = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
