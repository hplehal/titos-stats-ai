from datetime import datetime
from enum import Enum

from cuid2 import Cuid
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


_cuid = Cuid(length=24)


def _new_id() -> str:
    return _cuid.generate()


class PlayAction(str, Enum):
    SERVE = "SERVE"
    PASS = "PASS"
    SET = "SET"
    ATTACK = "ATTACK"
    BLOCK = "BLOCK"
    DIG = "DIG"
    FREEBALL = "FREEBALL"


class PlayResult(str, Enum):
    SUCCESS = "SUCCESS"
    ERROR = "ERROR"
    CONTINUED = "CONTINUED"


class Season(Base):
    __tablename__ = "seasons"

    id: Mapped[str] = mapped_column(String(24), primary_key=True, default=_new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    teams: Mapped[list["Team"]] = relationship(
        back_populates="season",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    matches: Mapped[list["Match"]] = relationship(
        back_populates="season",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(24), primary_key=True, default=_new_id)
    season_id: Mapped[str] = mapped_column(
        ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    current_tier: Mapped[int | None] = mapped_column(Integer, nullable=True)

    season: Mapped["Season"] = relationship(back_populates="teams")
    players: Mapped[list["Player"]] = relationship(
        back_populates="team",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint(
            "current_tier IS NULL OR current_tier BETWEEN 1 AND 8",
            name="ck_teams_current_tier_range",
        ),
    )


class Player(Base):
    __tablename__ = "players"

    id: Mapped[str] = mapped_column(String(24), primary_key=True, default=_new_id)
    team_id: Mapped[str] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    jersey_number: Mapped[int] = mapped_column(Integer, nullable=False)

    team: Mapped["Team"] = relationship(back_populates="players")
    plays: Mapped[list["Play"]] = relationship(
        back_populates="player", passive_deletes=True
    )

    __table_args__ = (
        UniqueConstraint(
            "team_id", "jersey_number", name="uq_players_team_jersey"
        ),
        CheckConstraint(
            # Rec-league reality: some players run 3-digit jerseys (Robin de
            # los Santos #245 etc). 999 caps the runaway-typo damage without
            # boxing out the actual outliers.
            "jersey_number BETWEEN 0 AND 999",
            name="ck_players_jersey_range",
        ),
    )


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String(24), primary_key=True, default=_new_id)
    season_id: Mapped[str] = mapped_column(
        ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    home_team_id: Mapped[str] = mapped_column(
        ForeignKey("teams.id"), nullable=False, index=True
    )
    away_team_id: Mapped[str] = mapped_column(
        ForeignKey("teams.id"), nullable=False, index=True
    )
    played_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    tier: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Phase 1.5: league-week grouping + which court the match was played on.
    # Both nullable for backfill compatibility; UI may default to most-recent.
    week_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    court: Mapped[str | None] = mapped_column(String(32), nullable=True)

    season: Mapped["Season"] = relationship(back_populates="matches")
    home_team: Mapped["Team"] = relationship(foreign_keys=[home_team_id])
    away_team: Mapped["Team"] = relationship(foreign_keys=[away_team_id])
    rallies: Mapped[list["Rally"]] = relationship(
        back_populates="match",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    video_assets: Mapped[list["VideoAsset"]] = relationship(
        back_populates="match",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint(
            "tier IS NULL OR tier BETWEEN 1 AND 8",
            name="ck_matches_tier_range",
        ),
        CheckConstraint(
            "home_team_id <> away_team_id",
            name="ck_matches_distinct_teams",
        ),
    )


class VideoAsset(Base):
    __tablename__ = "video_assets"

    id: Mapped[str] = mapped_column(String(24), primary_key=True, default=_new_id)
    match_id: Mapped[str] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    storage_url: Mapped[str] = mapped_column(String(512), nullable=False)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    match: Mapped["Match"] = relationship(back_populates="video_assets")

    __table_args__ = (
        CheckConstraint(
            "kind IN ('raw', 'preview', 'clip')",
            name="ck_video_assets_kind",
        ),
    )


class Rally(Base):
    __tablename__ = "rallies"

    id: Mapped[str] = mapped_column(String(24), primary_key=True, default=_new_id)
    match_id: Mapped[str] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    start_time: Mapped[float] = mapped_column(Float, nullable=False)
    end_time: Mapped[float | None] = mapped_column(Float, nullable=True)
    point_won_by: Mapped[str | None] = mapped_column(String(8), nullable=True)
    ai_proposed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    ai_confirmed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    match: Mapped["Match"] = relationship(back_populates="rallies")
    plays: Mapped[list["Play"]] = relationship(
        back_populates="rally",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Play.sequence",
    )

    __table_args__ = (
        CheckConstraint(
            "point_won_by IS NULL OR point_won_by IN ('home', 'away')",
            name="ck_rallies_point_won_by",
        ),
        CheckConstraint(
            "end_time IS NULL OR end_time >= start_time",
            name="ck_rallies_time_order",
        ),
    )


class Play(Base):
    __tablename__ = "plays"

    id: Mapped[str] = mapped_column(String(24), primary_key=True, default=_new_id)
    rally_id: Mapped[str] = mapped_column(
        ForeignKey("rallies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # SET NULL on player delete preserves the play data — see project memory.
    player_id: Mapped[str | None] = mapped_column(
        ForeignKey("players.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[PlayAction] = mapped_column(
        SAEnum(PlayAction, name="play_action"), nullable=False
    )
    result: Mapped[PlayResult] = mapped_column(
        SAEnum(PlayResult, name="play_result"), nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    # Video time at the moment of tagging — distinct from rally.start_time so
    # individual contacts can be located in the source clip. Backfilled from
    # rally.start_time for plays that pre-date this column.
    play_time_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    team: Mapped[str | None] = mapped_column(String(8), nullable=True)
    position: Mapped[str | None] = mapped_column(String(32), nullable=True)
    ai_suggested: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    ai_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    rally: Mapped["Rally"] = relationship(back_populates="plays")
    player: Mapped["Player | None"] = relationship(back_populates="plays")

    __table_args__ = (
        # Deferred so DELETE-and-repack within one txn doesn't trip the
        # uniqueness check on intermediate state.
        UniqueConstraint(
            "rally_id",
            "sequence",
            name="uq_plays_rally_sequence",
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint(
            "team IS NULL OR team IN ('home', 'away')",
            name="ck_plays_team",
        ),
        CheckConstraint(
            "ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)",
            name="ck_plays_ai_confidence_range",
        ),
    )
