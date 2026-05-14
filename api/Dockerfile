# syntax=docker/dockerfile:1.7

# ─── Builder ────────────────────────────────────────────────────────────
# uv image gives us a pinned Python 3.12 + uv toolchain. We sync deps into
# /app/.venv, then copy that venv into a slim runtime stage.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# Cache layer: deps first (only re-runs when pyproject.toml / uv.lock change).
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# Now copy the project itself and finalize the venv.
COPY src ./src
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev


# ─── Runtime ────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# ffmpeg for future video processing (Phase 2+); tini reaps zombies and
# forwards SIGTERM cleanly so docker stop returns within the grace period.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/src /app/src
COPY --from=builder /app/alembic /app/alembic
COPY --from=builder /app/alembic.ini /app/alembic.ini

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

EXPOSE 8000

# Run migrations on every container start, then serve. Alembic is idempotent
# (no-ops when DB is already at head), so this is safe across redeploys.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "alembic upgrade head && uvicorn src.main:app --host 0.0.0.0 --port 8000"]
