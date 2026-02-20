"""merge error_logs and share_links heads

Revision ID: d03ffa78322c
Revises: f28a1b2c3d4e, m90_share_links
Create Date: 2026-02-20 16:50:27.958185

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd03ffa78322c'
down_revision: Union[str, None] = ('f28a1b2c3d4e', 'm90_share_links')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
