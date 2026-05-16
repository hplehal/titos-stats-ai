import logging
import secrets
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from .config import get_settings
from .routers import (
    matches,
    players,
    plays,
    rallies,
    seasons,
    teams,
    uploads,
    videos,
)


SETTINGS = get_settings()
logger = logging.getLogger("titos.api")

if not SETTINGS.API_KEY:
    logger.warning(
        "API_KEY is not set — mutating endpoints (POST/PATCH/PUT/DELETE) will "
        "return 503 until it is configured. Set API_KEY in the environment or "
        ".env.local."
    )

_GUARDED_METHODS = frozenset({"POST", "PATCH", "PUT", "DELETE"})

# Map known DB constraint names to user-facing 409 messages. Anything not in
# this map falls back to a generic message; the constraint name is always
# included in the response for debuggability.
_CONSTRAINT_MESSAGES: dict[str, str] = {
    "uq_players_team_jersey": "Jersey number must be unique within a team.",
    "ck_players_jersey_range": "Jersey number must be between 0 and 999.",
    "ck_teams_current_tier_range": "Team tier must be between 1 and 8.",
    "ck_matches_tier_range": "Match tier must be between 1 and 8.",
    "ck_matches_distinct_teams": "Home and away teams must differ.",
    "ck_rallies_point_won_by": "point_won_by must be 'home' or 'away'.",
    "ck_rallies_time_order": "Rally end_time must be >= start_time.",
    "ck_video_assets_kind": "Video kind must be 'raw', 'preview', or 'clip'.",
    "ck_plays_team": "Play team must be 'home' or 'away'.",
    "ck_plays_ai_confidence_range": "ai_confidence must be between 0 and 1.",
    "uq_plays_rally_sequence": "Plays in a rally must have unique sequence numbers.",
}


app = FastAPI(
    title="Tito's Stats API",
    version="0.1.0",
    description="Volleyball stat tracker — Phase 1 manual MVP.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=SETTINGS.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def api_key_gate(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    # Phase 1 auth: shared per-env secret gates mutations only; reads stay open.
    if request.method.upper() not in _GUARDED_METHODS:
        return await call_next(request)

    expected = SETTINGS.API_KEY
    if not expected:
        # Fail closed: server misconfigured, not merely unauthorized.
        logger.warning(
            "Mutation rejected: API_KEY not configured (path=%s)", request.url.path
        )
        return JSONResponse(
            status_code=503,
            content={"detail": "API_KEY is not configured on the server."},
        )

    presented = request.headers.get("X-API-Key", "")
    if not secrets.compare_digest(presented, expected):
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid or missing X-API-Key."},
        )

    return await call_next(request)


def _extract_constraint_name(exc: IntegrityError) -> str | None:
    # The SQLAlchemy asyncpg dialect wraps the asyncpg exception in a
    # dialect-level IntegrityError; the real asyncpg exception (carrying
    # constraint_name) is at exc.orig.__cause__. Fall back to exc.orig in case
    # a different driver is ever swapped in.
    orig = exc.orig
    cause = getattr(orig, "__cause__", None)
    if cause is not None:
        name = getattr(cause, "constraint_name", None)
        if name:
            return name
    return getattr(orig, "constraint_name", None)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(
    request: Request, exc: IntegrityError
) -> JSONResponse:
    constraint = _extract_constraint_name(exc)
    detail = _CONSTRAINT_MESSAGES.get(
        constraint or "", "Database integrity violation."
    )
    return JSONResponse(
        status_code=409,
        content={"detail": detail, "constraint": constraint},
    )


app.include_router(seasons.router)
app.include_router(teams.router)
app.include_router(players.router)
app.include_router(matches.router)
app.include_router(uploads.router)
app.include_router(videos.router)
app.include_router(rallies.router)
app.include_router(plays.router)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
