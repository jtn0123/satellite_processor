"""Add name column to jobs table

Revision ID: i50_job_name
Revises: h40_job_robustness
Create Date: 2026-02-14
"""

import sqlalchemy as sa
from alembic import op

revision = "i50_job_name"
down_revision = "h40_job_robustness"
branch_labels = None
depends_on = None


def upgrade():
    # Use try/except to handle race condition when multiple containers
    # (api + worker) run alembic upgrade head simultaneously
    try:
        conn = op.get_bind()
        result = conn.execute(
            sa.text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name='jobs' AND column_name='name'"
            )
        )
        if not result.fetchone():
            op.add_column("jobs", sa.Column("name", sa.String(255), nullable=True))
    except sa.exc.ProgrammingError:
        pass


def downgrade():
    op.drop_column("jobs", "name")
