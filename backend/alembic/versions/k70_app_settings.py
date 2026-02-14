"""create app_settings table

Revision ID: k70_app_settings
Revises: j60_composites
Create Date: 2026-02-14
"""
import sqlalchemy as sa
from alembic import op

revision = "k70_app_settings"
down_revision = "j60_composites"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    # Idempotent: only create if not exists
    if not conn.dialect.has_table(conn, "app_settings"):
        op.create_table(
            "app_settings",
            sa.Column("id", sa.Integer(), primary_key=True, default=1),
            sa.Column("data", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.has_table(conn, "app_settings"):
        op.drop_table("app_settings")
