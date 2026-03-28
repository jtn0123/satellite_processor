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


def upgrade() -> None:
    with op.batch_alter_table("goes_frames") as batch_op:
        batch_op.drop_constraint(None, type_="foreignkey")
        batch_op.create_foreign_key(
            "fk_goes_frames_source_job_id",
            "jobs",
            ["source_job_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table("animations") as batch_op:
        batch_op.drop_constraint(None, type_="foreignkey")
        batch_op.create_foreign_key(
            "fk_animations_crop_preset_id",
            "crop_presets",
            ["crop_preset_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_foreign_key(
            "fk_animations_job_id",
            "jobs",
            ["job_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table("composites") as batch_op:
        batch_op.drop_constraint(None, type_="foreignkey")
        batch_op.create_foreign_key(
            "fk_composites_job_id",
            "jobs",
            ["job_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("composites") as batch_op:
        batch_op.drop_constraint("fk_composites_job_id", type_="foreignkey")
        batch_op.create_foreign_key(None, "jobs", ["job_id"], ["id"])

    with op.batch_alter_table("animations") as batch_op:
        batch_op.drop_constraint("fk_animations_job_id", type_="foreignkey")
        batch_op.create_foreign_key(None, "jobs", ["job_id"], ["id"])
        batch_op.drop_constraint("fk_animations_crop_preset_id", type_="foreignkey")
        batch_op.create_foreign_key(None, "crop_presets", ["crop_preset_id"], ["id"])

    with op.batch_alter_table("goes_frames") as batch_op:
        batch_op.drop_constraint("fk_goes_frames_source_job_id", type_="foreignkey")
        batch_op.create_foreign_key(None, "jobs", ["source_job_id"], ["id"])
