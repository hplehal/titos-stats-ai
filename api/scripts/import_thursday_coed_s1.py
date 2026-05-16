#!/usr/bin/env python3
"""One-shot, idempotent import of Thursday COED Season 1 against the live API.

Creates one season, 12 teams (with current_tier set), and ~70 players. Anything
that already exists by name is skipped; re-running is a no-op.

Usage:
    TITOS_API_KEY=<your-prod-key> uv run python scripts/import_thursday_coed_s1.py

Without the env var the script prompts for the key (no echo). Override the
target base URL with TITOS_API_BASE for a dev-machine smoke test.
"""

from __future__ import annotations

import os
import sys
from getpass import getpass

import httpx


API_BASE = os.environ.get("TITOS_API_BASE", "https://api.titoscourts.com")
SEASON_NAME = "Thursday COED Season 1"

# (team_name, current_tier, [(player_name, jersey_number), ...])
TEAMS: list[tuple[str, int, list[tuple[str, int]]]] = [
    # ── Tier 1 ─────────────────────────────────────────────────────────
    ("Tomo's Lizards", 1, [
        ("Lucas Lin", 8),
        ("Annette Huang", 5),
        ("Yoga Wu", 16),
        ("Karolina", 14),
        ("Tomo", 31),
        ("Pedro", 12),
    ]),
    ("Kwispy Kreme", 1, [
        ("Kevin L", 9),
        ("Joanna", 15),
        ("Denisse", 6),
        ("Paulo", 13),
        ("Cookies & Kreme", 8),
        ("Steph", 7),
    ]),
    ("House of Hops", 1, [
        ("Jadee Squires", 13),
        ("Sharina Rodriguez", 93),
        ("Long Nguyen", 14),
        ("Matthew Yu", 8),
        ("Harvir Thind", 7),
        ("Ryan Dang", 24),
    ]),
    # ── Tier 2 ─────────────────────────────────────────────────────────
    ("Snorlax Six", 2, [
        ("Dominic Medalle", 1),
        ("Andrea Enriquez", 11),
        ("Robin De Los Santos", 245),  # NOTE: API constrains jersey to 0-99
        ("Najib Gharibyar", 6),
        ("Aizen Manalo", 7),
        ("Katrina Medalle", 15),
        ("Jayzelle Abellanosa", 2),
    ]),
    ("Shear Luck", 2, [
        ("Chris Fernandes", 11),
        ("Jay Chalasani", 67),
        ("Ana Wu", 14),
        ("Amanda Dam", 4),
        ("Jacob Song", 8),
        ("Wendy Huang", 7),
    ]),
    ("Vollibee", 2, [
        ("Jasmine Obra", 18),
        ("Janine Macato", 3),
        ("Marco Melliza", 13),
        ("Matthew Melliza", 1),
        ("Aaron Machado", 32),
        ("Josh Villegas", 14),
    ]),
    # ── Tier 3 ─────────────────────────────────────────────────────────
    ("Banana Bandits", 3, [
        ("Receno", 86),
        ("Atiq", 18),
        ("Gioia", 4),
        ("Bao", 16),
        ("Dee", 8),
        ("Gaspar", 12),
    ]),
    ("ABGs", 3, [
        ("Ethan Santiago", 9),
        ("Trinity Tran", 18),
        ("Kyle Lacson", 2),
        ("Daniel Trojan", 25),
        ("Daniel Limbaga", 17),
        ("Tiffany Chin", 24),
        ("Ilagan", 10),
    ]),
    ("Pinoy Pancakes", 3, [
        ("John Gerongco", 12),
        ("Carl Gerongco", 3),
        ("Alyssa Gerongco", 7),
        ("Dylan Gerongco", 30),
        ("Clyde Sanchez", 0),
        ("Andrew Andal", 9),
        ("Carolyn Tran", 5),
        ("Oliver Galang", 1),
    ]),
    # ── Tier 4 ─────────────────────────────────────────────────────────
    ("The Knight Owls", 4, [
        ("Jasper", 22),
        ("Hrithik", 7),
        ("Maggie", 11),
        ("Sana", 15),
        ("Denis", 67),
        ("The_Sairus", 10),
    ]),
    ("Spike Me Daddy", 4, [
        ("Aaron Alvarado", 17),
        ("Jim Ochinang", 6),
        ("Patricia Contreras", 10),
        ("Yessica May", 12),
        ("Hana Nouri", 8),
        ("Matthew Dalgado", 88),
    ]),
    ("Recovering Crashouts", 4, [
        ("Maive Batalla", 1),
        ("Gabe Baluyot", 0),
        ("Dom Tran", 17),
        ("Mark Machado", 4),
        ("Jovi Nguyen", 12),
        ("Ruth Baluyot", 7),
    ]),
]


