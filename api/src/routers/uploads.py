import re

from cuid2 import Cuid
from fastapi import APIRouter, HTTPException, status

from .. import schemas
from ..storage import presigned_put_url


router = APIRouter(prefix="/uploads", tags=["uploads"])

_cuid = Cuid(length=24)
_ALLOWED_CONTENT_TYPES = frozenset({"video/mp4"})
_FILENAME_SAFE_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename(name: str) -> str:
    # Drop directory components (defeat path traversal)
    base = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    cleaned = _FILENAME_SAFE_RE.sub("_", base)
    if not cleaned or cleaned in (".", ".."):
        cleaned = "video.mp4"
    return cleaned[:120]


@router.post("/presign", response_model=schemas.PresignResponse)
async def presign(payload: schemas.PresignRequest) -> schemas.PresignResponse:
    if payload.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Unsupported content_type. Allowed: {sorted(_ALLOWED_CONTENT_TYPES)}",
        )
    key = f"matches/{_cuid.generate()}/{_safe_filename(payload.filename)}"
    upload_url = presigned_put_url(key, payload.content_type)
    return schemas.PresignResponse(upload_url=upload_url, key=key)
