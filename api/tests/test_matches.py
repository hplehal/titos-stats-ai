from datetime import datetime, timezone

from httpx import AsyncClient


async def _make_season_two_teams(client: AsyncClient) -> tuple[dict, dict, dict]:
    s = (await client.post("/seasons", json={"name": "S1"})).json()
    h = (
        await client.post(
            "/teams", json={"name": "Sharks", "season_id": s["id"]}
        )
    ).json()
    a = (
        await client.post(
            "/teams", json={"name": "Bolts", "season_id": s["id"]}
        )
    ).json()
    return s, h, a


def _played_at_iso(year: int = 2026, month: int = 5, day: int = 15) -> str:
    return datetime(year, month, day, 20, 0, 0, tzinfo=timezone.utc).isoformat()


async def test_create_match_happy_path(client: AsyncClient) -> None:
    season, home, away = await _make_season_two_teams(client)

    r = await client.post(
        "/matches",
        json={
            "season_id": season["id"],
            "home_team_id": home["id"],
            "away_team_id": away["id"],
            "played_at": _played_at_iso(),
            "tier": 3,
            "video_key": "matches/abc123/test.mp4",
            "video_duration": 120.5,
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["tier"] == 3
    assert body["home_team"]["name"] == "Sharks"
    assert body["away_team"]["name"] == "Bolts"
    assert len(body["video_assets"]) == 1
    asset = body["video_assets"][0]
    assert asset["kind"] == "raw"
    assert asset["storage_url"] == "matches/abc123/test.mp4"
    assert asset["duration_seconds"] == 120.5


async def test_create_match_same_team_rejected(client: AsyncClient) -> None:
    season, home, _ = await _make_season_two_teams(client)
    r = await client.post(
        "/matches",
        json={
            "season_id": season["id"],
            "home_team_id": home["id"],
            "away_team_id": home["id"],
            "played_at": _played_at_iso(),
            "video_key": "matches/x/v.mp4",
        },
    )
    assert r.status_code == 422
    assert "differ" in r.json()["detail"].lower()


async def test_create_match_team_not_in_season(client: AsyncClient) -> None:
    s1, home, _ = await _make_season_two_teams(client)
    s2 = (await client.post("/seasons", json={"name": "S2"})).json()
    other = (
        await client.post(
            "/teams", json={"name": "Other", "season_id": s2["id"]}
        )
    ).json()

    r = await client.post(
        "/matches",
        json={
            "season_id": s1["id"],
            "home_team_id": home["id"],
            "away_team_id": other["id"],
            "played_at": _played_at_iso(),
            "video_key": "matches/x/v.mp4",
        },
    )
    assert r.status_code == 422
    assert "does not belong" in r.json()["detail"]


async def test_create_match_unknown_season(client: AsyncClient) -> None:
    r = await client.post(
        "/matches",
        json={
            "season_id": "nonexistent",
            "home_team_id": "x",
            "away_team_id": "y",
            "played_at": _played_at_iso(),
            "video_key": "k",
        },
    )
    assert r.status_code == 404


async def test_list_matches_filtered_by_season(client: AsyncClient) -> None:
    s, h, a = await _make_season_two_teams(client)
    for d in (15, 22):
        await client.post(
            "/matches",
            json={
                "season_id": s["id"],
                "home_team_id": h["id"],
                "away_team_id": a["id"],
                "played_at": _played_at_iso(day=d),
                "video_key": f"k_{d}",
            },
        )
    r = await client.get(f"/matches?season_id={s['id']}")
    assert r.status_code == 200
    assert len(r.json()) == 2


async def test_get_match_returns_nested_teams_and_video(client: AsyncClient) -> None:
    s, h, a = await _make_season_two_teams(client)
    created = (
        await client.post(
            "/matches",
            json={
                "season_id": s["id"],
                "home_team_id": h["id"],
                "away_team_id": a["id"],
                "played_at": _played_at_iso(),
                "tier": 5,
                "video_key": "matches/xyz/match.mp4",
            },
        )
    ).json()

    r = await client.get(f"/matches/{created['id']}")
    assert r.status_code == 200
    body = r.json()
    assert body["home_team"]["id"] == h["id"]
    assert body["away_team"]["id"] == a["id"]
    assert body["tier"] == 5
    assert len(body["video_assets"]) == 1


async def test_delete_match_cascades_video(client: AsyncClient) -> None:
    s, h, a = await _make_season_two_teams(client)
    created = (
        await client.post(
            "/matches",
            json={
                "season_id": s["id"],
                "home_team_id": h["id"],
                "away_team_id": a["id"],
                "played_at": _played_at_iso(),
                "video_key": "k",
            },
        )
    ).json()

    r = await client.delete(f"/matches/{created['id']}")
    assert r.status_code == 204

    r = await client.get(f"/matches/{created['id']}")
    assert r.status_code == 404
