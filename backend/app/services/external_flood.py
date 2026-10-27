# SPDX-License-Identifier: Apache-2.0
"""Read-only summaries of additional, non-map flood intelligence sources."""
import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

import httpx

from .google_floods import GoogleFloodsService, normalize_severity


class ExternalFloodService:
    TTL_SECONDS = 15 * 60
    RISE_BASE = "https://risesrilanka.org"
    COMMUNITY_BASE = "https://lk-flood-api.vercel.app"
    MAX_RESPONSE_BYTES = 2 * 1024 * 1024

    def __init__(self, google_api_key: str = "", client: Optional[httpx.AsyncClient] = None, google_service: Optional[GoogleFloodsService] = None):
        self.google_api_key = google_api_key
        self._client = client
        self._owns_client = client is None
        self._google = google_service
        self._lock = asyncio.Lock()
        self._cached: Optional[dict] = None
        self._cached_at: Optional[datetime] = None
        self._last_good: dict[str, dict] = {}

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0), follow_redirects=False)
            self._owns_client = True
        return self._client

    async def aclose(self) -> None:
        if self._owns_client and self._client is not None and not self._client.is_closed:
            await self._client.aclose()
        if self._google is not None:
            await self._google.aclose()

    async def _json(self, url: str) -> Any:
        client = await self._get_client()
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            content_length = response.headers.get("content-length")
            if content_length and int(content_length) > self.MAX_RESPONSE_BYTES:
                raise ValueError("Upstream response exceeds size limit")
            chunks = []
            size = 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > self.MAX_RESPONSE_BYTES:
                    raise ValueError("Upstream response exceeds size limit")
                chunks.append(chunk)
        return json.loads(b"".join(chunks))

    async def snapshot(self) -> dict:
        now = datetime.now(timezone.utc)
        if self._cached is not None and self._cached_at and (now - self._cached_at).total_seconds() < self.TTL_SECONDS:
            return self._cached
        async with self._lock:
            now = datetime.now(timezone.utc)
            if self._cached is not None and self._cached_at and (now - self._cached_at).total_seconds() < self.TTL_SECONDS:
                return self._cached
            sources = await asyncio.gather(self._rise(), self._community(), self._google_source())
            result = {"retrieved_at": now.isoformat(), "sources": sources, **_source_health(sources)}
            self._cached = result
            self._cached_at = now
            return result

    def _fallback(self, source_id: str, message: str, template: dict) -> dict:
        if source_id in self._last_good:
            stale = {**self._last_good[source_id], "status": "stale", "status_message": message}
            stale["summary"] = {**stale["summary"], "stale": True}
            return stale
        return {**template, "status": "error", "status_message": message, "updated_at": None, "summary": {}}

    async def _rise(self) -> dict:
        template = {
            "id": "rise-sri-lanka", "name": "RISE Sri Lanka", "kind": "aggregator",
            "source_url": "https://risesrilanka.org/docs/api", "attribution": "RISE Sri Lanka public data API; upstream sources vary by feed.",
            "license": "Reuse terms not specified; live read-only display only.",
        }
        paths = ("gauges", "rainfall", "flood-risk", "alerts")
        results = await asyncio.gather(*(self._json(f"{self.RISE_BASE}/api/{path}") for path in paths), return_exceptions=True)
        valid: dict[str, dict] = {}
        for path, result in zip(paths, results):
            if isinstance(result, dict):
                valid[path] = result
        if not valid:
            return self._fallback("rise-sri-lanka", "RISE is temporarily unavailable; showing the last successful snapshot when available.", template)
        endpoint_statuses = {
            path: {
                "data_status": payload.get("data_status"),
                "status_message": payload.get("status_message"),
                "stale": payload.get("stale"),
            }
            for path, payload in valid.items()
        }
        summary = {
            "gauge_count": _count(valid.get("gauges")),
            "rainfall_count": _count(valid.get("rainfall")),
            "flood_risk_count": _count(valid.get("flood-risk")),
            "alert_count": _count(valid.get("alerts")),
            "endpoint_statuses": endpoint_statuses,
            "stale": any(meta.get("stale") is True or str(meta.get("data_status", "")).lower() in {"stale", "available_delayed"} for meta in endpoint_statuses.values()),
        }
        updated_at = _latest_timestamp(valid.values())
        partial = len(valid) != len(paths) or any(not isinstance(results[i], dict) for i in range(len(results)))
        status = "partial" if partial else ("stale" if summary["stale"] else "ok")
        source = {**template, "status": status, "status_message": "Some RISE feeds were unavailable or malformed." if partial else "Live summary from separate RISE feeds.", "updated_at": updated_at, "summary": summary}
        if status in {"ok", "stale"}:
            self._last_good["rise-sri-lanka"] = source
        return source

    async def _community(self) -> dict:
        template = {
            "id": "sl-flood-community", "name": "Sri Lanka Flood Data API", "kind": "community",
            "source_url": "https://lk-flood-api.vercel.app/docs", "attribution": "Community-operated transformation of DMC bulletins via nuuuwan/lk_dmc_vis; not an official DMC API.",
            "license": "API software is MIT; upstream DMC data reuse terms are not specified.",
        }
        results = await asyncio.gather(
            self._json(f"{self.COMMUNITY_BASE}/levels/latest"),
            self._json(f"{self.COMMUNITY_BASE}/alerts"),
            return_exceptions=True,
        )
        levels = results[0] if isinstance(results[0], list) else None
        alerts = results[1] if isinstance(results[1], list) else None
        if levels is None and alerts is None:
            return self._fallback("sl-flood-community", "Community flood data is temporarily unavailable; showing the last successful snapshot when available.", template)
        timestamps = [
            item["timestamp"]
            for group in (levels or [], alerts or [])
            for item in group
            if isinstance(item, dict) and item.get("timestamp")
        ]
        partial = levels is None or alerts is None
        source = {
            **template,
            "status": "partial" if partial else "ok",
            "status_message": "One community endpoint was unavailable or malformed." if partial else "Community-transformed DMC bulletin summary; not official DMC data delivery.",
            "updated_at": _community_timestamp(max(timestamps)) if timestamps else None,
            "summary": {"latest_level_count": len(levels or []), "alert_count": len(alerts or []), "stale": False},
        }
        if not partial:
            self._last_good["sl-flood-community"] = source
        return source

    async def _google_source(self) -> dict:
        template = {
            "id": "google-flood-forecasting", "name": "Google Flood Forecasting", "kind": "forecast",
            "source_url": "https://developers.google.com/flood-forecasting", "attribution": "Google Flood Forecasting API.",
            "license": "CC BY 4.0; API access requires approval and an API key.",
        }
        if not self.google_api_key:
            return {**template, "status": "disabled", "status_message": "Not configured: Google API approval and GOOGLE_FLOODS_API_KEY are required.", "updated_at": None, "summary": {"gauge_count": 0, "flood_status_count": 0, "severity_breakdown": {}}}
        service = self._google or GoogleFloodsService(self.google_api_key)
        self._google = service
        try:
            gauges, statuses = await asyncio.gather(service.search_gauges_by_area(), service.search_latest_flood_status_by_area())
        except Exception:
            return self._fallback("google-flood-forecasting", "Google Flood Forecasting is temporarily unavailable; showing the last successful snapshot when available.", template)
        if gauges is None or statuses is None:
            return self._fallback("google-flood-forecasting", "Google Flood Forecasting is temporarily unavailable; showing the last successful snapshot when available.", template)
        breakdown: dict[str, int] = {}
        updated = []
        for item in statuses:
            if isinstance(item, dict):
                severity = normalize_severity(item.get("severity"))
                breakdown[severity] = breakdown.get(severity, 0) + 1
                updated.extend(str(item[key]) for key in ("issuedTime", "updateTime") if item.get(key))
        source = {**template, "status": "ok", "status_message": "Forecast summary from Google; forecasts are not measured observations.", "updated_at": max(updated) if updated else None, "summary": {"gauge_count": len(gauges), "flood_status_count": len(statuses), "severity_breakdown": breakdown, "stale": False}}
        self._last_good["google-flood-forecasting"] = source
        return source


