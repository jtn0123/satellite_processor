"""SQLAlchemy async database setup

# TODO: Set up Alembic migrations for production schema changes.
# Using create_all() is fine for development but production deployments
# should use Alembic to manage schema migrations safely.
"""

import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from ..config import settings

logger = logging.getLogger(__name__)

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=1800,
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    """Dependency for getting async DB session"""
    async with async_session() as session:
        yield session


async def init_db(max_retries: int = 5, base_delay: float = 1.0):
    """Create all tables with retry logic for transient DB connection failures."""
    for attempt in range(1, max_retries + 1):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Database initialized successfully")
            return
        except Exception:
            if attempt == max_retries:
                logger.exception("Failed to initialize database after %d attempts", max_retries)
                raise
            delay = base_delay * (2 ** (attempt - 1))
            logger.warning(
                "Database connection failed (attempt %d/%d), retrying in %.1fs",
                attempt, max_retries, delay,
            )
            await asyncio.sleep(delay)
