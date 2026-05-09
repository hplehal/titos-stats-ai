"""GET /matches/{id}/export.zip — zip layout, headers, CSV columns + rows."""

import csv
import io
import zipfile
from datetime import datetime, timezone

from httpx import AsyncClient


async def _scaffold(client: AsyncClient) -> dict:
    s = (await client.post("/seasons", json={"name": "S"})).json()
    home = (
        await client.post(
            "/teams", json={"name": "Sharks", "season_id": s["id"]}
        )
    ).json()
    away = (
        await client.post(
            "/teams", json={"name": "Bolts", "season_id": s["id"]}
        )
    ).json()
    setter = (
        await client.post(
            "/players",
            json={"name": "Setter", "team_id": home["id"], "jersey_number": 5},
        )
    ).json()
    hitter = (
        await client.post(
            "/players",
            json={"name": "Hitter", "team_id": home["id"], "jersey_number": 7},
        )
    ).json()
    enemy = (
        await client.post(
            "/players",
            json={"name": "Enemy", "team_id": away["id"], "jersey_number": 1},
        )
    ).json()
    m = (
        await client.post(
            "/matches",
            json={
                "season_id": s["id"],
                "home_team_id": home["id"],
                "away_team_id": away["id"],
                "played_at": datetime(
                    2026, 5, 15, tzinfo=timezone.utc
                ).isoformat(),
                "video_key": "k",
            },
        )
    ).json()
    return {
        "match": m,
        "home": home,
        "away": away,
        "setter": setter,
        "hitter": hitter,
        "enemy": enemy,
    }


async def _open_zip(client: AsyncClient, match_id: str) -> dict[str, list[dict]]:
    r = await client.get(f"/matches/{match_id}/export.zip")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/zip"
    assert r.headers["content-disposition"].startswith("attachment;")
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    return {
        name: list(csv.DictReader(io.StringIO(zf.read(name).decode())))
        for name in zf.namelist()
    }


async def test_export_404_unknown_match(client: AsyncClient) -> None:
    r = await client.get("/matches/does-not-exist/export.zip")
    assert r.status_code == 404


async def test_export_zip_layout_and_filename(client: AsyncClient) -> None:
    ctx = await _scaffold(client)
    mid = ctx["match"]["id"]
    r = await client.get(f"/matches/{mid}/export.zip")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"
    # filename: {match_id}-YYYY-MM-DD.zip
    cd = r.headers["content-disposition"]
    assert f'filename="{mid}-2026-05-15.zip"' in cd

    zf = zipfile.ZipFile(io.BytesIO(r.content))
    assert set(zf.namelist()) == {"plays.csv", "stats.csv"}


async def test_export_plays_columns_and_ordering(client: AsyncClient) -> None:
    ctx = await _scaffold(client)
    mid = ctx["match"]["id"]

    # Two rallies, second created first but with a later start_time — verify
    # rally_number reflects start_time ordering, not insertion order.
    r2 = (
        await client.post(
            f"/matches/{mid}/rallies", json={"start_time": 50.0}
        )
    ).json()
    r1 = (
        await client.post(
            f"/matches/{mid}/rallies", json={"start_time": 10.0}
        )
    ).json()

    await client.post(
        f"/rallies/{r1['id']}/plays",
        json={
            "player_id": ctx["hitter"]["id"],
            "action": "ATTACK",
            "result": "SUCCESS",
            "sequence": 1,
            "play_time_seconds": 12.5,
            "team": "home",
        },
    )
    await client.post(
        f"/rallies/{r2['id']}/plays",
        json={
            "player_id": None,
            "action": "SERVE",
            "result": "ERROR",
            "sequence": 1,
            "play_time_seconds": 53.25,
            "team": "away",
        },
    )

    files = await _open_zip(client, mid)
    plays = files["plays.csv"]
    assert [
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
        "play_time_seconds",
    ] == list(plays[0].keys())
    assert len(plays) == 2

    # rally with start_time=10 → rally_number=1, even though created second.
    early = next(p for p in plays if p["rally_id"] == r1["id"])
    late = next(p for p in plays if p["rally_id"] == r2["id"])
    assert early["rally_number"] == "1"
    assert late["rally_number"] == "2"

    # Player columns populated when player_id present, blank when null.
    assert early["player_name"] == "Hitter"
    assert early["jersey_number"] == "7"
    assert late["player_name"] == ""
    assert late["jersey_number"] == ""

    # New per-play timestamp column round-trips the float precisely.
    assert float(early["play_time_seconds"]) == 12.5
    assert float(late["play_time_seconds"]) == 53.25


async def test_export_stats_columns_and_rows(client: AsyncClient) -> None:
    ctx = await _scaffold(client)
    mid = ctx["match"]["id"]

    # One rally, one kill, point won by home — gives non-zero numbers to verify.
    rally = (
        await client.post(f"/matches/{mid}/rallies", json={"start_time": 0})
    ).json()
    await client.post(
        f"/rallies/{rally['id']}/plays",
        json={
            "player_id": ctx["hitter"]["id"],
            "action": "ATTACK",
            "result": "SUCCESS",
            "sequence": 1,
            "play_time_seconds": 0,
            "team": "home",
        },
    )
    await client.patch(
        f"/rallies/{rally['id']}",
        json={"end_time": 5.0, "point_won_by": "home"},
    )

    files = await _open_zip(client, mid)
    stats = files["stats.csv"]
    assert [
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
    ] == list(stats[0].keys())

    team_rows = [r for r in stats if r["scope"] == "team"]
    player_rows = [r for r in stats if r["scope"] == "player"]
    assert len(team_rows) == 2
    # 3 players total across both rosters.
    assert len(player_rows) == 3

    # Team rows have null-equivalent (empty) player columns.
    for tr in team_rows:
        assert tr["player_name"] == ""
        assert tr["jersey_number"] == ""

    home = next(r for r in team_rows if r["team_name"] == "Sharks")
    assert home["kills"] == "1"
    assert home["total_points"] == "1"  # K(1) + Aces(0) + Blocks(0)

    hitter_row = next(
        r for r in player_rows if r["player_name"] == "Hitter"
    )
    assert hitter_row["team_name"] == "Sharks"
    assert hitter_row["jersey_number"] == "7"
    assert hitter_row["kills"] == "1"
    assert hitter_row["total_points"] == "1"
