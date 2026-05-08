from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import models, schemas
from ..db import get_db


router = APIRouter(prefix="/players", tags=["players"])


@router.get("", response_model=list[schemas.PlayerRead])
async def list_players(db: AsyncSession = Depends(get_db)) -> list[models.Player]:
    result = await db.execute(select(models.Player).order_by(models.Player.name))
    return list(result.scalars().all())


@router.post(
    "", response_model=schemas.PlayerRead, status_code=status.HTTP_201_CREATED
)
async def create_player(
    payload: schemas.PlayerCreate,
    db: AsyncSession = Depends(get_db),
) -> models.Player:
    team = await db.get(models.Team, payload.team_id)
    if team is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    player = models.Player(**payload.model_dump())
    db.add(player)
    await db.commit()
    await db.refresh(player)
    return player


@router.get("/{player_id}", response_model=schemas.PlayerRead)
async def read_player(
    player_id: str,
    db: AsyncSession = Depends(get_db),
) -> models.Player:
    player = await db.get(models.Player, player_id)
    if player is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Player not found")
    return player


@router.patch("/{player_id}", response_model=schemas.PlayerRead)
async def update_player(
    player_id: str,
    payload: schemas.PlayerUpdate,
    db: AsyncSession = Depends(get_db),
) -> models.Player:
    player = await db.get(models.Player, player_id)
    if player is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Player not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(player, k, v)
    await db.commit()
    await db.refresh(player)
    return player


@router.delete("/{player_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_player(
    player_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    player = await db.get(models.Player, player_id)
    if player is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Player not found")
    await db.delete(player)
    await db.commit()
