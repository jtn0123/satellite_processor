"""Add job_logs table

Revision ID: g39_job_logs
Revises: f28_notifications
Create Date: 2026-02-13 17:00:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "g39_job_logs"
down_revision = "f28_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "job_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "job_id",
            sa.String(36),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("level", sa.String(10), server_default="info"),
        sa.Column("message", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("job_logs")
