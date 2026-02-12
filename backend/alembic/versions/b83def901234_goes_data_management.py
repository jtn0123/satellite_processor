"""GOES data management tables

Revision ID: b83def901234
Revises: a76cea807564
Create Date: 2026-02-12 22:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b83def901234"
down_revision: str | None = "a76cea807564"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "goes_frames",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("satellite", sa.String(length=20), nullable=False),
        sa.Column("sector", sa.String(length=20), nullable=False),
        sa.Column("band", sa.String(length=10), nullable=False),
        sa.Column("capture_time", sa.DateTime(), nullable=False),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("thumbnail_path", sa.Text(), nullable=True),
        sa.Column("source_job_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["source_job_id"], ["jobs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_goes_frames_satellite"), "goes_frames", ["satellite"])
    op.create_index(op.f("ix_goes_frames_sector"), "goes_frames", ["sector"])
    op.create_index(op.f("ix_goes_frames_band"), "goes_frames", ["band"])
    op.create_index(op.f("ix_goes_frames_capture_time"), "goes_frames", ["capture_time"])
    op.create_index("ix_goes_frames_sat_band", "goes_frames", ["satellite", "band"])
    op.create_index("ix_goes_frames_capture", "goes_frames", ["capture_time"])

    op.create_table(
        "collections",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "collection_frames",
        sa.Column("collection_id", sa.String(length=36), nullable=False),
        sa.Column("frame_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["collection_id"], ["collections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["frame_id"], ["goes_frames.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("collection_id", "frame_id"),
    )

    op.create_table(
        "tags",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tags_name"), "tags", ["name"], unique=True)

    op.create_table(
        "frame_tags",
        sa.Column("frame_id", sa.String(length=36), nullable=False),
        sa.Column("tag_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["frame_id"], ["goes_frames.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("frame_id", "tag_id"),
    )


def downgrade() -> None:
    op.drop_table("frame_tags")
    op.drop_index(op.f("ix_tags_name"), table_name="tags")
    op.drop_table("tags")
    op.drop_table("collection_frames")
    op.drop_table("collections")
    op.drop_index("ix_goes_frames_capture", table_name="goes_frames")
    op.drop_index("ix_goes_frames_sat_band", table_name="goes_frames")
    op.drop_index(op.f("ix_goes_frames_capture_time"), table_name="goes_frames")
    op.drop_index(op.f("ix_goes_frames_band"), table_name="goes_frames")
    op.drop_index(op.f("ix_goes_frames_sector"), table_name="goes_frames")
    op.drop_index(op.f("ix_goes_frames_satellite"), table_name="goes_frames")
    op.drop_table("goes_frames")
