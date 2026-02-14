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
    op.add_column("jobs", sa.Column("name", sa.String(255), nullable=True))


def downgrade():
    op.drop_column("jobs", "name")
