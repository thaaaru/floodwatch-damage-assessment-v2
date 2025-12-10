# SPDX-License-Identifier: Apache-2.0

"""
OpenWeatherMap One Call API 3.0 Service
Provides early warning system with government weather alerts,
8-day daily forecast, 48-hour hourly forecast, and AI weather overview.
"""
import httpx
import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


class OpenWeatherMapService:
    """Service for fetching weather data from OpenWeatherMap One Call API 3.0"""

    BASE_URL = "https://api.openweathermap.org/data/3.0/onecall"
    CACHE_DURATION_MINUTES = 120  # Cache for 2 hours to stay within API limits
    ALL_DISTRICTS_CACHE_MINUTES = 120  # Cache all districts response for 2 hours

    # Sri Lanka district coordinates
    DISTRICTS = {
        "Colombo": {"lat": 6.9271, "lon": 79.8612},
        "Gampaha": {"lat": 7.0873, "lon": 80.0144},
        "Kalutara": {"lat": 6.5854, "lon": 79.9607},
        "Kandy": {"lat": 7.2906, "lon": 80.6337},
        "Matale": {"lat": 7.4675, "lon": 80.6234},
        "Nuwara Eliya": {"lat": 6.9497, "lon": 80.7891},
        "Galle": {"lat": 6.0535, "lon": 80.2210},
        "Matara": {"lat": 5.9549, "lon": 80.5550},
        "Hambantota": {"lat": 6.1429, "lon": 81.1212},
        "Jaffna": {"lat": 9.6615, "lon": 80.0255},
        "Kilinochchi": {"lat": 9.3803, "lon": 80.3770},
        "Mannar": {"lat": 8.9810, "lon": 79.9044},
        "Vavuniya": {"lat": 8.7514, "lon": 80.4971},
        "Mullaitivu": {"lat": 9.2671, "lon": 80.8142},
        "Batticaloa": {"lat": 7.7310, "lon": 81.6747},
        "Ampara": {"lat": 7.2975, "lon": 81.6820},
        "Trincomalee": {"lat": 8.5874, "lon": 81.2152},
        "Kurunegala": {"lat": 7.4863, "lon": 80.3647},
        "Puttalam": {"lat": 8.0362, "lon": 79.8283},
        "Anuradhapura": {"lat": 8.3114, "lon": 80.4037},
        "Polonnaruwa": {"lat": 7.9403, "lon": 81.0188},
        "Badulla": {"lat": 6.9934, "lon": 81.0550},
        "Monaragala": {"lat": 6.8728, "lon": 81.3507},
        "Ratnapura": {"lat": 6.6828, "lon": 80.3992},
        "Kegalle": {"lat": 7.2513, "lon": 80.3464},
    }

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._cache: dict = {}
        self._cache_time: dict = {}
        self._all_districts_cache: list = []
        self._all_districts_cache_time: Optional[datetime] = None

    async def get_one_call(
        self,
        lat: float,
        lon: float,
        exclude: Optional[list] = None,
        units: str = "metric"
    ) -> dict:
        """
        Fetch comprehensive weather data using One Call API 3.0.

        Returns current weather, minutely (1h), hourly (48h), daily (8 days),
        and government weather alerts.
        """
        cache_key = f"{lat}_{lon}"

        # Check cache
        if cache_key in self._cache:
            cache_age = (datetime.utcnow() - self._cache_time[cache_key]).total_seconds() / 60
            if cache_age < self.CACHE_DURATION_MINUTES:
                logger.debug(f"Returning cached OWM data for {lat},{lon}")
                return self._cache[cache_key]

        params = {
            "lat": lat,
            "lon": lon,
            "appid": self.api_key,
            "units": units,
        }

        if exclude:
            params["exclude"] = ",".join(exclude)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(self.BASE_URL, params=params)
                response.raise_for_status()
                data = response.json()

            # Cache the result
            self._cache[cache_key] = data
            self._cache_time[cache_key] = datetime.utcnow()

            return data

        except httpx.HTTPStatusError as e:
            logger.error(f"OWM API HTTP error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"OWM API error: {e}")
            raise

    async def get_weather_overview(self, lat: float, lon: float) -> dict:
        """
        Get AI-generated human-readable weather summary.
        """
        url = f"{self.BASE_URL}/overview"
        params = {
            "lat": lat,
            "lon": lon,
            "appid": self.api_key,
            "units": "metric",  # Use Celsius and m/s instead of Kelvin
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"OWM Overview API error: {e}")
            return {}

    async def get_district_early_warning(self, district: str) -> dict:
        """
        Get comprehensive early warning data for a specific district.
        """
        if district not in self.DISTRICTS:
            raise ValueError(f"Unknown district: {district}")

        coords = self.DISTRICTS[district]
        data = await self.get_one_call(coords["lat"], coords["lon"])
        overview = await self.get_weather_overview(coords["lat"], coords["lon"])

        return self._process_early_warning(district, data, overview)

    async def get_all_districts_early_warning(self) -> list:
        """
        Get early warning data for all Sri Lankan districts.
        Uses global cache to minimize API calls (50 calls per full refresh).
        """
        # Check global cache first
        if self._all_districts_cache and self._all_districts_cache_time:
            cache_age = (datetime.utcnow() - self._all_districts_cache_time).total_seconds() / 60
            if cache_age < self.ALL_DISTRICTS_CACHE_MINUTES:
                logger.info(f"Returning cached all-districts data ({cache_age:.1f} min old)")
                return self._all_districts_cache

        logger.info("Fetching fresh early warning data for all districts...")
        results = []

        for district, coords in self.DISTRICTS.items():
            try:
                data = await self.get_one_call(coords["lat"], coords["lon"])
                overview = await self.get_weather_overview(coords["lat"], coords["lon"])
                warning_data = self._process_early_warning(district, data, overview)
                results.append(warning_data)
            except Exception as e:
                logger.error(f"Failed to fetch early warning for {district}: {e}")
                results.append({
                    "district": district,
                    "error": str(e),
                    "alerts": [],
                    "risk_level": "unknown"
                })

        # Sort by risk level (high first)
        risk_order = {"extreme": 0, "high": 1, "medium": 2, "low": 3, "unknown": 4}
        results.sort(key=lambda x: risk_order.get(x.get("risk_level", "unknown"), 4))

        # Cache the results
        self._all_districts_cache = results
        self._all_districts_cache_time = datetime.utcnow()
        logger.info(f"Cached all-districts data for {self.ALL_DISTRICTS_CACHE_MINUTES} minutes")

        return results

    def _process_early_warning(self, district: str, data: dict, overview: dict) -> dict:
        """
        Process raw API data into early warning format.
        """
        current = data.get("current", {})
        hourly = data.get("hourly", [])
        daily = data.get("daily", [])
        alerts = data.get("alerts", [])
        minutely = data.get("minutely", [])

        # Calculate precipitation totals
        precip_1h = sum(m.get("precipitation", 0) for m in minutely) if minutely else 0
        precip_24h = sum(h.get("rain", {}).get("1h", 0) + h.get("snow", {}).get("1h", 0) for h in hourly[:24])
        precip_48h = sum(h.get("rain", {}).get("1h", 0) + h.get("snow", {}).get("1h", 0) for h in hourly[:48])

        # Calculate risk level based on multiple factors
        risk_level, risk_score, risk_factors = self._calculate_risk_level(
            current, hourly, daily, alerts, precip_24h
        )

        # Process hourly forecast
        hourly_forecast = []
        for h in hourly[:48]:
            dt = datetime.fromtimestamp(h.get("dt", 0))
            hourly_forecast.append({
                "time": dt.isoformat(),
                "temp_c": h.get("temp"),
                "feels_like_c": h.get("feels_like"),
                "humidity": h.get("humidity"),
                "pressure": h.get("pressure"),
                "wind_speed_ms": h.get("wind_speed"),
                "wind_gust_ms": h.get("wind_gust"),
                "wind_deg": h.get("wind_deg"),
                "clouds": h.get("clouds"),
                "pop": h.get("pop", 0) * 100,  # Probability of precipitation
                "rain_mm": h.get("rain", {}).get("1h", 0),
                "snow_mm": h.get("snow", {}).get("1h", 0),
                "uvi": h.get("uvi"),
                "visibility": h.get("visibility"),
                "weather": h.get("weather", [{}])[0].get("description", ""),
                "weather_icon": h.get("weather", [{}])[0].get("icon", ""),
            })

        # Process daily forecast
        daily_forecast = []
        for d in daily[:8]:
            dt = datetime.fromtimestamp(d.get("dt", 0))
            daily_forecast.append({
                "date": dt.strftime("%Y-%m-%d"),
                "day_name": dt.strftime("%A"),
                "sunrise": datetime.fromtimestamp(d.get("sunrise", 0)).strftime("%H:%M"),
                "sunset": datetime.fromtimestamp(d.get("sunset", 0)).strftime("%H:%M"),
                "summary": d.get("summary", ""),
                "temp_day_c": d.get("temp", {}).get("day"),
                "temp_night_c": d.get("temp", {}).get("night"),
                "temp_min_c": d.get("temp", {}).get("min"),
                "temp_max_c": d.get("temp", {}).get("max"),
                "feels_like_day_c": d.get("feels_like", {}).get("day"),
                "humidity": d.get("humidity"),
                "pressure": d.get("pressure"),
                "wind_speed_ms": d.get("wind_speed"),
                "wind_gust_ms": d.get("wind_gust"),
                "wind_deg": d.get("wind_deg"),
                "clouds": d.get("clouds"),
                "pop": d.get("pop", 0) * 100,
                "rain_mm": d.get("rain", 0),
                "snow_mm": d.get("snow", 0),
                "uvi": d.get("uvi"),
                "weather": d.get("weather", [{}])[0].get("description", ""),
                "weather_icon": d.get("weather", [{}])[0].get("icon", ""),
                "moon_phase": d.get("moon_phase"),
                "alert_level": self._get_daily_alert_level(d),
            })

        # Process government alerts
        processed_alerts = []
        for alert in alerts:
            processed_alerts.append({
                "sender": alert.get("sender_name", "Unknown"),
                "event": alert.get("event", "Weather Alert"),
                "start": datetime.fromtimestamp(alert.get("start", 0)).isoformat(),
                "end": datetime.fromtimestamp(alert.get("end", 0)).isoformat(),
                "description": alert.get("description", ""),
                "tags": alert.get("tags", []),
            })

        return {
            "district": district,
            "coordinates": self.DISTRICTS[district],
            "fetched_at": datetime.utcnow().isoformat(),
            "timezone": data.get("timezone", "Asia/Colombo"),

            # Risk assessment
            "risk_level": risk_level,
            "risk_score": risk_score,
            "risk_factors": risk_factors,

            # Current conditions
            "current": {
                "temp_c": current.get("temp"),
                "feels_like_c": current.get("feels_like"),
                "humidity": current.get("humidity"),
                "pressure": current.get("pressure"),
                "wind_speed_ms": current.get("wind_speed"),
                "wind_gust_ms": current.get("wind_gust"),
                "wind_deg": current.get("wind_deg"),
                "clouds": current.get("clouds"),
                "visibility": current.get("visibility"),
                "uvi": current.get("uvi"),
                "rain_1h_mm": current.get("rain", {}).get("1h", 0),
                "weather": current.get("weather", [{}])[0].get("description", ""),
                "weather_icon": current.get("weather", [{}])[0].get("icon", ""),
            },

            # Precipitation summary
            "precipitation": {
                "next_1h_mm": round(precip_1h, 2),
                "next_24h_mm": round(precip_24h, 2),
                "next_48h_mm": round(precip_48h, 2),
            },

            # Government weather alerts
            "alerts": processed_alerts,
            "alert_count": len(processed_alerts),

            # AI weather overview
            "overview": overview.get("weather_overview", ""),

            # Forecasts
            "hourly_forecast": hourly_forecast,
            "daily_forecast": daily_forecast,
        }

    def _calculate_risk_level(
        self,
        current: dict,
        hourly: list,
        daily: list,
        alerts: list,
        precip_24h: float
    ) -> tuple:
        """
        Calculate flood risk level based on multiple weather factors.
        """
        score = 0
        factors = []

        # Factor 1: Government alerts (highest priority)
        if alerts:
            score += min(len(alerts) * 20, 40)
            for alert in alerts:
                factors.append({
                    "factor": "Government Alert",
                    "detail": alert.get("event", "Weather Alert"),
                    "severity": "high"
                })

        # Factor 2: Precipitation forecast
        if precip_24h >= 150:
            score += 30
            factors.append({
                "factor": "Extreme rainfall forecast",
                "detail": f"{precip_24h:.1f}mm in next 24h",
                "severity": "high"
            })
        elif precip_24h >= 100:
            score += 25
            factors.append({
                "factor": "Heavy rainfall forecast",
                "detail": f"{precip_24h:.1f}mm in next 24h",
                "severity": "high"
            })
        elif precip_24h >= 50:
            score += 15
            factors.append({
                "factor": "Significant rainfall forecast",
                "detail": f"{precip_24h:.1f}mm in next 24h",
                "severity": "medium"
            })
        elif precip_24h >= 25:
            score += 8
            factors.append({
                "factor": "Moderate rainfall forecast",
                "detail": f"{precip_24h:.1f}mm in next 24h",
                "severity": "low"
            })

        # Factor 3: Precipitation probability
        high_pop_hours = sum(1 for h in hourly[:24] if h.get("pop", 0) > 0.8)
        if high_pop_hours >= 12:
            score += 15
            factors.append({
                "factor": "Sustained high rain probability",
                "detail": f"{high_pop_hours} hours with >80% chance",
                "severity": "medium"
            })
        elif high_pop_hours >= 6:
            score += 8
            factors.append({
                "factor": "High rain probability",
                "detail": f"{high_pop_hours} hours with >80% chance",
                "severity": "low"
            })

        # Factor 4: Wind conditions
        max_wind = max((h.get("wind_speed", 0) for h in hourly[:24]), default=0)
        max_gust = max((h.get("wind_gust", 0) for h in hourly[:24]), default=0)
        if max_gust >= 25 or max_wind >= 15:  # m/s
            score += 10
            factors.append({
                "factor": "Strong winds",
                "detail": f"Gusts up to {max_gust:.1f} m/s",
                "severity": "medium"
            })

        # Factor 5: Current conditions
        current_rain = current.get("rain", {}).get("1h", 0)
        if current_rain >= 10:
            score += 10
            factors.append({
                "factor": "Heavy rain occurring now",
                "detail": f"{current_rain:.1f}mm in last hour",
                "severity": "high"
            })

        # Determine risk level
        if score >= 60:
            level = "extreme"
        elif score >= 40:
            level = "high"
        elif score >= 20:
            level = "medium"
        else:
            level = "low"

        return level, min(score, 100), factors

    def _get_daily_alert_level(self, day_data: dict) -> str:
        """
        Determine alert level for a single day forecast.
        """
        rain_mm = day_data.get("rain", 0)
        pop = day_data.get("pop", 0) * 100

        if rain_mm >= 150 or (rain_mm >= 100 and pop >= 80):
            return "red"
        elif rain_mm >= 100 or (rain_mm >= 50 and pop >= 70):
            return "orange"
        elif rain_mm >= 50 or pop >= 60:
            return "yellow"
        else:
            return "green"


# Singleton instance (will be initialized with API key when needed)
openweathermap_service: Optional[OpenWeatherMapService] = None


def get_openweathermap_service(api_key: str) -> OpenWeatherMapService:
    """Get or create OpenWeatherMap service instance."""
    global openweathermap_service
    if openweathermap_service is None:
        openweathermap_service = OpenWeatherMapService(api_key)
    return openweathermap_service
