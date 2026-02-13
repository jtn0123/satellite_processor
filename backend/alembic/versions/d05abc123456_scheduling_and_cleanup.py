"""Phase 3: scheduling and cleanup

Revision ID: d05abc123456
Revises: c94fab012345
Create Date: 2026-02-13 01:30:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "d05abc123456"
down_revision = "c94fab012345"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fetch_presets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False, unique=True),
        sa.Column("satellite", sa.String(20), nullable=False),
        sa.Column("sector", sa.String(20), nullable=False),
        sa.Column("band", sa.String(10), nullable=False),
        sa.Column("description", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "fetch_schedules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("preset_id", sa.String(36), sa.ForeignKey("fetch_presets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("interval_minutes", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("0")),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("next_run_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "cleanup_rules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("rule_type", sa.String(20), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("protect_collections", sa.Boolean(), server_default=sa.text("1")),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("cleanup_rules")
    op.drop_table("fetch_schedules")
    op.drop_table("fetch_presets")
