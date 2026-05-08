from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .. import models, schemas
from ..db import get_db


router = APIRouter(prefix="/seasons", tags=["seasons"])


@router.get("", response_model=list[schemas.SeasonRead])
async def list_seasons(db: AsyncSession = Depends(get_db)) -> list[models.Season]:
    result = await db.execute(
        select(models.Season).order_by(models.Season.created_at.desc())
    )
    return list(result.scalars().all())


@router.post(
    "", response_model=schemas.SeasonRead, status_code=status.HTTP_201_CREATED
)
async def create_season(
    payload: schemas.SeasonCreate,
    db: AsyncSession = Depends(get_db),
) -> models.Season:
    season = models.Season(name=payload.name)
    db.add(season)
    await db.commit()
    await db.refresh(season)
    return season


@router.get("/{season_id}", response_model=schemas.SeasonReadWithTeams)
async def read_season(
    season_id: str,
    db: AsyncSession = Depends(get_db),
) -> models.Season:
    result = await db.execute(
        select(models.Season)
        .where(models.Season.id == season_id)
        .options(selectinload(models.Season.teams))
    )
    season = result.scalar_one_or_none()
    if season is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Season not found")
    return season


@router.patch("/{season_id}", response_model=schemas.SeasonRead)
async def update_season(
    season_id: str,
    payload: schemas.SeasonUpdate,
    db: AsyncSession = Depends(get_db),
) -> models.Season:
    season = await db.get(models.Season, season_id)
    if season is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Season not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(season, k, v)
    await db.commit()
    await db.refresh(season)
    return season


@router.delete("/{season_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_season(
    season_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    season = await db.get(models.Season, season_id)
    if season is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Season not found")
    await db.delete(season)
    await db.commit()


@router.get("/{season_id}/teams", response_model=list[schemas.TeamRead])
async def list_season_teams(
    season_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[models.Team]:
    season = await db.get(models.Season, season_id)
    if season is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Season not found")
    result = await db.execute(
        select(models.Team)
        .where(models.Team.season_id == season_id)
        .order_by(models.Team.name)
    )
    return list(result.scalars().all())
