"""Add ondelete=SET NULL to nullable foreign key columns.

Revision ID: p120_fk_ondelete_set_null
Revises: o110_cleanup_satellite_filter
Create Date: 2026-03-28
"""

from alembic import op

revision = "p120_fk_ondelete_set_null"
down_revision = "o110_cleanup_satellite_filter"
branch_labels = None
depends_on = None

# PostgreSQL auto-generates FK names as {table}_{column}_fkey
_FK_ONDELETE_SET_NULL = "SET NULL"


def upgrade() -> None:
    # goes_frames.source_job_id
    op.drop_constraint("goes_frames_source_job_id_fkey", "goes_frames", type_="foreignkey")
    op.create_foreign_key(
        "goes_frames_source_job_id_fkey",
        "goes_frames",
        "jobs",
        ["source_job_id"],
        ["id"],
        ondelete=_FK_ONDELETE_SET_NULL,
    )

    # animations.crop_preset_id
    op.drop_constraint("animations_crop_preset_id_fkey", "animations", type_="foreignkey")
    op.create_foreign_key(
        "animations_crop_preset_id_fkey",
        "animations",
        "crop_presets",
        ["crop_preset_id"],
        ["id"],
        ondelete=_FK_ONDELETE_SET_NULL,
    )

    # animations.job_id
    op.drop_constraint("animations_job_id_fkey", "animations", type_="foreignkey")
    op.create_foreign_key(
        "animations_job_id_fkey",
        "animations",
        "jobs",
        ["job_id"],
        ["id"],
        ondelete=_FK_ONDELETE_SET_NULL,
    )

    # composites.job_id
    op.drop_constraint("composites_job_id_fkey", "composites", type_="foreignkey")
    op.create_foreign_key(
        "composites_job_id_fkey",
        "composites",
        "jobs",
        ["job_id"],
        ["id"],
        ondelete=_FK_ONDELETE_SET_NULL,
    )


def downgrade() -> None:
    op.drop_constraint("composites_job_id_fkey", "composites", type_="foreignkey")
    op.create_foreign_key("composites_job_id_fkey", "composites", "jobs", ["job_id"], ["id"])

    op.drop_constraint("animations_job_id_fkey", "animations", type_="foreignkey")
    op.create_foreign_key("animations_job_id_fkey", "animations", "jobs", ["job_id"], ["id"])

    op.drop_constraint("animations_crop_preset_id_fkey", "animations", type_="foreignkey")
    op.create_foreign_key(
        "animations_crop_preset_id_fkey",
        "animations",
        "crop_presets",
        ["crop_preset_id"],
        ["id"],
    )

    op.drop_constraint("goes_frames_source_job_id_fkey", "goes_frames", type_="foreignkey")
    op.create_foreign_key("goes_frames_source_job_id_fkey", "goes_frames", "jobs", ["source_job_id"], ["id"])
