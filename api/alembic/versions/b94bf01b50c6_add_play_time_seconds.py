"""add play_time_seconds

Revision ID: b94bf01b50c6
Revises: 8b4f7528bc23
Create Date: 2026-05-09 00:23:05.776288

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b94bf01b50c6'
down_revision: Union[str, Sequence[str], None] = '8b4f7528bc23'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add plays.play_time_seconds, backfill from rally.start_time, NOT NULL.

    Pre-existing plays don't have a true per-play timestamp, so we inherit the
    rally's start_time as a best-effort backfill. New plays must supply this
    explicitly via the API.
    """
    op.add_column(
        "plays",
        sa.Column("play_time_seconds", sa.Float(), nullable=True),
    )
    op.execute(
        "UPDATE plays SET play_time_seconds = rallies.start_time "
        "FROM rallies WHERE plays.rally_id = rallies.id "
        "AND plays.play_time_seconds IS NULL"
    )
    op.alter_column(
        "plays", "play_time_seconds", existing_type=sa.Float(), nullable=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("plays", "play_time_seconds")
