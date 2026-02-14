"""change animation false_color from integer to boolean

Revision ID: k70_false_color_bool
Revises: j60_composites
Create Date: 2026-02-14
"""

import sqlalchemy as sa
from alembic import op

revision = "k70_false_color_bool"
down_revision = "j60_composites"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    # Idempotent: check current column type before altering
    inspector = sa.inspect(conn)
    columns = {c["name"]: c for c in inspector.get_columns("animations")}
    col = columns.get("false_color")
    if col is None:
        return
    # If already boolean, skip
    if isinstance(col["type"], sa.Boolean):
        return
    # PostgreSQL: alter column type with USING cast
    op.execute(
        "ALTER TABLE animations ALTER COLUMN false_color TYPE BOOLEAN "
        "USING false_color::boolean"
    )
    op.execute(
        "ALTER TABLE animations ALTER COLUMN false_color SET DEFAULT false"
    )


def downgrade():
    op.execute(
        "ALTER TABLE animations ALTER COLUMN false_color TYPE INTEGER "
        "USING false_color::integer"
    )
    op.execute(
        "ALTER TABLE animations ALTER COLUMN false_color SET DEFAULT 0"
    )
