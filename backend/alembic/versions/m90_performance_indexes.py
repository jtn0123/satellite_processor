"""Add composite indexes for common query patterns

Revision ID: m90_performance_indexes
Revises: l80_animation_ux
Create Date: 2026-02-14
"""

import sqlalchemy as sa
from alembic import op

revision = "m90_performance_indexes"
down_revision = "l80_animation_ux"
branch_labels = None
depends_on = None

_INDEXES = [
    ("ix_goes_frames_sat_sector_band_capture", "goes_frames", ["satellite", "sector", "band", "capture_time"]),
    ("ix_animations_status", "animations", ["status"]),
]


def _index_exists(conn, index_name: str) -> bool:
    dialect = conn.dialect.name
    if dialect == "postgresql":
        result = conn.execute(
            sa.text("SELECT 1 FROM pg_indexes WHERE indexname = :n"),
            {"n": index_name},
        )
    elif dialect == "sqlite":
        result = conn.execute(
            sa.text("SELECT 1 FROM sqlite_master WHERE type='index' AND name=:n"),
            {"n": index_name},
        )
    else:
        return False
    return result.fetchone() is not None


def upgrade():
    conn = op.get_bind()
    for name, table, columns in _INDEXES:
        if not _index_exists(conn, name):
            op.create_index(name, table, columns)


def downgrade():
    for name, _table, _columns in _INDEXES:
        try:
            op.drop_index(name)
        except Exception:
            pass
