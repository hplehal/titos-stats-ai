from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .. import models, schemas
from ..db import get_db


router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("", response_model=list[schemas.TeamRead])
async def list_teams(db: AsyncSession = Depends(get_db)) -> list[models.Team]:
    result = await db.execute(select(models.Team).order_by(models.Team.name))
    return list(result.scalars().all())


@router.post(
    "", response_model=schemas.TeamRead, status_code=status.HTTP_201_CREATED
)
async def create_team(
    payload: schemas.TeamCreate,
    db: AsyncSession = Depends(get_db),
) -> models.Team:
    season = await db.get(models.Season, payload.season_id)
    if season is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Season not found")
    team = models.Team(**payload.model_dump())
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return team


@router.get("/{team_id}", response_model=schemas.TeamReadWithPlayers)
async def read_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
) -> models.Team:
    result = await db.execute(
        select(models.Team)
        .where(models.Team.id == team_id)
        .options(selectinload(models.Team.players))
    )
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    return team


@router.patch("/{team_id}", response_model=schemas.TeamRead)
async def update_team(
    team_id: str,
    payload: schemas.TeamUpdate,
    db: AsyncSession = Depends(get_db),
) -> models.Team:
    team = await db.get(models.Team, team_id)
    if team is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(team, k, v)
    await db.commit()
    await db.refresh(team)
    return team


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    team = await db.get(models.Team, team_id)
    if team is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    await db.delete(team)
    await db.commit()


@router.get("/{team_id}/players", response_model=list[schemas.PlayerRead])
async def list_team_players(
    team_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[models.Player]:
    team = await db.get(models.Team, team_id)
    if team is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    result = await db.execute(
        select(models.Player)
        .where(models.Player.team_id == team_id)
        .order_by(models.Player.jersey_number)
    )
    return list(result.scalars().all())
