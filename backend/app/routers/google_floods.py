# SPDX-License-Identifier: Apache-2.0

"""
Google Floods Router

Exposes Google Flood Hub data for Sri Lanka. All upstream calls are routed
through GoogleFloodsService (single-flight + cache + budget). The frontend
should never call Google directly: keeping the API key server-side avoids
billing exposure and lets us throttle properly.
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException

from ..config import get_settings
from ..services.google_floods import GoogleFloodsService, get_google_floods_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/google-floods", tags=["Google Floods"])

settings = get_settings()


def get_service() -> GoogleFloodsService:
    key = settings.google_floods_api_key
    if not key:
        raise HTTPException(
            status_code=503,
            detail="Google Floods API key not configured. Set GOOGLE_FLOODS_API_KEY in the backend .env.",
        )
    return get_google_floods_service(key)


@router.get("/gauges")
async def list_gauges():
    """
    All Sri Lanka flood gauges with current status, location, and thresholds.

    Cached upstream for ~30 minutes. Safe to call frequently from the frontend;
    repeated hits within the TTL are served from memory without an API call.
    """
    try:
        service = get_service()
        return await service.get_all_gauges_enriched()
    except HTTPException:
        raise
    except Exception as e:
        logger.error("google-floods/gauges failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/gauges/{gauge_id}/forecast")
async def gauge_forecast(gauge_id: str):
    """
    Forecast trend for a single gauge. Cached per gauge for ~30 minutes.
    """
    try:
        service = get_service()
        data = await service.get_gauge_forecast(gauge_id)
        if not data:
            raise HTTPException(status_code=404, detail=f"No forecast available for gauge {gauge_id}")
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error("google-floods/gauges/%s/forecast failed: %s", gauge_id, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def service_status():
    """
    Operational status: cache freshness + today's API call usage.
    """
    service = get_service()
    remaining = service._budget_remaining()
    cache_age_min: Optional[float] = None
    if service._area_cache_time:
        from datetime import datetime
        cache_age_min = round(
            (datetime.utcnow() - service._area_cache_time).total_seconds() / 60,
            1,
        )
    return {
        "cache": {
            "area_cached": bool(service._area_cache),
            "area_age_minutes": cache_age_min,
            "area_ttl_minutes": service.AREA_CACHE_MINUTES,
            "gauge_meta_entries": len(service._gauge_meta_cache),
            "forecast_entries": len(service._forecast_cache),
            "status_entries": len(service._status_cache),
        },
        "rate_limit": {
            "calls_today": service._calls_today,
            "daily_budget": service.DAILY_CALL_BUDGET,
            "remaining": remaining,
            "day_utc": service._calls_day.isoformat(),
        },
    }
