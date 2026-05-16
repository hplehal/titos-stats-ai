"""widen players jersey range to 0-999

Revision ID: faf13f5a780f
Revises: dd154cf6a3b1
Create Date: 2026-05-15 19:31:38.213053

Rec-league rosters carry the occasional 3-digit jersey (e.g. #245). Drop the
0..99 CHECK and replace with 0..999 to allow them through without removing
the typo-guard entirely.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'faf13f5a780f'
down_revision: Union[str, Sequence[str], None] = 'dd154cf6a3b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_players_jersey_range", "players", type_="check"
    )
    op.create_check_constraint(
        "ck_players_jersey_range",
        "players",
        "jersey_number BETWEEN 0 AND 999",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_players_jersey_range", "players", type_="check"
    )
    op.create_check_constraint(
        "ck_players_jersey_range",
        "players",
        "jersey_number BETWEEN 0 AND 99",
    )
