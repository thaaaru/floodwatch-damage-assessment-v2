# SPDX-License-Identifier: Apache-2.0

"""
Google Flood Forecasting API service.

Wraps https://floodforecasting.googleapis.com/v1 and exposes a small surface
for the FloodWatch frontend: list of gauges over Sri Lanka with current status,
and a per-gauge forecast trend.

Rate-limit / cost discipline (same pattern as openweathermap.py):
  - Shared httpx.AsyncClient with connection pooling (no per-call TLS handshake).
  - Single-flight lock on the area-wide refresh so concurrent users share one
    fan-out instead of each triggering parallel queries.
  - Daily call counter with a hard cap (DAILY_CALL_BUDGET). When exhausted we
    serve stale cache instead of hitting the API and risking overage charges.
  - Per-gauge response cache (CACHE_DURATION_MINUTES TTL).
  - 429 handling via exponential backoff with jitter; on persistent failure
    we serve whatever stale cache we still have.

API shape (per https://developers.google.com/maps/documentation/flood-forecasting):
  GET /v1/floodStatus:queryArea?regionCode=LK
      -> { floodStatuses: [ { gaugeId, severity, gaugeValueUnit, ... } ] }
  GET /v1/floodStatus/{gaugeId}
      -> { gaugeId, severity, currentGaugeValue, ... }
  GET /v1/gauges/{gaugeId}
      -> { gaugeId, location: {latitude, longitude}, river, siteName, ... }
  GET /v1/floodStatus/{gaugeId}:queryGaugeForecast
      -> { forecastTimeSeries: [...] }

The exact response field names are confirmed against the live API on first use
and parsed defensively (we never assume a field is present).
"""
import asyncio
import logging
import random
from datetime import date, datetime
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)


# Sri Lanka bounding box used when issuing area queries.
SRI_LANKA_BOUNDS = {
    "low_lat": 5.5,
    "low_lon": 79.5,
    "high_lat": 10.0,
    "high_lon": 82.0,
}


