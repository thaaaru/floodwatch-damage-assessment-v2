# SPDX-License-Identifier: Apache-2.0

"""
OpenWeatherMap One Call API 3.0 Service
Provides early warning system with government weather alerts,
8-day daily forecast, 48-hour hourly forecast, and AI weather overview.

Cost control (One Call 3.0 free tier = 1,000 calls/day, billed beyond):
  - Only the scheduler calls OWM (refresh_all). Every HTTP endpoint, including
    unauthenticated ones, reads the cached snapshot and never calls upstream.
  - One refresh = 25 districts x 2 calls (onecall + overview) = 50 calls.
    Scheduled every REFRESH_INTERVAL_MINUTES (180) -> 8/day = 400 calls/day.
    A refresh is skipped if the snapshot is younger than MIN_REFRESH_AGE_MINUTES
    (170), so restarts cannot add runs: <= ceil(1440/170) = 9/day = 450 calls/day.
  - No 429 retries: a failed call keeps that district's previous data (stale).
  - Hard guard: DAILY_CALL_BUDGET (900) per UTC day, reserved atomically in
    Postgres (owm_usage) *before* each HTTP request, so restarts don't reset it.
    When exhausted, cached data is served and the stale flag is set.
  - The processed snapshot is persisted (owm_cache) and reloaded on start.
"""
import asyncio
import logging
from datetime import date, datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import text
from sqlalchemy.engine import Engine

from ..database import SessionLocal, engine as default_engine
from ..models import OwmCache

logger = logging.getLogger(__name__)

DAILY_CALL_BUDGET = 900


def reserve_call(db_engine: Engine, day: date, budget: int = DAILY_CALL_BUDGET) -> bool:
    """Atomically count one OWM call for `day`. False (nothing counted) once `budget` is reached."""
    with db_engine.begin() as conn:
        row = conn.execute(
            text(
                "INSERT INTO owm_usage (day, calls) VALUES (:day, 1) "
                "ON CONFLICT (day) DO UPDATE SET calls = owm_usage.calls + 1 "
                "WHERE owm_usage.calls < :budget "
                "RETURNING calls"
            ),
            {"day": day, "budget": budget},
        ).first()
    return row is not None and row[0] <= budget


def calls_used(db_engine: Engine, day: date) -> int:
    with db_engine.connect() as conn:
        row = conn.execute(text("SELECT calls FROM owm_usage WHERE day = :day"), {"day": day}).first()
    return row[0] if row else 0


