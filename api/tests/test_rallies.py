from datetime import datetime, timezone

from httpx import AsyncClient


async def _make_match(client: AsyncClient) -> str:
    s = (await client.post("/seasons", json={"name": "S"})).json()
    h = (
        await client.post("/teams", json={"name": "Sharks", "season_id": s["id"]})
    ).json()
    a = (
        await client.post("/teams", json={"name": "Bolts", "season_id": s["id"]})
    ).json()
    m = (
        await client.post(
            "/matches",
            json={
                "season_id": s["id"],
                "home_team_id": h["id"],
                "away_team_id": a["id"],
                "played_at": datetime(
                    2026, 5, 15, 20, tzinfo=timezone.utc
                ).isoformat(),
                "video_key": "matches/x/v.mp4",
            },
        )
    ).json()
    return m["id"]


async def test_create_then_end_rally(client: AsyncClient) -> None:
    match_id = await _make_match(client)

    r = await client.post(
        f"/matches/{match_id}/rallies", json={"start_time": 12.5}
    )
    assert r.status_code == 201, r.text
    rally = r.json()
    assert rally["start_time"] == 12.5
    assert rally["end_time"] is None
    assert rally["point_won_by"] is None
    assert rally["plays"] == []

    r = await client.patch(
        f"/rallies/{rally['id']}",
        json={"end_time": 30.0, "point_won_by": "home"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["end_time"] == 30.0
    assert body["point_won_by"] == "home"


async def test_list_rallies_ordered_by_start_time(client: AsyncClient) -> None:
    match_id = await _make_match(client)
    for t in [40.0, 10.0, 25.0]:
        await client.post(
            f"/matches/{match_id}/rallies", json={"start_time": t}
        )
    r = await client.get(f"/matches/{match_id}/rallies")
    assert r.status_code == 200
    starts = [x["start_time"] for x in r.json()]
    assert starts == [10.0, 25.0, 40.0]


async def test_end_time_before_start_time_rejected(client: AsyncClient) -> None:
    match_id = await _make_match(client)
    rally = (
        await client.post(
            f"/matches/{match_id}/rallies", json={"start_time": 30.0}
        )
    ).json()
    r = await client.patch(
        f"/rallies/{rally['id']}", json={"end_time": 10.0}
    )
    assert r.status_code == 409
    assert r.json()["constraint"] == "ck_rallies_time_order"


async def test_invalid_point_won_by_pydantic_rejects(client: AsyncClient) -> None:
    match_id = await _make_match(client)
    rally = (
        await client.post(
            f"/matches/{match_id}/rallies", json={"start_time": 30.0}
        )
    ).json()
    r = await client.patch(
        f"/rallies/{rally['id']}", json={"point_won_by": "neither"}
    )
    assert r.status_code == 422


async def test_delete_rally(client: AsyncClient) -> None:
    match_id = await _make_match(client)
    rally = (
        await client.post(
            f"/matches/{match_id}/rallies", json={"start_time": 5.0}
        )
    ).json()
    r = await client.delete(f"/rallies/{rally['id']}")
    assert r.status_code == 204

    r = await client.get(f"/matches/{match_id}/rallies")
    assert r.json() == []


async def test_create_rally_unknown_match_404(client: AsyncClient) -> None:
    r = await client.post(
        "/matches/nonexistent/rallies", json={"start_time": 0.0}
    )
    assert r.status_code == 404
