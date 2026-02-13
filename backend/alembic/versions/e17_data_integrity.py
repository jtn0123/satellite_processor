"""Add check constraints for data integrity (#13)

Revision ID: e17_data_integrity
Revises: d05abc123456
Create Date: 2026-02-13 12:00:00.000000
"""
from alembic import op

revision = "e17_data_integrity"
down_revision = "d05abc123456"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Progress must be 0-100
    op.execute("ALTER TABLE jobs ADD CONSTRAINT ck_jobs_progress CHECK (progress >= 0 AND progress <= 100)")
    # File sizes must be non-negative
    op.execute("ALTER TABLE images ADD CONSTRAINT ck_images_file_size CHECK (file_size >= 0)")
    op.execute("ALTER TABLE goes_frames ADD CONSTRAINT ck_goes_frames_file_size CHECK (file_size >= 0)")
    op.execute("ALTER TABLE animations ADD CONSTRAINT ck_animations_file_size CHECK (file_size >= 0)")
    op.execute("ALTER TABLE composites ADD CONSTRAINT ck_composites_file_size CHECK (file_size >= 0)")
    # Interval must be positive
    op.execute("ALTER TABLE fetch_schedules ADD CONSTRAINT ck_fetch_schedules_interval CHECK (interval_minutes > 0)")
    # Cleanup rule value must be positive
    op.execute("ALTER TABLE cleanup_rules ADD CONSTRAINT ck_cleanup_rules_value CHECK (value > 0)")
    # Status field constraints
    op.execute(
        "ALTER TABLE jobs ADD CONSTRAINT ck_jobs_status "
        "CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))"
    )
    op.execute(
        "ALTER TABLE animations ADD CONSTRAINT ck_animations_status "
        "CHECK (status IN ('pending', 'processing', 'completed', 'failed'))"
    )
    op.execute(
        "ALTER TABLE composites ADD CONSTRAINT ck_composites_status "
        "CHECK (status IN ('pending', 'processing', 'completed', 'failed'))"
    )


def downgrade() -> None:
    for table, name in [
        ("jobs", "ck_jobs_progress"),
        ("images", "ck_images_file_size"),
        ("goes_frames", "ck_goes_frames_file_size"),
        ("animations", "ck_animations_file_size"),
        ("composites", "ck_composites_file_size"),
        ("fetch_schedules", "ck_fetch_schedules_interval"),
        ("cleanup_rules", "ck_cleanup_rules_value"),
        ("jobs", "ck_jobs_status"),
        ("animations", "ck_animations_status"),
        ("composites", "ck_composites_status"),
    ]:
        op.drop_constraint(name, table)