def ensure_season(client: httpx.Client) -> tuple[str, bool]:
    r = client.get("/seasons")
    r.raise_for_status()
    for s in r.json():
        if s["name"] == SEASON_NAME:
            return s["id"], False
    r = client.post("/seasons", json={"name": SEASON_NAME})
    r.raise_for_status()
    return r.json()["id"], True


def ensure_team(
    client: httpx.Client, season_id: str, name: str, tier: int
) -> tuple[str, bool]:
    r = client.get(f"/seasons/{season_id}/teams")
    r.raise_for_status()
    for t in r.json():
        if t["name"] == name:
            return t["id"], False
    r = client.post(
        "/teams",
        json={"name": name, "season_id": season_id, "current_tier": tier},
    )
    r.raise_for_status()
    return r.json()["id"], True


def ensure_player(
    client: httpx.Client, team_id: str, name: str, jersey: int
) -> tuple[bool, str | None]:
    """Returns (created, error_msg). Idempotent by player name within team."""
    r = client.get(f"/teams/{team_id}/players")
    r.raise_for_status()
    for p in r.json():
        if p["name"] == name:
            return False, None
    r = client.post(
        "/players",
        json={"name": name, "team_id": team_id, "jersey_number": jersey},
    )
    if r.is_success:
        return True, None
    return False, f"HTTP {r.status_code}: {r.text[:200]}"


def main() -> int:
    key = os.environ.get("TITOS_API_KEY") or getpass("TITOS_API_KEY: ")
    if not key:
        print("missing TITOS_API_KEY", file=sys.stderr)
        return 2

    print(f"→ Target: {API_BASE}")

    counts = {"season": 0, "team": 0, "player": 0}
    failures: list[str] = []

    with httpx.Client(
        base_url=API_BASE,
        headers={"X-API-Key": key, "Content-Type": "application/json"},
        timeout=15.0,
    ) as client:
        try:
            season_id, season_created = ensure_season(client)
        except httpx.HTTPStatusError as e:
            print(
                f"✗ Could not create/find season: HTTP {e.response.status_code}: {e.response.text[:200]}",
                file=sys.stderr,
            )
            return 1
        if season_created:
            counts["season"] = 1

        for team_name, tier, roster in TEAMS:
            try:
                team_id, team_created = ensure_team(
                    client, season_id, team_name, tier
                )
            except httpx.HTTPStatusError as e:
                failures.append(
                    f"team '{team_name}': HTTP {e.response.status_code}: "
                    f"{e.response.text[:200]}"
                )
                continue
            if team_created:
                counts["team"] += 1

            for player_name, jersey in roster:
                created, err = ensure_player(client, team_id, player_name, jersey)
                if err:
                    failures.append(
                        f"player '{player_name}' #{jersey} on '{team_name}': {err}"
                    )
                elif created:
                    counts["player"] += 1

    print(
        f"\nCreated {counts['season']} season, "
        f"{counts['team']} teams, "
        f"{counts['player']} players."
    )
    if (counts["season"], counts["team"], counts["player"]) == (0, 0, 0) and not failures:
        print("(Everything already existed — re-run was a no-op.)")
    if failures:
        print(f"\n⚠ {len(failures)} failure(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
