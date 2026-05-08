from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import models, schemas
from ..db import get_db


router = APIRouter(tags=["plays"])


@router.get("/rallies/{rally_id}/plays", response_model=list[schemas.PlayRead])
async def list_plays(
    rally_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[models.Play]:
    rally = await db.get(models.Rally, rally_id)
    if rally is None:
        raise HTTPException(404, "Rally not found.")
    result = await db.execute(
        select(models.Play)
        .where(models.Play.rally_id == rally_id)
        .order_by(models.Play.sequence)
    )
    return list(result.scalars().all())


@router.post(
    "/rallies/{rally_id}/plays",
    response_model=schemas.PlayRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_play(
    rally_id: str,
    payload: schemas.PlayCreate,
    db: AsyncSession = Depends(get_db),
) -> models.Play:
    rally = await db.get(models.Rally, rally_id)
    if rally is None:
        raise HTTPException(404, "Rally not found.")

    play = models.Play(
        rally_id=rally_id,
        player_id=payload.player_id,
        action=payload.action,
        result=payload.result,
        sequence=payload.sequence,
        team=payload.team,
        position=payload.position,
        notes=payload.notes,
    )
    db.add(play)
    await db.commit()
    await db.refresh(play)
    return play


@router.patch("/plays/{play_id}", response_model=schemas.PlayRead)
async def update_play(
    play_id: str,
    payload: schemas.PlayUpdate,
    db: AsyncSession = Depends(get_db),
) -> models.Play:
    play = await db.get(models.Play, play_id)
    if play is None:
        raise HTTPException(404, "Play not found.")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(play, k, v)
    await db.commit()
    await db.refresh(play)
    return play


@router.delete("/plays/{play_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_play(
    play_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    play = await db.get(models.Play, play_id)
    if play is None:
        raise HTTPException(404, "Play not found.")

    rally_id = play.rally_id
    await db.delete(play)
    await db.flush()  # flush delete before re-numbering, same txn

    # Re-pack remaining sequences 1..N. The unique (rally_id, sequence)
    # constraint is DEFERRABLE INITIALLY DEFERRED, so intermediate states
    # mid-renumber don't violate it; check happens at commit.
    remaining = (
        await db.execute(
            select(models.Play)
            .where(models.Play.rally_id == rally_id)
            .order_by(models.Play.sequence)
        )
    ).scalars().all()
    for new_seq, p in enumerate(remaining, start=1):
        if p.sequence != new_seq:
            p.sequence = new_seq

    await db.commit()
