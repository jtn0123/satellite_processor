"""Add satellite filter column to cleanup_rules table.

Revision ID: o110_cleanup_satellite_filter
Revises: n100_failed_jobs
Create Date: 2026-03-04
"""

from alembic import op
import sqlalchemy as sa

revision = "o110_cleanup_satellite_filter"
down_revision = "n100_failed_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cleanup_rules",
        sa.Column("satellite", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("cleanup_rules", "satellite")
