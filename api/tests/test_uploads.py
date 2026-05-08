"""Upload endpoint tests. Real R2 calls are stubbed via monkeypatch so the
suite runs without R2 credentials.
"""

import pytest
from httpx import AsyncClient


@pytest.fixture(autouse=True)
def _stub_presign(monkeypatch):
    # Avoid hitting R2 during tests; return a deterministic fake URL.
    from src import storage
    from src.routers import uploads as uploads_router

    def fake_presigned_put_url(key: str, content_type: str, ttl: int = 3600) -> str:
        return f"https://fake.r2/{key}?ct={content_type}&ttl={ttl}"

    monkeypatch.setattr(storage, "presigned_put_url", fake_presigned_put_url)
    monkeypatch.setattr(uploads_router, "presigned_put_url", fake_presigned_put_url)


async def test_presign_rejects_non_mp4(client: AsyncClient) -> None:
    r = await client.post(
        "/uploads/presign",
        json={"filename": "test.mov", "content_type": "video/quicktime"},
    )
    assert r.status_code == 422


async def test_presign_returns_url_and_key_for_mp4(client: AsyncClient) -> None:
    r = await client.post(
        "/uploads/presign",
        json={"filename": "match.mp4", "content_type": "video/mp4"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["key"].startswith("matches/")
    assert body["key"].endswith("/match.mp4")
    assert "fake.r2" in body["upload_url"]


async def test_presign_strips_path_traversal(client: AsyncClient) -> None:
    r = await client.post(
        "/uploads/presign",
        json={
            "filename": "../../etc/passwd.mp4",
            "content_type": "video/mp4",
        },
    )
    assert r.status_code == 200
    key = r.json()["key"]
    # Filename portion should not contain `..` or directory separators.
    fname = key.rsplit("/", 1)[-1]
    assert ".." not in fname
    assert "/" not in fname


async def test_presign_requires_api_key(client: AsyncClient) -> None:
    # Strip auth and confirm gate fires (mutation endpoint).
    no_auth_client = AsyncClient(
        transport=client._transport, base_url="http://test"
    )
    r = await no_auth_client.post(
        "/uploads/presign",
        json={"filename": "test.mp4", "content_type": "video/mp4"},
    )
    await no_auth_client.aclose()
    assert r.status_code == 401
