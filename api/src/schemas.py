from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


_NameField = Annotated[str, Field(min_length=1, max_length=120)]
_NameFieldOpt = Annotated[str | None, Field(default=None, min_length=1, max_length=120)]
_TierField = Annotated[int | None, Field(default=None, ge=1, le=8)]
_JerseyField = Annotated[int, Field(ge=0, le=99)]
_JerseyFieldOpt = Annotated[int | None, Field(default=None, ge=0, le=99)]


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
