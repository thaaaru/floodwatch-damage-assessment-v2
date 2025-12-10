# SPDX-License-Identifier: Apache-2.0

"""
Early Warning System Router
Provides endpoints for flood early warning data using OpenWeatherMap One Call API 3.0
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
import logging

from ..config import get_settings
from ..services.openweathermap import get_openweathermap_service, OpenWeatherMapService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/early-warning", tags=["Early Warning"])

settings = get_settings()


def get_service() -> OpenWeatherMapService:
    """Get configured OpenWeatherMap service."""
    api_key = settings.openweathermap_api_key
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="OpenWeatherMap API key not configured"
        )
    return get_openweathermap_service(api_key)


@router.get("/")
async def get_early_warning_overview():
    """
    Get early warning overview for all districts.
    Returns risk levels and alert counts for quick overview.
    """
    try:
        service = get_service()
        data = await service.get_all_districts_early_warning()

        # Create summary statistics
        risk_counts = {"extreme": 0, "high": 0, "medium": 0, "low": 0}
        total_alerts = 0

        for district in data:
            risk_level = district.get("risk_level", "low")
            if risk_level in risk_counts:
                risk_counts[risk_level] += 1
            total_alerts += district.get("alert_count", 0)

        return {
            "summary": {
                "total_districts": len(data),
                "risk_distribution": risk_counts,
                "total_government_alerts": total_alerts,
                "districts_at_risk": risk_counts["extreme"] + risk_counts["high"],
            },
            "districts": data
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch early warning data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/district/{district}")
async def get_district_early_warning(district: str):
    """
    Get detailed early warning data for a specific district.
    Includes 48-hour hourly forecast and 8-day daily forecast.
    """
    try:
        service = get_service()
        data = await service.get_district_early_warning(district)
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch early warning for {district}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts")
async def get_all_alerts():
    """
    Get all active government weather alerts across Sri Lanka.
    """
    try:
        service = get_service()
        data = await service.get_all_districts_early_warning()

        all_alerts = []
        for district in data:
            for alert in district.get("alerts", []):
                all_alerts.append({
                    "district": district["district"],
                    **alert
                })

        # Sort by start time (most recent first)
        all_alerts.sort(key=lambda x: x.get("start", ""), reverse=True)

        return {
            "total_alerts": len(all_alerts),
            "alerts": all_alerts
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/high-risk")
async def get_high_risk_districts():
    """
    Get districts with high or extreme flood risk.
    """
    try:
        service = get_service()
        data = await service.get_all_districts_early_warning()

        high_risk = [
            d for d in data
            if d.get("risk_level") in ["high", "extreme"]
        ]

        return {
            "count": len(high_risk),
            "districts": high_risk
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch high risk districts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/forecast/daily")
async def get_daily_forecast(
    days: int = Query(default=8, ge=1, le=8, description="Number of days to forecast")
):
    """
    Get daily forecast summary for all districts.
    """
    try:
        service = get_service()
        data = await service.get_all_districts_early_warning()

        forecast_by_day = {}

        for district in data:
            for day in district.get("daily_forecast", [])[:days]:
                date = day.get("date")
                if date not in forecast_by_day:
                    forecast_by_day[date] = {
                        "date": date,
                        "day_name": day.get("day_name"),
                        "districts": []
                    }
                forecast_by_day[date]["districts"].append({
                    "district": district["district"],
                    "temp_max_c": day.get("temp_max_c"),
                    "temp_min_c": day.get("temp_min_c"),
                    "rain_mm": day.get("rain_mm"),
                    "pop": day.get("pop"),
                    "weather": day.get("weather"),
                    "alert_level": day.get("alert_level"),
                    "summary": day.get("summary"),
                })

        # Sort by date
        forecast_list = sorted(forecast_by_day.values(), key=lambda x: x["date"])

        return {
            "days": len(forecast_list),
            "forecast": forecast_list
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch daily forecast: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/forecast/hourly/{district}")
async def get_hourly_forecast(
    district: str,
    hours: int = Query(default=48, ge=1, le=48, description="Number of hours to forecast")
):
    """
    Get hourly forecast for a specific district.
    """
    try:
        service = get_service()
        data = await service.get_district_early_warning(district)

        hourly = data.get("hourly_forecast", [])[:hours]

        return {
            "district": district,
            "hours": len(hourly),
            "forecast": hourly
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch hourly forecast for {district}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
