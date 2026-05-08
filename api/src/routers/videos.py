from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from .. import models, schemas
from ..db import get_db
from ..storage import presigned_get_url


router = APIRouter(prefix="/videos", tags=["videos"])

_GET_URL_TTL_SECONDS = 3600


@router.get("/{video_id}/url", response_model=schemas.VideoUrlResponse)
async def get_video_url(
    video_id: str,
    db: AsyncSession = Depends(get_db),
) -> schemas.VideoUrlResponse:
    video = await db.get(models.VideoAsset, video_id)
    if video is None:
        raise HTTPException(404, "Video not found.")
    url = presigned_get_url(video.storage_url, ttl=_GET_URL_TTL_SECONDS)
    return schemas.VideoUrlResponse(
        url=url, expires_in_seconds=_GET_URL_TTL_SECONDS
    )
