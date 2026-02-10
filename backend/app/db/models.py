"""ORM models for jobs, images, and presets"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, BigInteger, Text, DateTime, JSON
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON

from .database import Base


def gen_uuid():
    return str(uuid.uuid4())


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    status = Column(String(20), default="pending")  # pending, processing, completed, failed, cancelled
    job_type = Column(String(20), default="image_process")  # image_process, video_create
    params = Column(JSON, default=dict)
    progress = Column(Integer, default=0)
    status_message = Column(Text, default="")
    input_path = Column(Text, default="")
    output_path = Column(Text, default="")
    error = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)


class Image(Base):
    __tablename__ = "images"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    filename = Column(Text, nullable=False)
    original_name = Column(Text, nullable=False)
    file_path = Column(Text, nullable=False)
    file_size = Column(BigInteger, default=0)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    satellite = Column(String(20), nullable=True)
    channel = Column(String(10), nullable=True)
    captured_at = Column(DateTime, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)


class Preset(Base):
    __tablename__ = "presets"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(100), unique=True, nullable=False)
    params = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
