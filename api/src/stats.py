"""Stat derivation per PROJECT_BRIEF.

Stats are computed from atomic Plays — never stored. Every call to
derive_match_stats hits the DB once with eager loads, then walks rallies in
order so we can apply the Assist rule (SET immediately preceding a teammate
KILL within the same rally).
"""

from collections import defaultdict
from typing import Literal, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from . import models, schemas


_StatBucket = dict[str, int]


def _zero() -> _StatBucket:
    return {
        "kills": 0,
        "attack_errors": 0,
        "aces": 0,
        "service_errors": 0,
        "blocks": 0,
        "digs": 0,
        "reception_errors": 0,
        "assists": 0,
    }


def _classify(play: models.Play) -> list[str]:
    """Return the stat keys this play counts toward (not including assist —
    that's computed separately because it requires the next play's context).
    """
    a, r = play.action, play.result
    if a == models.PlayAction.ATTACK:
        if r == models.PlayResult.SUCCESS:
            return ["kills"]
        if r == models.PlayResult.ERROR:
            return ["attack_errors"]
    elif a == models.PlayAction.SERVE:
        if r == models.PlayResult.SUCCESS:
            return ["aces"]
        if r == models.PlayResult.ERROR:
            return ["service_errors"]
    elif a == models.PlayAction.BLOCK:
        if r == models.PlayResult.SUCCESS:
            return ["blocks"]
    elif a == models.PlayAction.DIG:
        if r in (models.PlayResult.SUCCESS, models.PlayResult.CONTINUED):
            return ["digs"]
    elif a == models.PlayAction.PASS:
        if r == models.PlayResult.ERROR:
            return ["reception_errors"]
    return []


async def derive_match_stats(
    match_id: str, db: AsyncSession
) -> schemas.MatchStatsResponse | None:
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
            selectinload(models.Match.rallies).selectinload(
                models.Rally.plays
            ),
        )
    )
    match = result.scalar_one_or_none()
    if match is None:
        return None

    home_team = match.home_team
    away_team = match.away_team

    # player_id → bucket. Plays without a player_id are dropped from the
    # per-player table but still credited to team totals (via _team_buckets).
    per_player: dict[str, _StatBucket] = defaultdict(_zero)
    team_buckets: dict[str, _StatBucket] = {"home": _zero(), "away": _zero()}

    for rally in match.rallies:
        plays_sorted = sorted(rally.plays, key=lambda p: p.sequence)
        for i, play in enumerate(plays_sorted):
            keys = _classify(play)

            # Assist: this SET is immediately followed by a KILL on the same team.
            if play.action == models.PlayAction.SET and i + 1 < len(
                plays_sorted
            ):
                nxt = plays_sorted[i + 1]
                if (
                    nxt.action == models.PlayAction.ATTACK
                    and nxt.result == models.PlayResult.SUCCESS
                    and nxt.team is not None
                    and play.team == nxt.team
                ):
                    keys.append("assists")

            for k in keys:
                if play.player_id:
                    per_player[play.player_id][k] += 1
                if play.team in ("home", "away"):
                    team_buckets[cast(str, play.team)][k] += 1

    # Build PlayerStats. Always include every player on both rosters, even
    # those with zero contribution — the UI's leaderboard can rank them.
    player_list: list[schemas.PlayerStats] = []
    for team_obj, side_lit in (
        (home_team, "home"),
        (away_team, "away"),
    ):
        side = cast(Literal["home", "away"], side_lit)
        for p in team_obj.players:
            b = per_player.get(p.id, _zero())
            ps = schemas.PlayerStats(
                player_id=p.id,
                name=p.name,
                jersey_number=p.jersey_number,
                team=side,
                points=b["kills"] + b["aces"] + b["blocks"],
                **b,
            )
            player_list.append(ps)

    home_score = sum(1 for r in match.rallies if r.point_won_by == "home")
    away_score = sum(1 for r in match.rallies if r.point_won_by == "away")

    return schemas.MatchStatsResponse(
        home=schemas.TeamStats(
            side="home",
            team_id=home_team.id,
            name=home_team.name,
            score=home_score,
            **team_buckets["home"],
        ),
        away=schemas.TeamStats(
            side="away",
            team_id=away_team.id,
            name=away_team.name,
            score=away_score,
            **team_buckets["away"],
        ),
        players=player_list,
    )
