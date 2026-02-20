"""add error_logs table

Revision ID: f28a1b2c3d4e
Revises: e17_data_integrity
Create Date: 2026-02-20 13:50:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "f28a1b2c3d4e"
down_revision = "e17_data_integrity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "error_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("stack", sa.Text(), nullable=True),
        sa.Column("context", sa.JSON(), nullable=True),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("client_ip", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_error_logs_created_at", "error_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_error_logs_created_at", table_name="error_logs")
    op.drop_table("error_logs")
