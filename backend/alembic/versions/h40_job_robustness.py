"""Add task_id and updated_at to jobs table

Revision ID: h40_job_robustness
Revises: g39_job_logs
Create Date: 2026-02-14
"""

import sqlalchemy as sa
from alembic import op

revision = "h40_job_robustness"
down_revision = "g39_job_logs"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("jobs", sa.Column("task_id", sa.String(255), nullable=True))
    op.add_column("jobs", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.create_index("ix_jobs_task_id", "jobs", ["task_id"])


def downgrade():
    op.drop_index("ix_jobs_task_id", table_name="jobs")
    op.drop_column("jobs", "updated_at")
    op.drop_column("jobs", "task_id")
