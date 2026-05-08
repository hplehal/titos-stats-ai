import logging
import secrets
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings


SETTINGS = get_settings()
logger = logging.getLogger("titos.api")

_GUARDED_METHODS = frozenset({"POST", "PATCH", "PUT", "DELETE"})


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


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
