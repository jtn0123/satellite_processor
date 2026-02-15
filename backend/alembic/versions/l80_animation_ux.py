"""animation UX: presets table, resolution/loop_style/overlay columns

Revision ID: l80_animation_ux
Revises: k70_app_settings
Create Date: 2026-02-14
"""

import sqlalchemy as sa
from alembic import op

revision = "l80_animation_ux"
down_revision = "k70_false_color_bool"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # Add new columns to animations table (idempotent)
    existing_cols = [c["name"] for c in inspector.get_columns("animations")]

    if "resolution" not in existing_cols:
        op.add_column("animations", sa.Column("resolution", sa.String(10), server_default="full"))
    if "loop_style" not in existing_cols:
        op.add_column("animations", sa.Column("loop_style", sa.String(10), server_default="forward"))
    if "overlay" not in existing_cols:
        op.add_column("animations", sa.Column("overlay", sa.JSON, nullable=True))

    # Create animation_presets table (idempotent)
    if "animation_presets" not in inspector.get_table_names():
        op.create_table(
            "animation_presets",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(200), nullable=False, unique=True),
            sa.Column("satellite", sa.String(20), nullable=True),
            sa.Column("sector", sa.String(20), nullable=True),
            sa.Column("band", sa.String(10), nullable=True),
            sa.Column("fps", sa.Integer, default=10),
            sa.Column("format", sa.String(10), default="mp4"),
            sa.Column("quality", sa.String(10), default="medium"),
            sa.Column("resolution", sa.String(10), default="full"),
            sa.Column("loop_style", sa.String(10), default="forward"),
            sa.Column("created_at", sa.DateTime, nullable=True),
        )


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if "animation_presets" in inspector.get_table_names():
        op.drop_table("animation_presets")

    existing_cols = [c["name"] for c in inspector.get_columns("animations")]
    for col in ("overlay", "loop_style", "resolution"):
        if col in existing_cols:
            op.drop_column("animations", col)
