from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from .models import PlayAction, PlayResult


_NameField = Annotated[str, Field(min_length=1, max_length=120)]
_NameFieldOpt = Annotated[str | None, Field(default=None, min_length=1, max_length=120)]
_TierField = Annotated[int | None, Field(default=None, ge=1, le=8)]
_JerseyField = Annotated[int, Field(ge=0, le=999)]
_JerseyFieldOpt = Annotated[int | None, Field(default=None, ge=0, le=999)]
_WeekField = Annotated[int | None, Field(default=None, ge=1, le=52)]
_CourtField = Annotated[str | None, Field(default=None, min_length=1, max_length=32)]


class SeasonCreate(BaseModel):
    name: _NameField


class SeasonUpdate(BaseModel):
    name: _NameFieldOpt


class SeasonRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    created_at: datetime


class TeamCreate(BaseModel):
    name: _NameField
    season_id: str
    current_tier: _TierField


class TeamUpdate(BaseModel):
    name: _NameFieldOpt
    current_tier: _TierField


class TeamRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    season_id: str
    name: str
    current_tier: int | None


class PlayerCreate(BaseModel):
    name: _NameField
    team_id: str
    jersey_number: _JerseyField


class PlayerUpdate(BaseModel):
    name: _NameFieldOpt
    jersey_number: _JerseyFieldOpt


class PlayerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    team_id: str
    name: str
    jersey_number: int


class SeasonReadWithTeams(SeasonRead):
    teams: list[TeamRead] = []


class TeamReadWithPlayers(TeamRead):
    players: list[PlayerRead] = []


# ─── Uploads ────────────────────────────────────────────────────────────────


class PresignRequest(BaseModel):
    filename: Annotated[str, Field(min_length=1, max_length=200)]
    content_type: Annotated[str, Field(min_length=1, max_length=100)]


class PresignResponse(BaseModel):
    upload_url: str
    key: str


# ─── Matches + Videos ───────────────────────────────────────────────────────


class VideoAssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    match_id: str
    kind: str
    storage_url: str  # R2 object key — playback uses GET /videos/{id}/url
    duration_seconds: float | None
    width: int | None
    height: int | None


class MatchCreate(BaseModel):
    season_id: str
    home_team_id: str
    away_team_id: str
    played_at: datetime
    tier: _TierField
    week_number: _WeekField
    court: _CourtField
    video_key: Annotated[str, Field(min_length=1, max_length=512)]
    video_duration: float | None = None


class MatchUpdate(BaseModel):
    played_at: datetime | None = None
    tier: _TierField
    week_number: _WeekField
    court: _CourtField


class MatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    season_id: str
    home_team: TeamReadWithPlayers
    away_team: TeamReadWithPlayers
    played_at: datetime
    tier: int | None
    week_number: int | None
    court: str | None
    video_assets: list[VideoAssetRead] = []


class VideoUrlResponse(BaseModel):
    url: str
    expires_in_seconds: int


# ─── Rallies + Plays ────────────────────────────────────────────────────────


class PlayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    rally_id: str
    player_id: str | None
    action: PlayAction
    result: PlayResult
    sequence: int
    play_time_seconds: float
    team: str | None
    position: str | None
    ai_suggested: bool
    ai_confidence: float | None
    notes: str | None


class RallyCreate(BaseModel):
    start_time: Annotated[float, Field(ge=0)]


class RallyUpdate(BaseModel):
    start_time: Annotated[float | None, Field(default=None, ge=0)]
    end_time: Annotated[float | None, Field(default=None, ge=0)]
    point_won_by: Literal["home", "away"] | None = None
    ai_confirmed: bool | None = None


class RallyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    match_id: str
    start_time: float
    end_time: float | None
    point_won_by: str | None
    ai_proposed: bool
    ai_confirmed: bool
    plays: list[PlayRead] = []


# ─── Plays (writes) ─────────────────────────────────────────────────────────


class PlayCreate(BaseModel):
    player_id: str | None = None
    action: PlayAction
    result: PlayResult
    sequence: Annotated[int, Field(ge=1)]
    play_time_seconds: Annotated[float, Field(ge=0)]
    team: Literal["home", "away"] | None = None
    position: str | None = None
    notes: str | None = None


class PlayUpdate(BaseModel):
    player_id: str | None = None
    action: PlayAction | None = None
    result: PlayResult | None = None
    sequence: Annotated[int | None, Field(default=None, ge=1)]
    play_time_seconds: Annotated[float | None, Field(default=None, ge=0)]
    team: Literal["home", "away"] | None = None
    position: str | None = None
    notes: str | None = None


# ─── Stats ──────────────────────────────────────────────────────────────────


class PlayerStats(BaseModel):
    player_id: str
    name: str
    jersey_number: int
    team: Literal["home", "away"]
    kills: int = 0
    attack_errors: int = 0
    aces: int = 0
    service_errors: int = 0
    blocks: int = 0
    digs: int = 0
    reception_errors: int = 0
    assists: int = 0
    points: int = 0  # kills + aces + blocks


class TeamStats(BaseModel):
    side: Literal["home", "away"]
    team_id: str
    name: str
    score: int = 0  # rallies won
    kills: int = 0
    attack_errors: int = 0
    aces: int = 0
    service_errors: int = 0
    blocks: int = 0
    digs: int = 0
    reception_errors: int = 0
    assists: int = 0


class MatchStatsResponse(BaseModel):
    home: TeamStats
    away: TeamStats
    players: list[PlayerStats]
