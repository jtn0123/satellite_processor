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


def _table_exists(conn, table_name: str) -> bool:
    """Check if a table exists in the current database."""
    import sqlalchemy as sa
    return sa.inspect(conn).has_table(table_name)


def _safe_add_constraint(conn, table: str, sql: str) -> None:
    """Add a constraint only if the table exists."""
    if _table_exists(conn, table):
        op.execute(sql)


def upgrade() -> None:
    conn = op.get_bind()
    # Progress must be 0-100
    _safe_add_constraint(conn, "jobs",
        "ALTER TABLE jobs ADD CONSTRAINT ck_jobs_progress CHECK (progress >= 0 AND progress <= 100)")
    # File sizes must be non-negative
    _safe_add_constraint(conn, "images",
        "ALTER TABLE images ADD CONSTRAINT ck_images_file_size CHECK (file_size >= 0)")
    _safe_add_constraint(conn, "goes_frames",
        "ALTER TABLE goes_frames ADD CONSTRAINT ck_goes_frames_file_size CHECK (file_size >= 0)")
    _safe_add_constraint(conn, "animations",
        "ALTER TABLE animations ADD CONSTRAINT ck_animations_file_size CHECK (file_size >= 0)")
    _safe_add_constraint(conn, "composites",
        "ALTER TABLE composites ADD CONSTRAINT ck_composites_file_size CHECK (file_size >= 0)")
    # Interval must be positive
    _safe_add_constraint(conn, "fetch_schedules",
        "ALTER TABLE fetch_schedules ADD CONSTRAINT ck_fetch_schedules_interval CHECK (interval_minutes > 0)")
    # Cleanup rule value must be positive
    _safe_add_constraint(conn, "cleanup_rules",
        "ALTER TABLE cleanup_rules ADD CONSTRAINT ck_cleanup_rules_value CHECK (value > 0)")
    # Status field constraints
    _safe_add_constraint(conn, "jobs",
        "ALTER TABLE jobs ADD CONSTRAINT ck_jobs_status "
        "CHECK (status IN ('pending', 'processing', 'completed', 'completed_partial', 'failed', 'cancelled'))")
    _safe_add_constraint(conn, "animations",
        "ALTER TABLE animations ADD CONSTRAINT ck_animations_status "
        "CHECK (status IN ('pending', 'processing', 'completed', 'failed'))")
    _safe_add_constraint(conn, "composites",
        "ALTER TABLE composites ADD CONSTRAINT ck_composites_status "
        "CHECK (status IN ('pending', 'processing', 'completed', 'failed'))")


def downgrade() -> None:
    conn = op.get_bind()
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
        if _table_exists(conn, table):
            try:
                op.drop_constraint(name, table)
            except Exception:
                pass