def _source_health(sources: list[dict]) -> dict:
    statuses = ("ok", "partial", "stale", "disabled", "error")
    counts = {status: 0 for status in statuses}
    updates = []
    for source in sources:
        status = source.get("status")
        if status in counts:
            counts[status] += 1
        value = source.get("updated_at")
        if status not in {"ok", "partial", "stale"} or not value:
            continue
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            updates.append((parsed.astimezone(timezone.utc), value))
        except (TypeError, ValueError):
            continue
    updates.sort(key=lambda item: item[0])
    return {
        "source_status_counts": counts,
        "oldest_usable_update_at": updates[0][1] if updates else None,
        "newest_usable_update_at": updates[-1][1] if updates else None,
    }


def _count(payload: Optional[dict]) -> int:
    if not payload:
        return 0
    for key in ("station_count", "record_count", "count", "total", "item_count"):
        if isinstance(payload.get(key), int):
            return payload[key]
    for key in ("records", "items", "alerts", "stations", "data"):
        if isinstance(payload.get(key), list):
            return len(payload[key])
    return 0


def _community_timestamp(value: str) -> Optional[str]:
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo("Asia/Colombo"))
    return parsed.isoformat()


def _latest_timestamp(payloads: Any) -> Optional[str]:
    for key in ("latest_observation_at", "last_updated_utc", "updated_at", "generated_at", "timestamp"):
        values = [str(payload[key]) for payload in payloads if payload.get(key)]
        if values:
            return max(values)
    return None
