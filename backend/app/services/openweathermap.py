# SPDX-License-Identifier: Apache-2.0

"""
OpenWeatherMap One Call API 3.0 Service
Provides early warning system with government weather alerts,
8-day daily forecast, 48-hour hourly forecast, and AI weather overview.

Rate-limit strategy (One Call 3.0 free tier = 1,000 calls/day, billed beyond):
  - Per-coord cache (onecall + overview) with TTL = CACHE_DURATION_MINUTES.
  - Single-flight: only one bulk refresh of all districts can run at a time;
    concurrent callers await the same task instead of triggering parallel fan-outs.
  - Daily call counter with hard cap (DAILY_CALL_BUDGET). When exceeded, we serve
    stale cache (or empty data) rather than incur overage charges.
  - 429 handling: exponential backoff with jitter, then bail out and serve stale.
At 3h cache, worst case = 25 districts * 2 endpoints * 8 refreshes = 400 calls/day.
"""
import asyncio
import logging
import random
from datetime import date, datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


class OpenWeatherMapService:
    """Service for fetching weather data from OpenWeatherMap One Call API 3.0"""

    BASE_URL = "https://api.openweathermap.org/data/3.0/onecall"
    CACHE_DURATION_MINUTES = 180  # Cache per-coord data for 3 hours
    ALL_DISTRICTS_CACHE_MINUTES = 180  # Cache the all-districts response for 3 hours
    DAILY_CALL_BUDGET = 900  # Leave 100 calls/day headroom under the 1000 free-tier cap
    MAX_429_RETRIES = 3
    REFRESH_CONCURRENCY = 10  # Max parallel OWM requests during a bulk refresh

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
        self._overview_cache: dict = {}
        self._overview_cache_time: dict = {}
        self._all_districts_cache: list = []
        self._all_districts_cache_time: Optional[datetime] = None

        # Concurrency control: only one bulk refresh in flight at a time.
        self._refresh_lock = asyncio.Lock()

        # Daily call counter (reset on UTC date rollover).
        self._calls_today: int = 0
        self._calls_day: date = datetime.utcnow().date()

    # ------------------------------------------------------------------
    # Rate-limit accounting
    # ------------------------------------------------------------------

    def _budget_remaining(self) -> int:
        today = datetime.utcnow().date()
        if today != self._calls_day:
            self._calls_day = today
            self._calls_today = 0
        return self.DAILY_CALL_BUDGET - self._calls_today

    def _record_call(self) -> None:
        # Counter is incremented even on non-200 responses; OWM bills/limits requests, not successes.
        self._calls_today += 1

    async def _request_with_retry(self, url: str, params: dict) -> Optional[dict]:
        """
        GET with respect for the daily budget and 429 backoff.
        Returns parsed JSON on success, or None when the request is dropped
        (budget exhausted, persistent 429, or non-recoverable error).
        """
        if self._budget_remaining() <= 0:
            logger.warning(
                "OWM daily call budget (%d) exhausted; skipping request to %s",
                self.DAILY_CALL_BUDGET,
                url,
            )
            return None

        attempt = 0
        while True:
            self._record_call()
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(url, params=params)

                if response.status_code == 429:
                    if attempt >= self.MAX_429_RETRIES:
                        logger.error(
                            "OWM 429 after %d retries; serving stale data. Body: %s",
                            attempt,
                            response.text[:200],
                        )
                        return None
                    # Exponential backoff with jitter: 2s, 4s, 8s (+/- 25%).
                    delay = (2 ** (attempt + 1)) * (0.75 + random.random() * 0.5)
                    logger.warning(
                        "OWM 429 (attempt %d/%d); sleeping %.1fs",
                        attempt + 1,
                        self.MAX_429_RETRIES,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    attempt += 1
                    continue

                response.raise_for_status()
                return response.json()

            except httpx.HTTPStatusError as e:
                logger.error(
                    "OWM HTTP %s for %s: %s",
                    e.response.status_code,
                    url,
                    e.response.text[:200],
                )
                return None
            except Exception as e:
                logger.error("OWM request error for %s: %s", url, e)
                return None

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
        and government weather alerts. Returns an empty dict if the upstream
        call fails or the daily budget is exhausted (callers should treat this
        as "no data" rather than raising).
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

        data = await self._request_with_retry(self.BASE_URL, params)
        if data is None:
            # Fall back to whatever stale data we have (better than 500ing).
            return self._cache.get(cache_key, {})

        self._cache[cache_key] = data
        self._cache_time[cache_key] = datetime.utcnow()
        return data

    async def get_weather_overview(self, lat: float, lon: float) -> dict:
        """
        Get AI-generated human-readable weather summary.

        Cached with the same TTL as get_one_call to halve the OWM call rate.
        """
        cache_key = f"{lat}_{lon}"

        if cache_key in self._overview_cache:
            cache_age = (datetime.utcnow() - self._overview_cache_time[cache_key]).total_seconds() / 60
            if cache_age < self.CACHE_DURATION_MINUTES:
                return self._overview_cache[cache_key]

        url = f"{self.BASE_URL}/overview"
        params = {
            "lat": lat,
            "lon": lon,
            "appid": self.api_key,
            "units": "metric",
        }

        data = await self._request_with_retry(url, params)
        if data is None:
            return self._overview_cache.get(cache_key, {})

        self._overview_cache[cache_key] = data
        self._overview_cache_time[cache_key] = datetime.utcnow()
        return data

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

        Uses single-flight: concurrent callers all await the same refresh task
        instead of each kicking off their own 25-district fan-out (which on a
        cold cache could blow the daily budget in seconds).
        """
        # Fast path: cache still warm.
        if self._all_districts_cache and self._all_districts_cache_time:
            cache_age = (datetime.utcnow() - self._all_districts_cache_time).total_seconds() / 60
            if cache_age < self.ALL_DISTRICTS_CACHE_MINUTES:
                logger.info(f"Returning cached all-districts data ({cache_age:.1f} min old)")
                return self._all_districts_cache

        async with self._refresh_lock:
            # Re-check cache after acquiring the lock: another coroutine may have
            # just finished a refresh while we were waiting.
            if self._all_districts_cache and self._all_districts_cache_time:
                cache_age = (datetime.utcnow() - self._all_districts_cache_time).total_seconds() / 60
                if cache_age < self.ALL_DISTRICTS_CACHE_MINUTES:
                    return self._all_districts_cache

            logger.info(
                "Fetching fresh early warning data for all districts (budget remaining: %d/%d, concurrency=%d)",
                self._budget_remaining(),
                self.DAILY_CALL_BUDGET,
                self.REFRESH_CONCURRENCY,
            )

            # Parallel fetch with a semaphore to cap concurrent OWM requests.
            # This brings a cold refresh from ~75s (serial) down to ~15s while
            # staying well under any per-second API limits and our daily budget
            # (single-flight lock above guarantees only one refresh runs at a time).
            sem = asyncio.Semaphore(self.REFRESH_CONCURRENCY)

            async def fetch_one(district: str, coords: dict) -> dict:
                async with sem:
                    try:
                        data = await self.get_one_call(coords["lat"], coords["lon"])
                        overview = await self.get_weather_overview(coords["lat"], coords["lon"])

                        if not data:
                            return {
                                "district": district,
                                "coordinates": coords,
                                "error": "upstream unavailable",
                                "alerts": [],
                                "alert_count": 0,
                                "risk_level": "unknown",
                            }

                        return self._process_early_warning(district, data, overview)
                    except Exception as e:
                        logger.error(f"Failed to process early warning for {district}: {e}")
                        return {
                            "district": district,
                            "coordinates": coords,
                            "error": str(e),
                            "alerts": [],
                            "alert_count": 0,
                            "risk_level": "unknown",
                        }

            results = await asyncio.gather(
                *(fetch_one(d, c) for d, c in self.DISTRICTS.items())
            )

            # Sort by risk level (high first)
            risk_order = {"extreme": 0, "high": 1, "medium": 2, "low": 3, "unknown": 4}
            results.sort(key=lambda x: risk_order.get(x.get("risk_level", "unknown"), 4))

            self._all_districts_cache = results
            self._all_districts_cache_time = datetime.utcnow()
            logger.info(
                "Cached all-districts data for %d minutes (calls used today: %d/%d)",
                self.ALL_DISTRICTS_CACHE_MINUTES,
                self._calls_today,
                self.DAILY_CALL_BUDGET,
            )

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
