from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .. import models, schemas
from ..db import get_db


router = APIRouter(prefix="/matches", tags=["matches"])


def _full_match_query(match_id: str | None = None):
    stmt = (
        select(models.Match)
        .options(
            selectinload(models.Match.home_team),
            selectinload(models.Match.away_team),
            selectinload(models.Match.video_assets),
        )
    )
    if match_id is not None:
        stmt = stmt.where(models.Match.id == match_id)
    return stmt


@router.get("", response_model=list[schemas.MatchRead])
async def list_matches(
    season_id: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[models.Match]:
    stmt = _full_match_query().order_by(models.Match.played_at.desc())
    if season_id is not None:
        stmt = stmt.where(models.Match.season_id == season_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post(
    "", response_model=schemas.MatchRead, status_code=status.HTTP_201_CREATED
)
async def create_match(
    payload: schemas.MatchCreate,
    db: AsyncSession = Depends(get_db),
) -> models.Match:
    if payload.home_team_id == payload.away_team_id:
        raise HTTPException(
            status_code=422,
            detail="home_team_id and away_team_id must differ.",
        )

    season = await db.get(models.Season, payload.season_id)
    if season is None:
        raise HTTPException(404, "Season not found.")

    teams_result = await db.execute(
        select(models.Team).where(
            models.Team.id.in_([payload.home_team_id, payload.away_team_id])
        )
    )
    teams = list(teams_result.scalars().all())
    if len(teams) != 2:
        raise HTTPException(404, "One or both teams not found.")
    for t in teams:
        if t.season_id != payload.season_id:
            raise HTTPException(
                422,
                f"Team {t.id} does not belong to season {payload.season_id}.",
            )

    match = models.Match(
        season_id=payload.season_id,
        home_team_id=payload.home_team_id,
        away_team_id=payload.away_team_id,
        played_at=payload.played_at,
        tier=payload.tier,
    )
    video = models.VideoAsset(
        match=match,
        kind="raw",
        storage_url=payload.video_key,
        duration_seconds=payload.video_duration,
    )
    db.add(match)
    db.add(video)
    await db.commit()

    result = await db.execute(_full_match_query(match.id))
    return result.scalar_one()


@router.get("/{match_id}", response_model=schemas.MatchRead)
async def read_match(
    match_id: str,
    db: AsyncSession = Depends(get_db),
) -> models.Match:
    result = await db.execute(_full_match_query(match_id))
    match = result.scalar_one_or_none()
    if match is None:
        raise HTTPException(404, "Match not found.")
    return match


@router.delete("/{match_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_match(
    match_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    match = await db.get(models.Match, match_id)
    if match is None:
        raise HTTPException(404, "Match not found.")
    await db.delete(match)
    await db.commit()
