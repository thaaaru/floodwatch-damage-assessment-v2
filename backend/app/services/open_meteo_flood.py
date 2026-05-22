# SPDX-License-Identifier: Apache-2.0

"""
Open-Meteo Flood API service.

Wraps https://flood-api.open-meteo.com/v1/flood and provides modeled river
discharge (m3/s) backed by GloFAS. This complements our in-situ gauge data
(Irrigation Dept, Navy) by supplying:

  - Per-station 7-day forecast of river discharge
  - Historical discharge for trend analysis
  - Coverage of locations where no physical gauge exists

API characteristics:
  - Free, no API key required (non-commercial use; commercial requires a paid plan)
  - Daily resolution only
  - Lat/lon based, not station-id based

Reference:
  https://open-meteo.com/en/docs/flood-api
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

API_URL = "https://flood-api.open-meteo.com/v1/flood"

# Default daily variables to request. The full set is documented at
# https://open-meteo.com/en/docs/flood-api.
DEFAULT_DAILY = (
    "river_discharge",
    "river_discharge_mean",
    "river_discharge_max",
    "river_discharge_min",
)


@dataclass
class FloodForecast:
    """Per-location flood forecast bundle."""

    latitude: float
    longitude: float
    timezone: str
    dates: list[str]  # ISO date strings, e.g. ["2026-05-22", ...]
    river_discharge: list[Optional[float]]
    river_discharge_mean: list[Optional[float]]
    river_discharge_max: list[Optional[float]]
    river_discharge_min: list[Optional[float]]
    generated_at: datetime

    def to_dict(self) -> dict:
        return {
            "latitude": self.latitude,
            "longitude": self.longitude,
            "timezone": self.timezone,
            "dates": self.dates,
            "river_discharge_m3s": self.river_discharge,
            "river_discharge_mean_m3s": self.river_discharge_mean,
            "river_discharge_max_m3s": self.river_discharge_max,
            "river_discharge_min_m3s": self.river_discharge_min,
            "generated_at": self.generated_at.isoformat(),
        }

    @property
    def latest_discharge(self) -> Optional[float]:
        """Most recent (today's) river discharge, m^3/s."""
        for value in reversed(self.river_discharge):
            if value is not None:
                return value
        return None

    @property
    def peak_forecast_discharge(self) -> Optional[float]:
        """Peak discharge across the entire (past + forecast) window."""
        values = [v for v in self.river_discharge_max if v is not None]
        return max(values) if values else None


class OpenMeteoFloodService:
    """Async client for Open-Meteo's Flood API."""

    # Cache forecasts for 1 hour. Upstream discharge updates daily at most,
    # so this is conservative but avoids hammering them.
    CACHE_DURATION_SECONDS = 3600

    def __init__(self, timeout: float = 30.0) -> None:
        self._timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None
        self._client_lock = asyncio.Lock()
        # Cache keyed by (lat_rounded, lon_rounded, past_days, forecast_days).
        self._cache: dict[tuple, tuple[FloodForecast, datetime]] = {}

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            async with self._client_lock:
                if self._client is None:
                    self._client = httpx.AsyncClient(timeout=self._timeout)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def get_forecast(
        self,
        latitude: float,
        longitude: float,
        past_days: int = 2,
        forecast_days: int = 7,
        use_cache: bool = True,
    ) -> Optional[FloodForecast]:
        """Fetch a flood forecast for the given coordinates.

        Args:
            latitude: WGS84 latitude.
            longitude: WGS84 longitude.
            past_days: Days of history to include (0-92).
            forecast_days: Days of forecast (1-210).
            use_cache: Reuse cached forecast if fresh.

        Returns:
            FloodForecast on success, None on failure.
        """
        cache_key = (
            round(latitude, 3),
            round(longitude, 3),
            past_days,
            forecast_days,
        )
        if use_cache and cache_key in self._cache:
            forecast, cached_at = self._cache[cache_key]
            age = (datetime.utcnow() - cached_at).total_seconds()
            if age < self.CACHE_DURATION_SECONDS:
                return forecast

        params = {
            "latitude": latitude,
            "longitude": longitude,
            "daily": ",".join(DEFAULT_DAILY),
            "past_days": past_days,
            "forecast_days": forecast_days,
        }

        try:
            client = await self._get_client()
            response = await client.get(API_URL, params=params)
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPError as exc:
            logger.warning(
                "Open-Meteo Flood fetch failed for (%s, %s): %s",
                latitude,
                longitude,
                exc,
            )
            return None
        except ValueError as exc:  # JSON decode error
            logger.warning("Open-Meteo Flood returned invalid JSON: %s", exc)
            return None

        daily = payload.get("daily") or {}
        forecast = FloodForecast(
            latitude=float(payload.get("latitude", latitude)),
            longitude=float(payload.get("longitude", longitude)),
            timezone=str(payload.get("timezone", "GMT")),
            dates=list(daily.get("time") or []),
            river_discharge=list(daily.get("river_discharge") or []),
            river_discharge_mean=list(daily.get("river_discharge_mean") or []),
            river_discharge_max=list(daily.get("river_discharge_max") or []),
            river_discharge_min=list(daily.get("river_discharge_min") or []),
            generated_at=datetime.utcnow(),
        )

        self._cache[cache_key] = (forecast, datetime.utcnow())
        return forecast

    async def get_forecasts_bulk(
        self,
        coordinates: list[tuple[float, float]],
        past_days: int = 2,
        forecast_days: int = 7,
    ) -> dict[tuple[float, float], Optional[FloodForecast]]:
        """Fetch forecasts for many coordinates concurrently.

        Returns a mapping of (lat, lon) -> FloodForecast or None on failure.
        """
        tasks = [
            self.get_forecast(lat, lon, past_days=past_days, forecast_days=forecast_days)
            for lat, lon in coordinates
        ]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        return dict(zip(coordinates, results))


# Singleton instance (mirrors openweathermap_service / google_floods_service patterns).
open_meteo_flood_service = OpenMeteoFloodService()
