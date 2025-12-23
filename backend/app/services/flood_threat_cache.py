# SPDX-License-Identifier: Apache-2.0

"""
Flood Threat Cache Service

Pre-computes and caches flood threat assessment data to provide instant responses.
Background jobs refresh this cache periodically to keep data fresh without blocking requests.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import asyncio

from .weather_cache import weather_cache
from .irrigation_fetcher import irrigation_fetcher

logger = logging.getLogger(__name__)


class FloodThreatCache:
    """Cache for pre-computed flood threat assessment data."""

    def __init__(self):
        self._cached_data: Optional[Dict[str, Any]] = None
        self._last_updated: Optional[datetime] = None
        self._cache_duration_minutes = 30  # Cache valid for 30 minutes
        self._is_refreshing = False

    def is_cache_valid(self) -> bool:
        """Check if cached data is still valid."""
        if not self._cached_data or not self._last_updated:
            return False

        age = datetime.utcnow() - self._last_updated
        return age < timedelta(minutes=self._cache_duration_minutes)

    def get_cached_data(self) -> Optional[Dict[str, Any]]:
        """Get cached flood threat data if valid."""
        if self.is_cache_valid():
            return self._cached_data
        return None

    async def refresh_cache(self, force: bool = False) -> bool:
        """
        Refresh the flood threat cache.

        Args:
            force: Force refresh even if cache is valid

        Returns:
            True if refresh was successful, False otherwise
        """
        # Avoid concurrent refreshes
        if self._is_refreshing:
            logger.info("Flood threat cache refresh already in progress, skipping")
            return False

        if not force and self.is_cache_valid():
            logger.info("Flood threat cache still valid, skipping refresh")
            return True

        self._is_refreshing = True

        try:
            logger.info("Starting flood threat cache refresh...")

            # Ensure dependencies are fresh
            if not weather_cache.is_cache_valid():
                await weather_cache.refresh_cache()
            if not irrigation_fetcher.is_cache_valid():
                await irrigation_fetcher.fetch_water_levels()

            # Compute flood threat data
            threat_data = await self._compute_flood_threat()

            # Update cache
            self._cached_data = threat_data
            self._last_updated = datetime.utcnow()

            logger.info(
                f"Flood threat cache refreshed successfully. "
                f"National level: {threat_data.get('national_threat_level')}, "
                f"Score: {threat_data.get('national_threat_score')}"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to refresh flood threat cache: {e}", exc_info=True)
            return False
        finally:
            self._is_refreshing = False

    async def _compute_flood_threat(self) -> Dict[str, Any]:
        """Compute flood threat assessment data."""
        weather_data = weather_cache.get_all_weather(hours=24)
        forecast_data = weather_cache.get_all_forecast()
        river_data = irrigation_fetcher.get_cached_data()

        # Build district threat assessments
        district_threats = []

        for weather in weather_data:
            district = weather.get("district", "")
            if not district:
                continue

            threat = self._calculate_district_threat(
                district=district,
                weather=weather,
                forecast_data=forecast_data,
                river_data=river_data,
            )
            district_threats.append(threat)

        # Sort by threat score
        district_threats.sort(key=lambda x: x["threat_score"], reverse=True)

        # Calculate national threat level
        if district_threats:
            avg_score = sum(d["threat_score"] for d in district_threats) / len(district_threats)
            max_score = max(d["threat_score"] for d in district_threats)
            # National level is weighted toward max (emergencies matter more)
            national_score = (avg_score * 0.3) + (max_score * 0.7)
        else:
            national_score = 0

        # Determine national threat level
        if national_score >= 70:
            national_level = "CRITICAL"
        elif national_score >= 50:
            national_level = "HIGH"
        elif national_score >= 30:
            national_level = "MEDIUM"
        else:
            national_level = "LOW"

        # Summary stats
        critical_count = sum(1 for d in district_threats if d["threat_level"] == "CRITICAL")
        high_count = sum(1 for d in district_threats if d["threat_level"] == "HIGH")
        medium_count = sum(1 for d in district_threats if d["threat_level"] == "MEDIUM")

        # River summary
        river_summary = irrigation_fetcher.get_summary()

        return {
            "national_threat_level": national_level,
            "national_threat_score": round(national_score, 1),
            "summary": {
                "critical_districts": critical_count,
                "high_risk_districts": high_count,
                "medium_risk_districts": medium_count,
                "rivers_at_major_flood": river_summary.get("major_flood", 0),
                "rivers_at_minor_flood": river_summary.get("minor_flood", 0),
                "rivers_at_alert": river_summary.get("alert", 0),
            },
            "top_risk_districts": district_threats[:10],
            "all_districts": district_threats,
            "highest_risk_river": river_summary.get("highest_risk_station"),
            "analyzed_at": self._last_updated.isoformat() if self._last_updated else None,
        }

    def _calculate_district_threat(
        self,
        district: str,
        weather: dict,
        forecast_data: list,
        river_data: list,
    ) -> dict:
        """Calculate threat score for a single district."""
        factors = []

        # 1. RAINFALL SCORE (30%)
        rainfall_24h = weather.get("rainfall_24h_mm", 0) or 0
        rainfall_48h = weather.get("rainfall_48h_mm", 0) or 0
        rainfall_72h = weather.get("rainfall_72h_mm", 0) or 0

        # Score based on accumulated rainfall
        if rainfall_24h > 100 or rainfall_48h > 150 or rainfall_72h > 200:
            rainfall_score = 100
            factors.append({
                "factor": "Heavy Rainfall",
                "value": f"{rainfall_24h:.1f}mm in 24h",
                "score": 100
            })
        elif rainfall_24h > 50 or rainfall_48h > 100:
            rainfall_score = 70
            factors.append({
                "factor": "Moderate Rainfall",
                "value": f"{rainfall_24h:.1f}mm in 24h",
                "score": 70
            })
        elif rainfall_24h > 25:
            rainfall_score = 40
            factors.append({
                "factor": "Light Rainfall",
                "value": f"{rainfall_24h:.1f}mm in 24h",
                "score": 40
            })
        else:
            rainfall_score = 10

        # 2. RIVER LEVEL SCORE (40%)
        # Find rivers in this district
        district_rivers = [
            r for r in river_data
            if district.lower() in [d.lower() for d in r.get("districts", [])]
        ]

        if district_rivers:
            max_river_score = 0
            for river in district_rivers:
                pct_to_alert = river.get("pct_to_alert", 100)
                pct_to_minor = river.get("pct_to_minor_flood", 100)
                pct_to_major = river.get("pct_to_major_flood", 100)

                # Score based on how close to flood levels
                if pct_to_major < 0:  # Already at major flood
                    river_score = 100
                    factors.append({
                        "factor": "Major Flood Level",
                        "value": f"{river.get('station')} at {river.get('water_level_m')}m",
                        "score": 100,
                        "station": river.get("station"),
                        "river": river.get("river"),
                    })
                elif pct_to_minor < 0:  # Already at minor flood
                    river_score = 85
                    factors.append({
                        "factor": "Minor Flood Level",
                        "value": f"{river.get('station')} at {river.get('water_level_m')}m",
                        "score": 85,
                        "station": river.get("station"),
                        "river": river.get("river"),
                    })
                elif pct_to_alert < 0:  # Already at alert
                    river_score = 60
                    factors.append({
                        "factor": "River Alert Level",
                        "value": f"{river.get('station')} at {river.get('water_level_m')}m",
                        "score": 60,
                        "station": river.get("station"),
                        "river": river.get("river"),
                    })
                elif pct_to_alert < 20:  # Close to alert
                    river_score = 40
                    factors.append({
                        "factor": "River Rising",
                        "value": f"{river.get('station')} at {100-pct_to_alert:.0f}% capacity",
                        "score": 40,
                        "station": river.get("station"),
                        "river": river.get("river"),
                    })
                else:
                    river_score = 10

                max_river_score = max(max_river_score, river_score)

            river_level_score = max_river_score
        else:
            river_level_score = 0  # No rivers in district

        # 3. FORECAST SCORE (30%)
        # Find forecast for this district
        district_forecast = next(
            (f for f in forecast_data if f.get("district") == district),
            None
        )

        if district_forecast:
            forecast_24h = district_forecast.get("forecast_precip_24h_mm", 0) or 0
            forecast_48h = district_forecast.get("forecast_precip_48h_mm", 0) or 0

            if forecast_24h > 75 or forecast_48h > 125:
                forecast_score = 100
                factors.append({
                    "factor": "Heavy Rain Forecast",
                    "value": f"{forecast_24h:.1f}mm expected in 24h",
                    "score": 100
                })
            elif forecast_24h > 50 or forecast_48h > 75:
                forecast_score = 65
                factors.append({
                    "factor": "Moderate Rain Forecast",
                    "value": f"{forecast_24h:.1f}mm expected in 24h",
                    "score": 65
                })
            elif forecast_24h > 25:
                forecast_score = 35
                factors.append({
                    "factor": "Light Rain Forecast",
                    "value": f"{forecast_24h:.1f}mm expected in 24h",
                    "score": 35
                })
            else:
                forecast_score = 5
        else:
            forecast_score = 0

        # Composite threat score
        threat_score = (
            rainfall_score * 0.30 +
            river_level_score * 0.40 +
            forecast_score * 0.30
        )

        # Determine threat level
        if threat_score >= 70:
            threat_level = "CRITICAL"
        elif threat_score >= 50:
            threat_level = "HIGH"
        elif threat_score >= 30:
            threat_level = "MEDIUM"
        else:
            threat_level = "LOW"

        return {
            "district": district,
            "threat_score": round(threat_score, 1),
            "threat_level": threat_level,
            "rainfall_score": round(rainfall_score, 1),
            "river_score": round(river_level_score, 1),
            "forecast_score": round(forecast_score, 1),
            "factors": factors,
            "current_alert_level": weather.get("alert_level", "green"),
            "lat": weather.get("latitude", 0),
            "lon": weather.get("longitude", 0),
        }

    def get_cache_info(self) -> Dict[str, Any]:
        """Get information about the cache status."""
        return {
            "is_valid": self.is_cache_valid(),
            "last_updated": self._last_updated.isoformat() if self._last_updated else None,
            "cache_duration_minutes": self._cache_duration_minutes,
            "has_data": self._cached_data is not None,
        }


# Global singleton instance
flood_threat_cache = FloodThreatCache()
