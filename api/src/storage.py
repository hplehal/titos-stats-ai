"""Cloudflare R2 client + presign helpers.

Lazy-initialized so unit tests that don't hit R2 don't need credentials.
Raises a clear RuntimeError on first use if R2 env is incomplete.
"""

from functools import lru_cache

import boto3
from botocore.client import BaseClient
from botocore.config import Config

from .config import get_settings


@lru_cache
def _client() -> BaseClient:
    s = get_settings()
    if not (s.R2_ACCOUNT_ID and s.R2_ACCESS_KEY_ID and s.R2_SECRET_ACCESS_KEY):
        raise RuntimeError(
            "R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID "
            "and R2_SECRET_ACCESS_KEY in the environment."
        )
    endpoint = f"https://{s.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=s.R2_ACCESS_KEY_ID,
        aws_secret_access_key=s.R2_SECRET_ACCESS_KEY,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def presigned_put_url(key: str, content_type: str, ttl: int = 3600) -> str:
    s = get_settings()
    return _client().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": s.R2_BUCKET,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=ttl,
        HttpMethod="PUT",
    )


def presigned_get_url(key: str, ttl: int = 3600) -> str:
    s = get_settings()
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": s.R2_BUCKET, "Key": key},
        ExpiresIn=ttl,
    )
