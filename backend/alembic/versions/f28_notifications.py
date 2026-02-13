"""Add notifications table.

Revision ID: f28_notifications
Revises: e17_data_integrity
Create Date: 2026-02-13
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f28_notifications"
down_revision = "e17_data_integrity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("type", sa.String(30), nullable=False, index=True),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("read", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime, index=True),
        sa.CheckConstraint(
            "type IN ('fetch_complete', 'fetch_failed', 'schedule_run')",
            name="ck_notifications_type",
        ),
    )


def downgrade() -> None:
    op.drop_table("notifications")
