"""merge error_logs and share_links heads

Revision ID: d03ffa78322c
Revises: f28a1b2c3d4e, m90_share_links
Create Date: 2026-02-20 16:50:27.958185

"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = 'd03ffa78322c'
down_revision: str | None = ('f28a1b2c3d4e', 'm90_share_links')
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
