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
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_name='app_settings'"
        )
    )
    if result.fetchone():
        return
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", sa.JSON, nullable=False),
        sa.Column("updated_at", sa.DateTime),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
