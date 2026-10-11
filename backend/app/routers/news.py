# SPDX-License-Identifier: Apache-2.0
"""News & updates: serves the scheduler-refreshed snapshot; never calls sources."""
from fastapi import APIRouter

from ..services.news_feed import news_feed

router = APIRouter(prefix="/api/news", tags=["news"])


@router.get("")
async def get_news():
    """Items newest first (undated last), plus per-source status and last check time."""
    return news_feed.snapshot()
