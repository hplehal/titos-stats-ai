from httpx import AsyncClient


async def test_create_season_team_players_full_flow(client: AsyncClient) -> None:
    r = await client.post("/seasons", json={"name": "Sunday Mens S7"})
    assert r.status_code == 201, r.text
    season = r.json()
    assert season["name"] == "Sunday Mens S7"
    assert isinstance(season["id"], str) and len(season["id"]) == 24

    r = await client.post(
        "/teams",
        json={
            "name": "Tito Sharks",
            "season_id": season["id"],
            "current_tier": 3,
        },
    )
    assert r.status_code == 201, r.text
    team = r.json()
    assert team["current_tier"] == 3

    r = await client.post(
        "/players",
        json={"name": "Smith", "team_id": team["id"], "jersey_number": 7},
    )
    assert r.status_code == 201, r.text
    p1 = r.json()

    r = await client.post(
        "/players",
        json={"name": "Jones", "team_id": team["id"], "jersey_number": 8},
    )
    assert r.status_code == 201, r.text

    r = await client.get(f"/teams/{team['id']}/players")
    assert r.status_code == 200
    assert len(r.json()) == 2

    r = await client.get(f"/seasons/{season['id']}")
    assert r.status_code == 200
    body = r.json()
    assert len(body["teams"]) == 1
    assert body["teams"][0]["name"] == "Tito Sharks"

    r = await client.delete(f"/players/{p1['id']}")
    assert r.status_code == 204

    r = await client.get(f"/teams/{team['id']}/players")
    assert len(r.json()) == 1


async def test_jersey_uniqueness_within_team(client: AsyncClient) -> None:
    r = await client.post("/seasons", json={"name": "S1"})
    season = r.json()
    r = await client.post(
        "/teams", json={"name": "T", "season_id": season["id"]}
    )
    team = r.json()

    r = await client.post(
        "/players",
        json={"name": "A", "team_id": team["id"], "jersey_number": 5},
    )
    assert r.status_code == 201

    r = await client.post(
        "/players",
        json={"name": "B", "team_id": team["id"], "jersey_number": 5},
    )
    assert r.status_code == 409
    body = r.json()
    assert body["constraint"] == "uq_players_team_jersey"
    assert "unique" in body["detail"].lower()


async def test_jersey_required_on_create(client: AsyncClient) -> None:
    r = await client.post("/seasons", json={"name": "S1"})
    season = r.json()
    r = await client.post(
        "/teams", json={"name": "T", "season_id": season["id"]}
    )
    team = r.json()

    r = await client.post(
        "/players", json={"name": "NoJersey", "team_id": team["id"]}
    )
    assert r.status_code == 422


async def test_jersey_out_of_range(client: AsyncClient) -> None:
    r = await client.post("/seasons", json={"name": "S1"})
    season = r.json()
    r = await client.post(
        "/teams", json={"name": "T", "season_id": season["id"]}
    )
    team = r.json()

    # 3-digit jerseys are now valid (rec-league reality); 1000+ is not.
    ok = await client.post(
        "/players",
        json={"name": "Hi", "team_id": team["id"], "jersey_number": 245},
    )
    assert ok.status_code == 201, ok.text

    too_big = await client.post(
        "/players",
        json={"name": "Way Hi", "team_id": team["id"], "jersey_number": 1000},
    )
    assert too_big.status_code == 422


async def test_team_under_nonexistent_season_404(client: AsyncClient) -> None:
    r = await client.post(
        "/teams", json={"name": "Orphan", "season_id": "nonexistent"}
    )
    assert r.status_code == 404
