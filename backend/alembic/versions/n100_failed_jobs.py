"""Add failed_jobs table for dead-letter tracking.

Revision ID: n100_failed_jobs
Revises: m90_share_links
Create Date: 2026-03-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "n100_failed_jobs"
down_revision = "d03ffa78322c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "failed_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("task_name", sa.String(255), nullable=False, index=True),
        sa.Column("task_id", sa.String(255), nullable=False, index=True),
        sa.Column("args", sa.Text(), server_default="[]"),
        sa.Column("kwargs", sa.Text(), server_default="{}"),
        sa.Column("exception", sa.Text(), nullable=False),
        sa.Column("traceback", sa.Text(), server_default=""),
        sa.Column("failed_at", sa.DateTime(), index=True),
        sa.Column("retried_count", sa.Integer(), server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("failed_jobs")
