# SPDX-License-Identifier: Apache-2.0
"""Google Flood Forecasting API v1 client.

The API is key/waitlist gated. This module only exposes values returned by
Google; it does not synthesize water levels or thresholds.
"""
import asyncio
import json as jsonlib
from datetime import datetime, timezone
from typing import Any, Optional

import httpx


class GoogleFloodsService:
    BASE_URL = "https://floodforecasting.googleapis.com/v1"
    REGION_CODE = "LK"
    AREA_CACHE_MINUTES = 15
    DAILY_CALL_BUDGET = 500
    MAX_RESPONSE_BYTES = 2 * 1024 * 1024
    MAX_ITEMS = 5000

    def __init__(self, api_key: str, client: Optional[httpx.AsyncClient] = None):
        self.api_key = api_key
        self._http_client = client
        self._owns_client = client is None
        self._area_cache: list[dict] = []
        self._area_cache_time: Optional[datetime] = None
        self._area_lock = asyncio.Lock()
        self._calls_today = 0
        self._calls_day = datetime.now(timezone.utc).date()

    async def _get_http_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0))
            self._owns_client = True
        return self._http_client

    async def aclose(self) -> None:
        if self._owns_client and self._http_client is not None and not self._http_client.is_closed:
            await self._http_client.aclose()

    def _budget_remaining(self) -> int:
        today = datetime.now(timezone.utc).date()
        if today != self._calls_day:
            self._calls_day = today
            self._calls_today = 0
        return self.DAILY_CALL_BUDGET - self._calls_today

    async def _request(self, method: str, path: str, *, params: Any = None, json: Any = None) -> Optional[dict]:
        if not self.api_key or self._budget_remaining() <= 0:
            return None
        self._calls_today += 1
        try:
            client = await self._get_http_client()
            request_params = [*(params or []), ("key", self.api_key)] if isinstance(params, list) else {**(params or {}), "key": self.api_key}
            async with client.stream(
                method,
                f"{self.BASE_URL}{path}",
                params=request_params,
                json=json,
            ) as response:
                response.raise_for_status()
                content_length = response.headers.get("content-length")
                if content_length and int(content_length) > self.MAX_RESPONSE_BYTES:
                    return None
                chunks = []
                size = 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > self.MAX_RESPONSE_BYTES:
                        return None
                    chunks.append(chunk)
            payload = jsonlib.loads(b"".join(chunks))
            return payload if isinstance(payload, dict) else None
        except (httpx.HTTPError, ValueError):
            return None
    async def search_gauges_by_area(self) -> Optional[list[dict]]:
        data = await self._request(
            "POST",
            "/gauges:searchGaugesByArea",
            json={
                "regionCode": self.REGION_CODE,
                "pageSize": self.MAX_ITEMS,
                "includeNonQualityVerified": True,
                "includeGaugesWithoutHydroModel": True,
            },
        )
        if data is None:
            return None
        gauges = data.get("gauges", [])
        return gauges[:self.MAX_ITEMS] if isinstance(gauges, list) else []

    async def search_latest_flood_status_by_area(self) -> Optional[list[dict]]:
        data = await self._request(
            "POST",
            "/floodStatus:searchLatestFloodStatusByArea",
            json={"regionCode": self.REGION_CODE, "pageSize": self.MAX_ITEMS},
        )
        if data is None:
            return None
        statuses = data.get("floodStatuses", [])
        return statuses[:self.MAX_ITEMS] if isinstance(statuses, list) else []


    async def get_all_gauges_enriched(self) -> dict:
        if self._area_cache_time and (datetime.now(timezone.utc) - self._area_cache_time).total_seconds() < self.AREA_CACHE_MINUTES * 60:
            return self._build_response(self._area_cache)
        async with self._area_lock:
            if self._area_cache_time and (datetime.now(timezone.utc) - self._area_cache_time).total_seconds() < self.AREA_CACHE_MINUTES * 60:
                return self._build_response(self._area_cache)
            gauges_result, statuses_result = await asyncio.gather(self.search_gauges_by_area(), self.search_latest_flood_status_by_area())
            gauges = gauges_result or []
            statuses = statuses_result or []
            by_id = {
                str(gauge.get("gaugeId", "")): gauge
                for gauge in gauges
                if isinstance(gauge, dict) and gauge.get("gaugeId")
            }
            rows = []
            for status in statuses:
                if not isinstance(status, dict):
                    continue
                gauge_id = str(status.get("gaugeId", ""))
                rows.append(_merge(status, by_id.get(gauge_id, {})))
            self._area_cache = rows
            self._area_cache_time = datetime.now(timezone.utc)
            return self._build_response(rows)

    def _build_response(self, rows: list[dict]) -> dict:
        breakdown: dict[str, int] = {}
        for row in rows:
            severity = normalize_severity(row.get("severity"))
            breakdown[severity] = breakdown.get(severity, 0) + 1
        return {
            "fetched_at": (self._area_cache_time or datetime.now(timezone.utc)).isoformat(),
            "cache_ttl_minutes": self.AREA_CACHE_MINUTES,
            "gauge_count": len(rows),
            "severity_breakdown": breakdown,
            "gauges": rows,
            "source": "https://developers.google.com/flood-forecasting",
            "license_note": "Google Flood Forecasting data, CC BY 4.0.",
        }


def normalize_severity(value: Any) -> str:
    raw = str(value or "UNKNOWN").upper()
    for prefix in ("FLOOD_SEVERITY_", "SEVERITY_"):
        if raw.startswith(prefix):
            raw = raw[len(prefix):]
    aliases = {"NO_FLOODING": "no_flooding", "NO_KNOWN_FLOODING": "no_flooding"}
    return aliases.get(raw, raw.lower())


def _merge(status: dict, gauge: dict) -> dict:
    location = gauge.get("location") if isinstance(gauge.get("location"), dict) else {}
    gauge_id = status.get("gaugeId") or gauge.get("gaugeId")
    return {
        "gauge_id": gauge_id,
        "severity": normalize_severity(status.get("severity")),
        "river": gauge.get("riverName") or gauge.get("river"),
        "site_name": gauge.get("siteName"),
        "latitude": location.get("latitude"),
        "longitude": location.get("longitude"),
        "issued_time": status.get("issuedTime"),
        "source_url": "https://sites.research.google/floods/" if gauge_id else None,
        "raw_status": status,
        "raw_meta": gauge,
    }


google_floods_service: Optional[GoogleFloodsService] = None


def get_google_floods_service(api_key: str) -> GoogleFloodsService:
    global google_floods_service
    if google_floods_service is None or google_floods_service.api_key != api_key:
        google_floods_service = GoogleFloodsService(api_key)
    return google_floods_service
