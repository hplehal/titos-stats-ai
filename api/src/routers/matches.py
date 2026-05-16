import csv
import io
import zipfile

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .. import models, schemas
from ..db import get_db
from ..stats import derive_match_stats


router = APIRouter(prefix="/matches", tags=["matches"])


def _full_match_query(match_id: str | None = None):
    stmt = (
        select(models.Match)
        .options(
            selectinload(models.Match.home_team).selectinload(
                models.Team.players
            ),
            selectinload(models.Match.away_team).selectinload(
                models.Team.players
            ),
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
        week_number=payload.week_number,
        court=payload.court,
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


@router.patch("/{match_id}", response_model=schemas.MatchRead)
async def update_match(
    match_id: str,
    payload: schemas.MatchUpdate,
    db: AsyncSession = Depends(get_db),
) -> models.Match:
    match = await db.get(models.Match, match_id)
    if match is None:
        raise HTTPException(404, "Match not found.")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(match, k, v)
    await db.commit()
    result = await db.execute(_full_match_query(match_id))
    return result.scalar_one()


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


@router.get("/{match_id}/stats", response_model=schemas.MatchStatsResponse)
async def match_stats(
    match_id: str,
    db: AsyncSession = Depends(get_db),
) -> schemas.MatchStatsResponse:
    stats = await derive_match_stats(match_id, db)
    if stats is None:
        raise HTTPException(404, "Match not found.")
    return stats


_PLAYS_COLUMNS = [
    "match_id",
    "rally_id",
    "rally_number",
    "play_sequence",
    "start_time_seconds",
    "team",
    "player_name",
    "jersey_number",
    "action",
    "result",
    # Per-play video timestamp captured at tag time. Appended (post-Phase 1)
    # to keep column-index-based readers of the original 10-col layout working.
    "play_time_seconds",
    # Match-level grouping (Phase 1.5). Constant per row within a match —
    # denormalized here so downstream tools can filter without re-joining.
    "week_number",
    "court",
]
_STATS_COLUMNS = [
    "scope",
    "team_name",
    "player_name",
    "jersey_number",
    "kills",
    "attack_errors",
    "aces",
    "service_errors",
    "blocks",
    "digs",
    "reception_errors",
    "assists",
    "total_points",
]


@router.get("/{match_id}/export.zip")
async def export_match(
    match_id: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    # One trip for everything the CSVs need.
    result = await db.execute(
        select(models.Match)
        .where(models.Match.id == match_id)
        .options(
            selectinload(models.Match.home_team).selectinload(
                models.Team.players
            ),
            selectinload(models.Match.away_team).selectinload(
                models.Team.players
            ),
            selectinload(models.Match.rallies)
            .selectinload(models.Rally.plays)
            .selectinload(models.Play.player),
        )
    )
    match = result.scalar_one_or_none()
    if match is None:
        raise HTTPException(404, "Match not found.")

    stats = await derive_match_stats(match_id, db)
    assert stats is not None  # match exists; stats can't be None here.

    plays_buf = io.StringIO()
    plays_writer = csv.writer(plays_buf)
    plays_writer.writerow(_PLAYS_COLUMNS)
    rallies_sorted = sorted(match.rallies, key=lambda r: r.start_time)
    for rally_number, rally in enumerate(rallies_sorted, start=1):
        for play in sorted(rally.plays, key=lambda p: p.sequence):
            plays_writer.writerow(
                [
                    match.id,
                    rally.id,
                    rally_number,
                    play.sequence,
                    rally.start_time,
                    play.team or "",
                    play.player.name if play.player else "",
                    play.player.jersey_number if play.player else "",
                    play.action.value,
                    play.result.value,
                    play.play_time_seconds,
                    match.week_number if match.week_number is not None else "",
                    match.court or "",
                ]
            )

    stats_buf = io.StringIO()
    stats_writer = csv.writer(stats_buf)
    stats_writer.writerow(_STATS_COLUMNS)
    for team_stats in (stats.home, stats.away):
        # total_points uses the same K+Aces+Blocks definition as PlayerStats.
        team_points = team_stats.kills + team_stats.aces + team_stats.blocks
        stats_writer.writerow(
            [
                "team",
                team_stats.name,
                "",
                "",
                team_stats.kills,
                team_stats.attack_errors,
                team_stats.aces,
                team_stats.service_errors,
                team_stats.blocks,
                team_stats.digs,
                team_stats.reception_errors,
                team_stats.assists,
                team_points,
            ]
        )
    team_name_by_side = {"home": stats.home.name, "away": stats.away.name}
    for ps in stats.players:
        stats_writer.writerow(
            [
                "player",
                team_name_by_side[ps.team],
                ps.name,
                ps.jersey_number,
                ps.kills,
                ps.attack_errors,
                ps.aces,
                ps.service_errors,
                ps.blocks,
                ps.digs,
                ps.reception_errors,
                ps.assists,
                ps.points,
            ]
        )

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("plays.csv", plays_buf.getvalue())
        zf.writestr("stats.csv", stats_buf.getvalue())

    date_str = match.played_at.strftime("%Y-%m-%d")
    filename = f"{match.id}-{date_str}.zip"
    return Response(
        content=zip_buf.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
