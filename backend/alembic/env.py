"""Alembic environment configuration (#177).

Reads DATABASE_URL from environment, falling back to alembic.ini sqlalchemy.url.
"""
from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config

# Override sqlalchemy.url from environment if set.
# Must happen BEFORE importing app modules, because database.py calls
# create_async_engine at import time using settings.database_url.
db_url = os.environ.get("DATABASE_URL", "")
if db_url:
    # Alembic runs sync migrations — ensure we use a sync driver here.
    sync_url = db_url.replace("+aiosqlite", "").replace("+asyncpg", "+psycopg2")
    config.set_main_option("sqlalchemy.url", sync_url)

    # Ensure the app's async engine gets a compatible async URL when imported.
    if "+psycopg2" in db_url:
        os.environ["DATABASE_URL"] = db_url.replace("+psycopg2", "+asyncpg")
    elif "+asyncpg" not in db_url and "+aiosqlite" not in db_url:
        # Plain postgresql:// — make it async for the app, sync for alembic
        os.environ["DATABASE_URL"] = db_url.replace("postgresql://", "postgresql+asyncpg://")

# Import Base so Alembic can see all models for autogenerate.
# The env var override above ensures create_async_engine gets an async driver.
from app.db.database import Base  # noqa: E402, F401
from app.db.models import Image, Job, Preset  # noqa: E402, F401

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
