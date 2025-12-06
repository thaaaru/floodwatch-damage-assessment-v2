"""
Weather data caching service.
Now uses HERE Weather API as primary source (more generous rate limits).
Falls back to Open-Meteo if HERE fails.
"""
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
import asyncio

from .here_weather import here_weather_service, SRI_LANKA_LOCATIONS
from .districts_service import get_all_districts

logger = logging.getLogger(__name__)

# Cache configuration
CACHE_DIR = Path(__file__).parent.parent.parent / "cache"
CACHE_FILE = CACHE_DIR / "weather_data.json"
CACHE_DURATION_MINUTES = 60  # Refresh every 60 minutes to reduce API calls

# Weather source: "here" or "open_meteo"
WEATHER_SOURCE = "here"

# FREEZE MODE: When True, always serve cached data and never refresh
CACHE_FREEZE_MODE = False


class WeatherCache:
    """Manages cached weather data for all districts."""

    _instance: Optional["WeatherCache"] = None
    _lock = asyncio.Lock()

    def __init__(self):
        self._cache: dict = {}
        self._last_update: Optional[datetime] = None
        self._ensure_cache_dir()
        self._load_cache_from_disk()

    @classmethod
    def get_instance(cls) -> "WeatherCache":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = WeatherCache()
        return cls._instance

    def _ensure_cache_dir(self):
        """Create cache directory if it doesn't exist."""
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def _load_cache_from_disk(self):
        """Load cached data from disk on startup."""
        try:
            if CACHE_FILE.exists():
                with open(CACHE_FILE, "r") as f:
                    data = json.load(f)
                    self._cache = data.get("weather", {})
                    last_update_str = data.get("last_update")
                    if last_update_str:
                        self._last_update = datetime.fromisoformat(last_update_str)
                        # Ensure timezone awareness - if no timezone, assume UTC
                        if self._last_update.tzinfo is None:
                            self._last_update = self._last_update.replace(tzinfo=timezone.utc)
                    logger.info(f"Loaded weather cache from disk, last update: {self._last_update}")
        except Exception as e:
            logger.warning(f"Failed to load cache from disk: {e}")
            self._cache = {}
            self._last_update = None

    def _save_cache_to_disk(self):
        """Save cached data to disk."""
        try:
            with open(CACHE_FILE, "w") as f:
                json.dump({
                    "weather": self._cache,
                    "last_update": self._last_update.isoformat() if self._last_update else None
                }, f)
            logger.info("Saved weather cache to disk")
        except Exception as e:
            logger.error(f"Failed to save cache to disk: {e}")

    def is_cache_valid(self) -> bool:
        """Check if cache is still valid (less than 30 minutes old)."""
        if CACHE_FREEZE_MODE and self._cache:
            return True
        if not self._last_update or not self._cache:
            return False
        age = datetime.now(timezone.utc) - self._last_update.replace(tzinfo=timezone.utc)
        return age < timedelta(minutes=CACHE_DURATION_MINUTES)

    def get_cache_age_seconds(self) -> int:
        """Get age of cache in seconds."""
        if not self._last_update:
            return -1
        last = self._last_update.replace(tzinfo=timezone.utc) if self._last_update.tzinfo is None else self._last_update
        return int((datetime.now(timezone.utc) - last).total_seconds())

    async def _fetch_here_weather(self) -> dict:
        """Fetch weather data from HERE Weather API for all locations."""
        new_cache = {}

        # Fetch observations for all locations (parallel)
        observations = await here_weather_service.fetch_all_observations()

        # Fetch forecasts for all locations (parallel)
        forecasts = await here_weather_service.fetch_all_forecasts()

        # Build forecast lookup
        forecast_by_location = {f["location"]: f for f in forecasts}

        for obs in observations:
            location_name = obs["location"]
            forecast = forecast_by_location.get(location_name, {})
            forecast_daily = forecast.get("forecasts", [])

            # Calculate rainfall totals from forecast
            rainfall_24h = sum(f.get("precipitation_mm", 0) or 0 for f in forecast_daily[:1])
            rainfall_48h = sum(f.get("precipitation_mm", 0) or 0 for f in forecast_daily[:2])
            rainfall_72h = sum(f.get("precipitation_mm", 0) or 0 for f in forecast_daily[:3])

            # Get forecast precipitation probability
            precip_prob = forecast_daily[0].get("precipitation_probability", 0) if forecast_daily else 0

            # Calculate danger level based on conditions
            danger_score = 0
            danger_factors = []

            if rainfall_24h > 100:
                danger_score += 40
                danger_factors.append("Heavy rainfall >100mm")
            elif rainfall_24h > 50:
                danger_score += 25
                danger_factors.append("Moderate rainfall >50mm")
            elif rainfall_24h > 25:
                danger_score += 10
                danger_factors.append("Light rainfall >25mm")

            if precip_prob > 80:
                danger_score += 15
                danger_factors.append("High precipitation probability")

            # Wind danger
            wind_speed = obs.get("wind_speed_kmh", 0) or 0
            if wind_speed > 60:
                danger_score += 20
                danger_factors.append("Strong winds >60km/h")
            elif wind_speed > 40:
                danger_score += 10
                danger_factors.append("Moderate winds >40km/h")

            danger_level = "critical" if danger_score >= 50 else "high" if danger_score >= 30 else "moderate" if danger_score >= 15 else "low"

            new_cache[location_name] = {
                "district": location_name,
                "latitude": obs["lat"],
                "longitude": obs["lon"],
                "data": {
                    "temperature_c": obs.get("temperature_c"),
                    "humidity_percent": obs.get("humidity_percent"),
                    "pressure_hpa": obs.get("pressure_hpa"),
                    "pressure_trend": 0,  # HERE doesn't provide this directly
                    "cloud_cover_percent": None,
                    "wind_speed_kmh": obs.get("wind_speed_kmh"),
                    "wind_gusts_kmh": obs.get("wind_gust_kmh"),
                    "wind_direction": obs.get("wind_direction"),
                    "rainfall_24h_mm": obs.get("precipitation_24h_mm", 0) or rainfall_24h,
                    "rainfall_48h_mm": rainfall_48h,
                    "rainfall_72h_mm": rainfall_72h,
                    "forecast_precip_24h_mm": rainfall_24h,
                    "forecast_precip_48h_mm": rainfall_48h,
                    "precipitation_probability": precip_prob,
                    "danger_level": danger_level,
                    "danger_score": danger_score,
                    "danger_factors": danger_factors,
                    "forecast_daily": forecast_daily,
                    "description": obs.get("description"),
                    "source": "here"
                },
                "fetched_at": datetime.now(timezone.utc).isoformat()
            }

        return new_cache

    async def refresh_cache(self, force: bool = False) -> bool:
        """
        Refresh weather data for all districts.
        Uses HERE Weather API as primary source.
        """
        async with self._lock:
            if not force and self.is_cache_valid():
                logger.debug("Cache still valid, skipping refresh")
                return True

            logger.info(f"Refreshing weather cache using {WEATHER_SOURCE}...")

            try:
                if WEATHER_SOURCE == "here":
                    new_cache = await self._fetch_here_weather()
                else:
                    # Fallback to Open-Meteo (original implementation)
                    from .open_meteo import OpenMeteoService
                    weather_service = OpenMeteoService()
                    districts = get_all_districts()
                    new_cache = {}

                    for district in districts[:25]:  # Limit to avoid rate limits
                        try:
                            data = await weather_service.get_weather(
                                district["latitude"],
                                district["longitude"],
                                hours=72
                            )
                            new_cache[district["name"]] = {
                                "district": district["name"],
                                "latitude": district["latitude"],
                                "longitude": district["longitude"],
                                "data": data,
                                "fetched_at": datetime.now(timezone.utc).isoformat()
                            }
                        except Exception as e:
                            logger.error(f"Failed to fetch weather for {district['name']}: {e}")
                        await asyncio.sleep(1.5)  # Rate limiting - Open-Meteo needs longer delays

                if new_cache:
                    self._cache = new_cache
                    self._last_update = datetime.now(timezone.utc)
                    self._save_cache_to_disk()
                    logger.info(f"Weather cache refreshed: {len(new_cache)} locations updated via {WEATHER_SOURCE}")
                    return True
                else:
                    logger.error("Failed to refresh any weather data")
                    return False

            except Exception as e:
                logger.error(f"Weather cache refresh failed: {e}")
                return False

    def get_all_weather(self, hours: int = 24) -> list[dict]:
        """Get weather data for all districts from cache."""
        from ..routers.weather import get_alert_level

        result = []

        for district_name, cached in self._cache.items():
            try:
                data = cached["data"]
                rainfall = data.get("rainfall_24h_mm", 0.0) if hours == 24 else \
                          (data.get("rainfall_48h_mm", 0.0) if hours == 48 else data.get("rainfall_72h_mm", 0.0))

                result.append({
                    "district": cached["district"],
                    "latitude": cached["latitude"],
                    "longitude": cached["longitude"],
                    "rainfall_mm": rainfall,
                    "rainfall_24h_mm": data.get("rainfall_24h_mm", 0.0),
                    "rainfall_48h_mm": data.get("rainfall_48h_mm", 0.0),
                    "rainfall_72h_mm": data.get("rainfall_72h_mm", 0.0),
                    "forecast_precip_24h_mm": data.get("forecast_precip_24h_mm", 0.0),
                    "forecast_precip_48h_mm": data.get("forecast_precip_48h_mm", 0.0),
                    "precipitation_probability": data.get("precipitation_probability", 0),
                    "temperature_c": data.get("temperature_c"),
                    "humidity_percent": data.get("humidity_percent"),
                    "pressure_hpa": data.get("pressure_hpa"),
                    "pressure_trend": data.get("pressure_trend", 0),
                    "cloud_cover_percent": data.get("cloud_cover_percent"),
                    "wind_speed_kmh": data.get("wind_speed_kmh"),
                    "wind_gusts_kmh": data.get("wind_gusts_kmh"),
                    "wind_direction": data.get("wind_direction"),
                    "hours": hours,
                    "alert_level": get_alert_level(rainfall, hours),
                    "danger_level": data.get("danger_level", "low"),
                    "danger_score": data.get("danger_score", 0),
                    "danger_factors": data.get("danger_factors", [])
                })
            except Exception as e:
                logger.error(f"Error processing cached data for {district_name}: {e}")

        return result

    def get_district_weather(self, district_name: str) -> Optional[dict]:
        """Get weather data for a specific district from cache."""
        cached = self._cache.get(district_name)
        if cached:
            return cached["data"]
        return None

    def get_all_forecast(self) -> list[dict]:
        """Get 5-day forecast for all districts from cache."""
        result = []

        for district_name, cached in self._cache.items():
            try:
                data = cached["data"]
                forecast_daily = data.get("forecast_daily", [])

                if forecast_daily:
                    result.append({
                        "district": cached["district"],
                        "latitude": cached["latitude"],
                        "longitude": cached["longitude"],
                        "forecast_daily": forecast_daily,
                        "forecast_precip_24h_mm": data.get("forecast_precip_24h_mm", 0.0),
                        "forecast_precip_48h_mm": data.get("forecast_precip_48h_mm", 0.0),
                    })
            except Exception as e:
                logger.error(f"Error processing forecast for {district_name}: {e}")

        return result

    def get_cache_info(self) -> dict:
        """Get cache status information."""
        return {
            "cached_districts": len(self._cache),
            "last_update": self._last_update.isoformat() if self._last_update else None,
            "cache_age_seconds": self.get_cache_age_seconds(),
            "is_valid": self.is_cache_valid(),
            "freeze_mode": CACHE_FREEZE_MODE,
            "weather_source": WEATHER_SOURCE,
            "next_refresh_seconds": max(0, CACHE_DURATION_MINUTES * 60 - self.get_cache_age_seconds()) if self._last_update else 0
        }


# Singleton instance
weather_cache = WeatherCache.get_instance()
