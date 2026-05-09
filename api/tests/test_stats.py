"""Stat-derivation rules from PROJECT_BRIEF, exercised one rule per test."""

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
                "played_at": datetime(2026, 5, 15, tzinfo=timezone.utc).isoformat(),
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


async def _new_rally(client: AsyncClient, match_id: str, t: float = 0) -> str:
    r = await client.post(
        f"/matches/{match_id}/rallies", json={"start_time": t}
    )
    return r.json()["id"]


async def _add_play(
    client: AsyncClient,
    rally_id: str,
    *,
    seq: int,
    player_id: str | None,
    action: str,
    result: str,
    team: str,
) -> None:
    r = await client.post(
        f"/rallies/{rally_id}/plays",
        json={
            "player_id": player_id,
            "action": action,
            "result": result,
            "sequence": seq,
            "play_time_seconds": 0,
            "team": team,
        },
    )
    assert r.status_code == 201, r.text


async def test_kill_attack_error_aces_service_error(client: AsyncClient) -> None:
    ctx = await _scaffold(client)
    rid = await _new_rally(client, ctx["match"]["id"])

    await _add_play(
        client, rid,
        seq=1, player_id=ctx["hitter"]["id"], action="ATTACK", result="SUCCESS", team="home",
    )
    await _add_play(
        client, rid,
        seq=2, player_id=ctx["hitter"]["id"], action="ATTACK", result="ERROR", team="home",
    )
    await _add_play(
        client, rid,
        seq=3, player_id=ctx["setter"]["id"], action="SERVE", result="SUCCESS", team="home",
    )
    await _add_play(
        client, rid,
        seq=4, player_id=ctx["setter"]["id"], action="SERVE", result="ERROR", team="home",
    )

    r = await client.get(f"/matches/{ctx['match']['id']}/stats")
    body = r.json()
    hitter = next(p for p in body["players"] if p["player_id"] == ctx["hitter"]["id"])
    setter = next(p for p in body["players"] if p["player_id"] == ctx["setter"]["id"])
    assert hitter["kills"] == 1
    assert hitter["attack_errors"] == 1
    assert setter["aces"] == 1
    assert setter["service_errors"] == 1
    assert body["home"]["kills"] == 1
    assert body["home"]["attack_errors"] == 1
    assert body["home"]["aces"] == 1
    assert body["home"]["service_errors"] == 1


async def test_block_dig_reception_error(client: AsyncClient) -> None:
    ctx = await _scaffold(client)
    rid = await _new_rally(client, ctx["match"]["id"])

    await _add_play(
        client, rid,
        seq=1, player_id=ctx["hitter"]["id"], action="BLOCK", result="SUCCESS", team="home",
    )
    await _add_play(
        client, rid,
        seq=2, player_id=ctx["hitter"]["id"], action="DIG", result="SUCCESS", team="home",
    )
    await _add_play(
        client, rid,
        seq=3, player_id=ctx["setter"]["id"], action="DIG", result="CONTINUED", team="home",
    )
    await _add_play(
        client, rid,
        seq=4, player_id=ctx["setter"]["id"], action="PASS", result="ERROR", team="home",
    )

    body = (await client.get(f"/matches/{ctx['match']['id']}/stats")).json()
    hitter = next(p for p in body["players"] if p["player_id"] == ctx["hitter"]["id"])
    setter = next(p for p in body["players"] if p["player_id"] == ctx["setter"]["id"])
    assert hitter["blocks"] == 1
    assert hitter["digs"] == 1
    assert setter["digs"] == 1  # CONTINUED still counts
    assert setter["reception_errors"] == 1


async def test_assist_set_then_kill_same_team(client: AsyncClient) -> None:
    ctx = await _scaffold(client)
    rid = await _new_rally(client, ctx["match"]["id"])

    # Setter SETs (seq 1), then Hitter ATTACKs+SUCCESS (seq 2) on the same team.
    await _add_play(
        client, rid,
        seq=1, player_id=ctx["setter"]["id"], action="SET", result="CONTINUED", team="home",
    )
    await _add_play(
        client, rid,
        seq=2, player_id=ctx["hitter"]["id"], action="ATTACK", result="SUCCESS", team="home",
    )

    body = (await client.get(f"/matches/{ctx['match']['id']}/stats")).json()
    setter = next(p for p in body["players"] if p["player_id"] == ctx["setter"]["id"])
    hitter = next(p for p in body["players"] if p["player_id"] == ctx["hitter"]["id"])
    assert setter["assists"] == 1
    assert hitter["kills"] == 1


async def test_no_assist_when_kill_is_other_team(client: AsyncClient) -> None:
    ctx = await _scaffold(client)
    rid = await _new_rally(client, ctx["match"]["id"])

    # Home setter, then away player kills — not an assist (different team).
    await _add_play(
        client, rid,
        seq=1, player_id=ctx["setter"]["id"], action="SET", result="CONTINUED", team="home",
    )
    await _add_play(
        client, rid,
        seq=2, player_id=ctx["enemy"]["id"], action="ATTACK", result="SUCCESS", team="away",
    )

    body = (await client.get(f"/matches/{ctx['match']['id']}/stats")).json()
    setter = next(p for p in body["players"] if p["player_id"] == ctx["setter"]["id"])
    assert setter["assists"] == 0


async def test_no_assist_when_set_not_immediately_before_kill(
    client: AsyncClient,
) -> None:
    ctx = await _scaffold(client)
    rid = await _new_rally(client, ctx["match"]["id"])

    # SET, then DIG, then KILL — the DIG breaks the immediate adjacency.
    await _add_play(
        client, rid,
        seq=1, player_id=ctx["setter"]["id"], action="SET", result="CONTINUED", team="home",
    )
    await _add_play(
        client, rid,
        seq=2, player_id=ctx["enemy"]["id"], action="DIG", result="CONTINUED", team="away",
    )
    await _add_play(
        client, rid,
        seq=3, player_id=ctx["hitter"]["id"], action="ATTACK", result="SUCCESS", team="home",
    )

    body = (await client.get(f"/matches/{ctx['match']['id']}/stats")).json()
    setter = next(p for p in body["players"] if p["player_id"] == ctx["setter"]["id"])
    assert setter["assists"] == 0


async def test_score_reflects_rally_point_won_by(client: AsyncClient) -> None:
    ctx = await _scaffold(client)
    mid = ctx["match"]["id"]

    for side in ("home", "home", "away"):
        rid = await _new_rally(client, mid, t=0)
        await client.patch(
            f"/rallies/{rid}", json={"end_time": 1.0, "point_won_by": side}
        )

    body = (await client.get(f"/matches/{mid}/stats")).json()
    assert body["home"]["score"] == 2
    assert body["away"]["score"] == 1


async def test_player_points_field(client: AsyncClient) -> None:
    """points = kills + aces + blocks per the brief."""
    ctx = await _scaffold(client)
    rid = await _new_rally(client, ctx["match"]["id"])
    await _add_play(
        client, rid,
        seq=1, player_id=ctx["hitter"]["id"], action="ATTACK", result="SUCCESS", team="home",
    )
    await _add_play(
        client, rid,
        seq=2, player_id=ctx["hitter"]["id"], action="BLOCK", result="SUCCESS", team="home",
    )

    body = (await client.get(f"/matches/{ctx['match']['id']}/stats")).json()
    hitter = next(p for p in body["players"] if p["player_id"] == ctx["hitter"]["id"])
    assert hitter["kills"] == 1
    assert hitter["blocks"] == 1
    assert hitter["points"] == 2
