"""Demo seed: one Demo Season, two teams of 8 players, one no-video match.

Idempotent: drops the existing "Demo Season" first (cascades to teams,
players, matches, rallies, plays via FK ON DELETE CASCADE).

Run: `make seed` (or `uv run python -m src.seed` from api/).
"""

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

from .config import get_settings
from . import models


_DEMO_SEASON_NAME = "Demo Season"
_HOME_NAME = "Tito Sharks"
_AWAY_NAME = "Tito Bolts"
_HOME_ROSTER = [
    ("Alex Reyes", 1),
    ("Bryn Carter", 2),
    ("Cam Park", 3),
    ("Dani Singh", 4),
    ("Ezra Tan", 5),
    ("Finn Walsh", 6),
    ("Gus Pereira", 7),
    ("Hana Kobayashi", 8),
]
_AWAY_ROSTER = [
    ("Ivy Ramos", 1),
    ("Jay Chen", 2),
    ("Kai Mendez", 3),
    ("Lou Petrov", 4),
    ("Maya Gupta", 5),
    ("Nico Adler", 6),
    ("Owen Kim", 7),
    ("Pia Romero", 8),
]


async def _seed() -> None:
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        existing = await db.execute(
            select(models.Season).where(models.Season.name == _DEMO_SEASON_NAME)
        )
        for s in existing.scalars().all():
            await db.delete(s)
        await db.commit()

        season = models.Season(name=_DEMO_SEASON_NAME)
        db.add(season)
        await db.flush()

        home = models.Team(season_id=season.id, name=_HOME_NAME, current_tier=4)
        away = models.Team(season_id=season.id, name=_AWAY_NAME, current_tier=5)
        db.add_all([home, away])
        await db.flush()

        for name, jersey in _HOME_ROSTER:
            db.add(
                models.Player(team_id=home.id, name=name, jersey_number=jersey)
            )
        for name, jersey in _AWAY_ROSTER:
            db.add(
                models.Player(team_id=away.id, name=name, jersey_number=jersey)
            )

        # Demo match with no video — useful for browsing the season/team/player
        # views; tracking requires a real video upload via the UI.
        match = models.Match(
            season_id=season.id,
            home_team_id=home.id,
            away_team_id=away.id,
            played_at=datetime.now(timezone.utc),
            tier=4,
        )
        db.add(match)
        await db.commit()

    await engine.dispose()
    print(f"Seeded: {_DEMO_SEASON_NAME} → {_HOME_NAME} vs {_AWAY_NAME}")


if __name__ == "__main__":
    asyncio.run(_seed())