class GoogleFloodsService:
    """Async client for Google's Flood Forecasting API."""

    BASE_URL = "https://floodforecasting.googleapis.com/v1"
    REGION_CODE = "LK"  # ISO 3166-1 alpha-2 for Sri Lanka

    CACHE_DURATION_MINUTES = 30  # Flood status updates ~hourly upstream; 30m is fine.
    GAUGE_META_CACHE_MINUTES = 24 * 60  # Gauge metadata (river name, coords) almost never changes.
    AREA_CACHE_MINUTES = 30
    DAILY_CALL_BUDGET = 500
    MAX_429_RETRIES = 3
    REFRESH_CONCURRENCY = 5  # Parallel per-gauge enrichments during an area refresh.

    def __init__(self, api_key: str):
        self.api_key = api_key

        # Response caches.
        self._area_cache: list = []
        self._area_cache_time: Optional[datetime] = None

        self._status_cache: dict[str, dict] = {}
        self._status_cache_time: dict[str, datetime] = {}

        self._gauge_meta_cache: dict[str, dict] = {}
        self._gauge_meta_cache_time: dict[str, datetime] = {}

        self._forecast_cache: dict[str, dict] = {}
        self._forecast_cache_time: dict[str, datetime] = {}

        # Single-flight lock for the area-wide refresh.
        self._area_lock = asyncio.Lock()

        # Daily call counter (UTC, resets on date rollover).
        self._calls_today: int = 0
        self._calls_day: date = datetime.utcnow().date()

        # Shared HTTP client created lazily on first use.
        self._http_client: Optional[httpx.AsyncClient] = None

    # ------------------------------------------------------------------
    # HTTP helpers
    # ------------------------------------------------------------------

    async def _get_http_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(
                timeout=30.0,
                limits=httpx.Limits(
                    max_keepalive_connections=self.REFRESH_CONCURRENCY,
                    max_connections=self.REFRESH_CONCURRENCY * 2,
                    keepalive_expiry=60.0,
                ),
            )
        return self._http_client

    async def aclose(self) -> None:
        if self._http_client is not None and not self._http_client.is_closed:
            await self._http_client.aclose()

    def _budget_remaining(self) -> int:
        today = datetime.utcnow().date()
        if today != self._calls_day:
            self._calls_day = today
            self._calls_today = 0
        return self.DAILY_CALL_BUDGET - self._calls_today

    def _record_call(self) -> None:
        self._calls_today += 1

    async def _request(self, path: str, params: Optional[dict] = None) -> Optional[dict]:
        """
        GET /v1{path} with budget, 429 backoff, and uniform error handling.
        Returns parsed JSON on success, None on failure or budget exhaustion.
        """
        if self._budget_remaining() <= 0:
            logger.warning(
                "Google Floods daily budget (%d) exhausted; skipping %s",
                self.DAILY_CALL_BUDGET,
                path,
            )
            return None

        url = f"{self.BASE_URL}{path}"
        merged_params = {"key": self.api_key}
        if params:
            merged_params.update(params)

        attempt = 0
        while True:
            self._record_call()
            try:
                client = await self._get_http_client()
                response = await client.get(url, params=merged_params)

                if response.status_code == 429:
                    if attempt >= self.MAX_429_RETRIES:
                        logger.error(
                            "Google Floods 429 after %d retries; serving stale. Body: %s",
                            attempt,
                            response.text[:200],
                        )
                        return None
                    delay = (2 ** (attempt + 1)) * (0.75 + random.random() * 0.5)
                    logger.warning(
                        "Google Floods 429 (attempt %d/%d); sleeping %.1fs",
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
                # 404 is a normal "no data for this gauge" — log at debug.
                level = logger.debug if e.response.status_code == 404 else logger.error
                level(
                    "Google Floods HTTP %s for %s: %s",
                    e.response.status_code,
                    path,
                    e.response.text[:200],
                )
                return None
            except Exception as e:
                logger.error("Google Floods request error for %s: %s", path, e)
                return None

    # ------------------------------------------------------------------
    # Low-level endpoints (one upstream call each, all cached separately)
    # ------------------------------------------------------------------

    async def query_area(self) -> list[dict]:
        """
        List all flood statuses inside the Sri Lanka bounding box.

        Tries the regionCode query first (cheaper, returns less data); falls
        back to a bounding-box area query if regionCode is unsupported for LK
        in the current API version.
        """
        # Try regionCode first.
        data = await self._request(
            "/floodStatus:queryArea",
            params={"regionCode": self.REGION_CODE},
        )
        if data is None or not (data.get("floodStatuses") or data.get("flood_statuses")):
            # Fall back to explicit bounds.
            data = await self._request(
                "/floodStatus:queryArea",
                params={
                    "regionCode": self.REGION_CODE,
                    # Some preview versions of the API also accept these:
                    "low.latitude": SRI_LANKA_BOUNDS["low_lat"],
                    "low.longitude": SRI_LANKA_BOUNDS["low_lon"],
                    "high.latitude": SRI_LANKA_BOUNDS["high_lat"],
                    "high.longitude": SRI_LANKA_BOUNDS["high_lon"],
                },
            )

        if data is None:
            return []

        # Field name is camelCase per Google's REST conventions, but we accept
        # snake_case as a safety net if a future version changes.
        return data.get("floodStatuses") or data.get("flood_statuses") or []

    async def get_gauge_metadata(self, gauge_id: str) -> dict:
        cache_age_ok = False
        if gauge_id in self._gauge_meta_cache:
            age_min = (datetime.utcnow() - self._gauge_meta_cache_time[gauge_id]).total_seconds() / 60
            cache_age_ok = age_min < self.GAUGE_META_CACHE_MINUTES
        if cache_age_ok:
            return self._gauge_meta_cache[gauge_id]

        data = await self._request(f"/gauges/{gauge_id}")
        if data is None:
            return self._gauge_meta_cache.get(gauge_id, {})

        self._gauge_meta_cache[gauge_id] = data
        self._gauge_meta_cache_time[gauge_id] = datetime.utcnow()
        return data

    async def get_gauge_forecast(self, gauge_id: str) -> dict:
        cache_age_ok = False
        if gauge_id in self._forecast_cache:
            age_min = (datetime.utcnow() - self._forecast_cache_time[gauge_id]).total_seconds() / 60
            cache_age_ok = age_min < self.CACHE_DURATION_MINUTES
        if cache_age_ok:
            return self._forecast_cache[gauge_id]

        data = await self._request(f"/floodStatus/{gauge_id}:queryGaugeForecast")
        if data is None:
            return self._forecast_cache.get(gauge_id, {})

        self._forecast_cache[gauge_id] = data
        self._forecast_cache_time[gauge_id] = datetime.utcnow()
        return data

    async def get_gauge_status(self, gauge_id: str) -> dict:
        cache_age_ok = False
        if gauge_id in self._status_cache:
            age_min = (datetime.utcnow() - self._status_cache_time[gauge_id]).total_seconds() / 60
            cache_age_ok = age_min < self.CACHE_DURATION_MINUTES
        if cache_age_ok:
            return self._status_cache[gauge_id]

        data = await self._request(f"/floodStatus/{gauge_id}")
        if data is None:
            return self._status_cache.get(gauge_id, {})

        self._status_cache[gauge_id] = data
        self._status_cache_time[gauge_id] = datetime.utcnow()
        return data

    # ------------------------------------------------------------------
    # High-level: enriched, frontend-ready gauges list
    # ------------------------------------------------------------------

    async def get_all_gauges_enriched(self) -> dict:
        """
        Single-flight refresh: returns every Sri Lanka gauge with its current
        flood status PLUS metadata (river, coords, thresholds) merged in.

        Output shape:
            {
              "fetched_at": "2026-...",
              "gauge_count": 12,
              "severity_breakdown": {"extreme": 0, "severe": 1, ...},
              "gauges": [
                {
                  "gauge_id": "hybas_...",
                  "severity": "no_known_flooding" | "warning" | "danger" | "extreme",
                  "river": "Mahaweli",
                  "site_name": "Manampitiya",
                  "latitude": 7.91, "longitude": 81.05,
                  "current_value": 3.2,
                  "current_value_unit": "GAUGE_VALUE_UNIT_METERS",
                  "thresholds": {"warning": 2.5, "danger": 3.5, "extreme": 4.5},
                  "updated_at": "...",
                  "source_url": "https://sites.research.google/floods/l/.../{gauge_id}",
                }, ...
              ]
            }
        """
        # Fast path: area cache is warm.
        if self._area_cache and self._area_cache_time:
            age_min = (datetime.utcnow() - self._area_cache_time).total_seconds() / 60
            if age_min < self.AREA_CACHE_MINUTES:
                logger.debug("Returning cached Google Floods data (%.1f min old)", age_min)
                return self._build_response(self._area_cache)

        async with self._area_lock:
            # Re-check after acquiring lock (another coro may have refreshed).
            if self._area_cache and self._area_cache_time:
                age_min = (datetime.utcnow() - self._area_cache_time).total_seconds() / 60
                if age_min < self.AREA_CACHE_MINUTES:
                    return self._build_response(self._area_cache)

            logger.info(
                "Refreshing Google Floods area data (budget remaining: %d/%d)",
                self._budget_remaining(),
                self.DAILY_CALL_BUDGET,
            )

            statuses = await self.query_area()
            if not statuses:
                # No data and nothing cached: return empty rather than 500.
                logger.warning("Google Floods returned 0 statuses for LK area query")
                self._area_cache = []
                self._area_cache_time = datetime.utcnow()
                return self._build_response([])

            # Enrich each status with gauge metadata in parallel (bounded).
            sem = asyncio.Semaphore(self.REFRESH_CONCURRENCY)

            async def enrich(status: dict) -> dict:
                gauge_id = status.get("gaugeId") or status.get("gauge_id")
                if not gauge_id:
                    return _merge(status, {})
                async with sem:
                    try:
                        meta = await self.get_gauge_metadata(gauge_id)
                        return _merge(status, meta)
                    except Exception as e:
                        logger.error("Failed to enrich gauge %s: %s", gauge_id, e)
                        return _merge(status, {})

            enriched = await asyncio.gather(*(enrich(s) for s in statuses))

            self._area_cache = enriched
            self._area_cache_time = datetime.utcnow()
            logger.info(
                "Cached %d Google Floods gauges (calls today: %d/%d)",
                len(enriched),
                self._calls_today,
                self.DAILY_CALL_BUDGET,
            )

            return self._build_response(enriched)

    def _build_response(self, enriched: list[dict]) -> dict:
        breakdown = {"extreme": 0, "severe": 0, "warning": 0, "no_known_flooding": 0, "unknown": 0}
        for g in enriched:
            sev = (g.get("severity") or "unknown").lower()
            # Google uses values like "EXTREME", "SEVERE", "WARNING", "NO_KNOWN_FLOODING".
            sev = sev.replace("severity_", "").replace("_", "_")
            if sev in breakdown:
                breakdown[sev] += 1
            else:
                breakdown["unknown"] += 1

        return {
            "fetched_at": (self._area_cache_time or datetime.utcnow()).isoformat(),
            "cache_ttl_minutes": self.AREA_CACHE_MINUTES,
            "gauge_count": len(enriched),
            "severity_breakdown": breakdown,
            "gauges": enriched,
            "source": "https://sites.research.google/floods/",
            "license_note": (
                "Data: Google Flood Hub. Display in accordance with "
                "https://developers.google.com/maps/documentation/flood-forecasting/policies"
            ),
        }


def _merge(status: dict, meta: dict) -> dict:
    """
    Flatten the Google API response into the shape the frontend expects.

    Both `status` and `meta` come straight from the API; field names use
    Google's camelCase. We pick the fields we know the page binds to and
    fall back gracefully when a field is missing (Google adds/renames fields
    between API versions).
    """
    gauge_id = status.get("gaugeId") or status.get("gauge_id") or meta.get("gaugeId")
    location = meta.get("location") or status.get("location") or {}
    thresholds = meta.get("thresholds") or {}

    return {
        "gauge_id": gauge_id,
        "severity": status.get("severity") or "UNKNOWN",
        "river": meta.get("river") or meta.get("riverName") or status.get("river"),
        "site_name": meta.get("siteName") or meta.get("site_name") or status.get("siteName"),
        "latitude": location.get("latitude"),
        "longitude": location.get("longitude"),
        "current_value": status.get("currentGaugeValue") or status.get("current_gauge_value"),
        "current_value_unit": status.get("gaugeValueUnit") or status.get("gauge_value_unit"),
        "thresholds": {
            "warning": thresholds.get("warningLevel") or thresholds.get("warning_level"),
            "danger": thresholds.get("dangerLevel") or thresholds.get("danger_level"),
            "extreme": thresholds.get("extremeDangerLevel") or thresholds.get("extreme_danger_level"),
        },
        "issued_time": status.get("issuedTime") or status.get("issued_time"),
        "source_url": (
            f"https://sites.research.google/floods/{gauge_id}" if gauge_id else None
        ),
        # Keep raw payloads so the frontend can inspect anything we missed.
        "raw_status": status,
        "raw_meta": meta,
    }


# ----------------------------------------------------------------------
# Singleton helper (matches the pattern used by openweathermap_service)
# ----------------------------------------------------------------------

google_floods_service: Optional[GoogleFloodsService] = None


def get_google_floods_service(api_key: str) -> GoogleFloodsService:
    global google_floods_service
    if google_floods_service is None:
        google_floods_service = GoogleFloodsService(api_key)
    return google_floods_service
