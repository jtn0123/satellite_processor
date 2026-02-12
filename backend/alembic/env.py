"""Alembic environment configuration (#177).

Reads DATABASE_URL from environment, falling back to alembic.ini sqlalchemy.url.
"""
from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context

# Import Base so Alembic can see all models for autogenerate
from app.db.database import Base  # noqa: F401
from app.db.models import Image, Job, Preset  # noqa: F401
from sqlalchemy import engine_from_config, pool

config = context.config

# Override sqlalchemy.url from environment if set
db_url = os.environ.get("DATABASE_URL", "")
if db_url:
    # Alembic needs a sync URL
    sync_url = db_url.replace("+aiosqlite", "").replace("+asyncpg", "+psycopg2")
    config.set_main_option("sqlalchemy.url", sync_url)

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
