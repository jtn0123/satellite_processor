"""Add ondelete=SET NULL to nullable foreign key columns.

Revision ID: p120_fk_ondelete_set_null
Revises: o110_cleanup_satellite_filter
Create Date: 2026-03-28

Uses ``op.batch_alter_table`` so this works on both PostgreSQL (production)
and SQLite (``make dev``). SQLite has no ``ALTER TABLE ... DROP CONSTRAINT``
support, so Alembic needs the copy-and-move strategy. We also pass a
``naming_convention`` so that reflected unnamed FKs (which is what SQLite
ends up with when the model declares ``ForeignKey('jobs.id')`` without an
explicit name) match the PostgreSQL-style names below.
"""

from alembic import op

revision = "p120_fk_ondelete_set_null"
down_revision = "o110_cleanup_satellite_filter"
branch_labels = None
depends_on = None

# Mirror PostgreSQL's default FK naming so reflected SQLite constraints
# resolve to the same names used by ``drop_constraint`` below.
NAMING_CONVENTION = {
    "fk": "%(table_name)s_%(column_0_name)s_fkey",
}

_FK_ONDELETE_SET_NULL = "SET NULL"


def _alter_fk(
    table: str,
    constraint: str,
    referred_table: str,
    local_cols: list[str],
    remote_cols: list[str],
    ondelete: str | None,
) -> None:
    """Drop and recreate one foreign key inside a batch_alter_table block."""
    with op.batch_alter_table(table, naming_convention=NAMING_CONVENTION) as batch_op:
        batch_op.drop_constraint(constraint, type_="foreignkey")
        batch_op.create_foreign_key(
            constraint,
            referred_table,
            local_cols,
            remote_cols,
            ondelete=ondelete,
        )


def upgrade() -> None:
    _alter_fk(
        "goes_frames",
        "goes_frames_source_job_id_fkey",
        "jobs",
        ["source_job_id"],
        ["id"],
        _FK_ONDELETE_SET_NULL,
    )
    _alter_fk(
        "animations",
        "animations_crop_preset_id_fkey",
        "crop_presets",
        ["crop_preset_id"],
        ["id"],
        _FK_ONDELETE_SET_NULL,
    )
    _alter_fk(
        "animations",
        "animations_job_id_fkey",
        "jobs",
        ["job_id"],
        ["id"],
        _FK_ONDELETE_SET_NULL,
    )
    _alter_fk(
        "composites",
        "composites_job_id_fkey",
        "jobs",
        ["job_id"],
        ["id"],
        _FK_ONDELETE_SET_NULL,
    )


def downgrade() -> None:
    _alter_fk(
        "composites",
        "composites_job_id_fkey",
        "jobs",
        ["job_id"],
        ["id"],
        None,
    )
    _alter_fk(
        "animations",
        "animations_job_id_fkey",
        "jobs",
        ["job_id"],
        ["id"],
        None,
    )
    _alter_fk(
        "animations",
        "animations_crop_preset_id_fkey",
        "crop_presets",
        ["crop_preset_id"],
        ["id"],
        None,
    )
    _alter_fk(
        "goes_frames",
        "goes_frames_source_job_id_fkey",
        "jobs",
        ["source_job_id"],
        ["id"],
        None,
    )
