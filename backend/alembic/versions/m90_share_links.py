"""share links for public frame access

Revision ID: m90_share_links
Revises: l80_animation_ux
Create Date: 2026-02-14
"""

import sqlalchemy as sa
from alembic import op

revision = "m90_share_links"
down_revision = "l80_animation_ux"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "share_links" not in tables:
        op.create_table(
            "share_links",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("token", sa.String(64), unique=True, nullable=False, index=True),
            sa.Column("frame_id", sa.String(36), sa.ForeignKey("goes_frames.id"), nullable=False),
            sa.Column("expires_at", sa.DateTime, nullable=False),
            sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        )


def downgrade():
    op.drop_table("share_links")
