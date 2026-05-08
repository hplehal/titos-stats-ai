"""Test bootstrap. Uses a separate `titos_test` DB so tests can't trash dev data.

Two pieces matter:
1. Env vars (DATABASE_URL, API_KEY) are set BEFORE any `src.*` import so
   Settings picks them up.
2. Tests use a per-test `NullPool` engine (no connection reuse across event
   loops) and override the `get_db` dependency. The src.db engine is never
   used in tests, sidestepping cross-loop asyncpg cleanup errors.
"""

import asyncio
import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://titos:devpw@localhost:5432/titos_test",
)
os.environ.setdefault("API_KEY", "test-api-key-only-for-tests")

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool  # noqa: E402


_DB_URL = os.environ["DATABASE_URL"]
_TABLES = "seasons, teams, players, matches, video_assets, rallies, plays"


async def _ensure_test_db_and_schema() -> None:
    admin = create_async_engine(
        "postgresql+asyncpg://titos:devpw@localhost:5432/postgres",
        isolation_level="AUTOCOMMIT",
        poolclass=NullPool,
    )
    try:
        async with admin.connect() as conn:
            res = await conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = 'titos_test'")
            )
            if not res.scalar():
                await conn.execute(text("CREATE DATABASE titos_test"))
    finally:
        await admin.dispose()

    # Late import: env vars must be in place before src.config evaluates.
    from src.db import Base
    from src import models  # noqa: F401  (register all mappers)

    eng = create_async_engine(_DB_URL, poolclass=NullPool)
    try:
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    finally:
        await eng.dispose()


def pytest_configure(config) -> None:  # noqa: ARG001
    asyncio.run(_ensure_test_db_and_schema())


@pytest_asyncio.fixture
async def test_engine():
    eng = create_async_engine(_DB_URL, poolclass=NullPool)
    try:
        yield eng
    finally:
        await eng.dispose()


@pytest_asyncio.fixture(autouse=True)
async def clean_tables(test_engine):
    yield
    async with test_engine.begin() as conn:
        await conn.execute(
            text(f"TRUNCATE TABLE {_TABLES} RESTART IDENTITY CASCADE")
        )


@pytest_asyncio.fixture
async def client(test_engine):
    from src.db import get_db
    from src.main import app

    Session = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def override_get_db():
        async with Session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    headers = {"X-API-Key": os.environ["API_KEY"]}
    try:
        async with AsyncClient(
            transport=transport, base_url="http://test", headers=headers
        ) as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()
