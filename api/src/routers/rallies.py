from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .. import models, schemas
from ..db import get_db


# No prefix — routes mix /matches/{id}/rallies (parent-scoped) with
# /rallies/{id} (resource-scoped) by design.
router = APIRouter(tags=["rallies"])


@router.get(
    "/matches/{match_id}/rallies", response_model=list[schemas.RallyRead]
)
async def list_rallies(
    match_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[models.Rally]:
    match = await db.get(models.Match, match_id)
    if match is None:
        raise HTTPException(404, "Match not found.")
    result = await db.execute(
        select(models.Rally)
        .where(models.Rally.match_id == match_id)
        .options(selectinload(models.Rally.plays))
        .order_by(models.Rally.start_time)
    )
    return list(result.scalars().all())


@router.post(
    "/matches/{match_id}/rallies",
    response_model=schemas.RallyRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_rally(
    match_id: str,
    payload: schemas.RallyCreate,
    db: AsyncSession = Depends(get_db),
) -> models.Rally:
    match = await db.get(models.Match, match_id)
    if match is None:
        raise HTTPException(404, "Match not found.")
    rally = models.Rally(match_id=match_id, start_time=payload.start_time)
    db.add(rally)
    await db.commit()
    await db.refresh(rally, ["plays"])
    return rally


@router.patch("/rallies/{rally_id}", response_model=schemas.RallyRead)
async def update_rally(
    rally_id: str,
    payload: schemas.RallyUpdate,
    db: AsyncSession = Depends(get_db),
) -> models.Rally:
    rally = await db.get(models.Rally, rally_id)
    if rally is None:
        raise HTTPException(404, "Rally not found.")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(rally, k, v)
    await db.commit()
    await db.refresh(rally, ["plays"])
    return rally


@router.delete("/rallies/{rally_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rally(
    rally_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    rally = await db.get(models.Rally, rally_id)
    if rally is None:
        raise HTTPException(404, "Rally not found.")
    await db.delete(rally)
    await db.commit()
