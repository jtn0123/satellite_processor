"""Animation studio: crop presets and animations

Revision ID: c94fab012345
Revises: b83def901234
Create Date: 2026-02-13 00:30:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c94fab012345"
down_revision: str | None = "b83def901234"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "crop_presets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("x", sa.Integer(), nullable=False),
        sa.Column("y", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "animations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("frame_count", sa.Integer(), nullable=True),
        sa.Column("fps", sa.Integer(), nullable=True),
        sa.Column("format", sa.String(length=10), nullable=True),
        sa.Column("quality", sa.String(length=10), nullable=True),
        sa.Column("crop_preset_id", sa.String(length=36), nullable=True),
        sa.Column("false_color", sa.Integer(), nullable=True),
        sa.Column("scale", sa.String(length=10), nullable=True),
        sa.Column("output_path", sa.Text(), nullable=True),
        sa.Column("file_size", sa.BigInteger(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("job_id", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(["crop_preset_id"], ["crop_presets.id"]),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_animations_status", "animations", ["status"])
    op.create_index("ix_animations_created_at", "animations", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_animations_created_at", table_name="animations")
    op.drop_index("ix_animations_status", table_name="animations")
    op.drop_table("animations")
    op.drop_table("crop_presets")
