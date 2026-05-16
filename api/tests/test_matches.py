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


# ── Phase 1.5: week_number + court ──────────────────────────────────────


async def test_create_match_with_week_tier_court(client: AsyncClient) -> None:
    s, h, a = await _make_season_two_teams(client)
    r = await client.post(
        "/matches",
        json={
            "season_id": s["id"],
            "home_team_id": h["id"],
            "away_team_id": a["id"],
            "played_at": _played_at_iso(),
            "tier": 1,
            "week_number": 2,
            "court": "Court 1",
            "video_key": "k",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["tier"] == 1
    assert body["week_number"] == 2
    assert body["court"] == "Court 1"

    got = (await client.get(f"/matches/{body['id']}")).json()
    assert got["week_number"] == 2
    assert got["court"] == "Court 1"


async def test_create_match_week_court_default_null(client: AsyncClient) -> None:
    """Both fields nullable so existing match-create paths keep working."""
    s, h, a = await _make_season_two_teams(client)
    r = await client.post(
        "/matches",
        json={
            "season_id": s["id"],
            "home_team_id": h["id"],
            "away_team_id": a["id"],
            "played_at": _played_at_iso(),
            "video_key": "k",
        },
    )
    body = r.json()
    assert body["week_number"] is None
    assert body["court"] is None


async def test_patch_match_week_court(client: AsyncClient) -> None:
    s, h, a = await _make_season_two_teams(client)
    match = (
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

    r = await client.patch(
        f"/matches/{match['id']}",
        json={"week_number": 3, "court": "Court 2", "tier": 4},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["week_number"] == 3
    assert body["court"] == "Court 2"
    assert body["tier"] == 4


async def test_patch_match_404(client: AsyncClient) -> None:
    r = await client.patch(
        "/matches/does-not-exist", json={"week_number": 1}
    )
    assert r.status_code == 404


async def test_week_court_appear_in_csv_export(client: AsyncClient) -> None:
    """plays.csv carries week_number + court as the final two columns."""
    import csv
    import io
    import zipfile

    s, h, a = await _make_season_two_teams(client)
    player = (
        await client.post(
            "/players",
            json={"name": "Hitter", "team_id": h["id"], "jersey_number": 7},
        )
    ).json()
    match = (
        await client.post(
            "/matches",
            json={
                "season_id": s["id"],
                "home_team_id": h["id"],
                "away_team_id": a["id"],
                "played_at": _played_at_iso(),
                "tier": 1,
                "week_number": 4,
                "court": "Court 2",
                "video_key": "k",
            },
        )
    ).json()
    rally = (
        await client.post(
            f"/matches/{match['id']}/rallies", json={"start_time": 0}
        )
    ).json()
    await client.post(
        f"/rallies/{rally['id']}/plays",
        json={
            "player_id": player["id"],
            "action": "ATTACK",
            "result": "SUCCESS",
            "sequence": 1,
            "play_time_seconds": 0,
            "team": "home",
        },
    )

    resp = await client.get(f"/matches/{match['id']}/export.zip")
    assert resp.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    plays = list(csv.DictReader(io.StringIO(zf.read("plays.csv").decode())))
    assert plays[0]["week_number"] == "4"
    assert plays[0]["court"] == "Court 2"
    header = list(plays[0].keys())
    assert header[-2:] == ["week_number", "court"]
