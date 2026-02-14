"""create composites table

Revision ID: j60_composites
Revises: i50_job_name
Create Date: 2026-02-14
"""
from alembic import op
import sqlalchemy as sa

revision = "j60_composites"
down_revision = "i50_job_name"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_name='composites'"
        )
    )
    if result.fetchone():
        return
    op.create_table(
        "composites",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("recipe", sa.String(50), nullable=False),
        sa.Column("satellite", sa.String(20), nullable=False),
        sa.Column("sector", sa.String(20), nullable=False),
        sa.Column("capture_time", sa.DateTime, nullable=False),
        sa.Column("file_path", sa.Text, nullable=True),
        sa.Column("file_size", sa.BigInteger, server_default="0"),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("error", sa.Text, server_default=""),
        sa.Column("job_id", sa.String(36), sa.ForeignKey("jobs.id"), nullable=True),
        sa.Column("created_at", sa.DateTime),
    )
    op.create_index("ix_composites_status", "composites", ["status"])


def downgrade() -> None:
    op.drop_index("ix_composites_status", table_name="composites")
    op.drop_table("composites")
