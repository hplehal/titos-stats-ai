from datetime import datetime, timezone

from httpx import AsyncClient


async def _setup(client: AsyncClient) -> dict:
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
    p1 = (
        await client.post(
            "/players",
            json={"name": "Smith", "team_id": home["id"], "jersey_number": 7},
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
    rally = (
        await client.post(f"/matches/{m['id']}/rallies", json={"start_time": 0})
    ).json()
    return {"home": home, "away": away, "player": p1, "match": m, "rally": rally}


async def test_create_and_list_plays(client: AsyncClient) -> None:
    ctx = await _setup(client)
    rid = ctx["rally"]["id"]

    r = await client.post(
        f"/rallies/{rid}/plays",
        json={
            "player_id": ctx["player"]["id"],
            "action": "ATTACK",
            "result": "SUCCESS",
            "sequence": 1,
            "team": "home",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["action"] == "ATTACK"
    assert body["result"] == "SUCCESS"
    assert body["sequence"] == 1

    r = await client.get(f"/rallies/{rid}/plays")
    assert r.status_code == 200
    assert len(r.json()) == 1


async def test_play_sequence_repack_on_delete(client: AsyncClient) -> None:
    ctx = await _setup(client)
    rid = ctx["rally"]["id"]

    ids = []
    for seq in (1, 2, 3):
        body = (
            await client.post(
                f"/rallies/{rid}/plays",
                json={
                    "player_id": ctx["player"]["id"],
                    "action": "ATTACK",
                    "result": "CONTINUED",
                    "sequence": seq,
                    "team": "home",
                },
            )
        ).json()
        ids.append(body["id"])

    # Delete the middle play.
    r = await client.delete(f"/plays/{ids[1]}")
    assert r.status_code == 204

    listed = (await client.get(f"/rallies/{rid}/plays")).json()
    seqs = [p["sequence"] for p in listed]
    assert seqs == [1, 2], seqs


async def test_patch_play(client: AsyncClient) -> None:
    ctx = await _setup(client)
    rid = ctx["rally"]["id"]
    play = (
        await client.post(
            f"/rallies/{rid}/plays",
            json={
                "action": "PASS",
                "result": "ERROR",
                "sequence": 1,
                "team": "home",
            },
        )
    ).json()

    r = await client.patch(
        f"/plays/{play['id']}",
        json={"player_id": ctx["player"]["id"], "result": "SUCCESS"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["player_id"] == ctx["player"]["id"]
    assert body["result"] == "SUCCESS"


async def test_create_play_unknown_rally_404(client: AsyncClient) -> None:
    r = await client.post(
        "/rallies/nonexistent/plays",
        json={
            "action": "SERVE",
            "result": "SUCCESS",
            "sequence": 1,
            "team": "home",
        },
    )
    assert r.status_code == 404