class OpenWeatherMapService:
    """Service for fetching weather data from OpenWeatherMap One Call API 3.0"""

    BASE_URL = "https://api.openweathermap.org/data/3.0/onecall"
    REFRESH_INTERVAL_MINUTES = 180
    MIN_REFRESH_AGE_MINUTES = 170
    STALE_AFTER_MINUTES = 240  # one missed refresh + margin
    DAILY_CALL_BUDGET = DAILY_CALL_BUDGET
    REFRESH_CONCURRENCY = 5
    CACHE_KEY = "all_districts"

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

    def __init__(self, api_key: str, db_engine: Engine = default_engine):
        self.api_key = api_key
        self._engine = db_engine
        self._results: list = []
        self._fetched_at: Optional[datetime] = None
        self._incomplete = False  # last refresh hit the budget or upstream errors
        self._loaded = False
        self._refresh_lock = asyncio.Lock()
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _get_http_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=30.0)
        return self._http_client

    async def aclose(self) -> None:
        """Close the shared HTTP client. Call on application shutdown."""
        if self._http_client is not None and not self._http_client.is_closed:
            await self._http_client.aclose()

    # ------------------------------------------------------------------
    # Upstream (scheduler only)
    # ------------------------------------------------------------------

    async def _request(self, url: str, params: dict) -> Optional[dict]:
        """One GET, counted against the persistent daily budget first. None on any failure."""
        if not reserve_call(self._engine, datetime.now(timezone.utc).date(), self.DAILY_CALL_BUDGET):
            logger.warning("OWM daily budget (%d) exhausted; serving cached data", self.DAILY_CALL_BUDGET)
            return None
        try:
            client = await self._get_http_client()
            response = await client.get(url, params={**params, "appid": self.api_key, "units": "metric"})
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error("OWM HTTP %s for %s", e.response.status_code, url)
        except Exception as e:
            logger.error("OWM request error for %s: %s", url, e)
        return None

    async def refresh_all(self, force: bool = False) -> bool:
        """Fetch all districts (50 calls). Skipped while the snapshot is younger than MIN_REFRESH_AGE_MINUTES."""
        async with self._refresh_lock:
            self._load()
            if not force and self.age_minutes() is not None and self.age_minutes() < self.MIN_REFRESH_AGE_MINUTES:
                return True

            previous = {d["district"]: d for d in self._results}
            sem = asyncio.Semaphore(self.REFRESH_CONCURRENCY)
            failed = 0

            async def fetch_one(district: str, coords: dict) -> dict:
                nonlocal failed
                async with sem:
                    params = {"lat": coords["lat"], "lon": coords["lon"]}
                    data = await self._request(self.BASE_URL, params)
                    overview = await self._request(f"{self.BASE_URL}/overview", params) if data else None
                    if not data:
                        failed += 1
                        return previous.get(district) or {
                            "district": district, "coordinates": coords, "error": "upstream unavailable",
                            "alerts": [], "alert_count": 0, "risk_level": "unknown",
                        }
                    try:
                        return self._process_early_warning(district, data, overview or {})
                    except Exception as e:
                        failed += 1
                        logger.error(f"Failed to process early warning for {district}: {e}")
                        return previous.get(district) or {
                            "district": district, "coordinates": coords, "error": str(e),
                            "alerts": [], "alert_count": 0, "risk_level": "unknown",
                        }

            results = await asyncio.gather(*(fetch_one(d, c) for d, c in self.DISTRICTS.items()))
            risk_order = {"extreme": 0, "high": 1, "medium": 2, "low": 3, "unknown": 4}
            results.sort(key=lambda x: risk_order.get(x.get("risk_level", "unknown"), 4))

            if failed == len(self.DISTRICTS):
                # Nothing new: keep the old snapshot and its timestamp so age-based staleness stays honest.
                self._incomplete = True
                logger.warning("OWM refresh got no data; keeping previous snapshot")
                return False

            self._results = results
            self._fetched_at = datetime.now(timezone.utc)
            self._incomplete = failed > 0
            self._save()
            logger.info("OWM refresh: %d/%d districts updated, calls today %d/%d",
                        len(self.DISTRICTS) - failed, len(self.DISTRICTS),
                        calls_used(self._engine, self._fetched_at.date()), self.DAILY_CALL_BUDGET)
            return failed == 0

    # ------------------------------------------------------------------
    # Snapshot persistence
    # ------------------------------------------------------------------

    def _load(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        db = SessionLocal(bind=self._engine)
        try:
            row = db.get(OwmCache, self.CACHE_KEY)
            if row:
                self._results = row.payload
                self._fetched_at = row.fetched_at if row.fetched_at.tzinfo else row.fetched_at.replace(tzinfo=timezone.utc)
                self._incomplete = row.stale
        except Exception as e:
            logger.warning(f"Could not load OWM snapshot: {e}")
        finally:
            db.close()

    def _save(self) -> None:
        db = SessionLocal(bind=self._engine)
        try:
            db.merge(OwmCache(key=self.CACHE_KEY, fetched_at=self._fetched_at,
                              stale=self._incomplete, payload=self._results))
            db.commit()
        except Exception as e:
            logger.error(f"Could not persist OWM snapshot: {e}")
        finally:
            db.close()

    # ------------------------------------------------------------------
    # Read path (HTTP endpoints): cache only, never calls OWM
    # ------------------------------------------------------------------

    def age_minutes(self) -> Optional[float]:
        if not self._fetched_at:
            return None
        return (datetime.now(timezone.utc) - self._fetched_at).total_seconds() / 60

    def is_stale(self) -> bool:
        self._load()
        age = self.age_minutes()
        return age is None or age > self.STALE_AFTER_MINUTES or self._incomplete

    def last_updated(self) -> Optional[str]:
        self._load()
        return self._fetched_at.isoformat() if self._fetched_at else None

    async def get_all_districts_early_warning(self) -> list:
        self._load()
        return self._results

    async def get_district_early_warning(self, district: str) -> dict:
        if district not in self.DISTRICTS:
            raise ValueError(f"Unknown district: {district}")
        self._load()
        for d in self._results:
            if d.get("district") == district:
                return d
        return {"district": district, "coordinates": self.DISTRICTS[district], "error": "no data yet",
                "alerts": [], "alert_count": 0, "risk_level": "unknown"}

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
