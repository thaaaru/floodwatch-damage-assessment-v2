# SPDX-License-Identifier: Apache-2.0
"""Slim feeds for optional home-map overlays: NBRO rain gauges (via RISE) and OSM hospitals/shelters.

Each feed is fetched at most once per TTL however many viewers ask; a failed fetch serves the last
good snapshot with stale=True and is retried after RETRY_SECONDS at the soonest (no hammering upstream).
"""
import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx

USER_AGENT = "FloodWatchLK/1.0 (+https://floodwatch.teklab.dev)"


class _CachedFeed:
    TTL_SECONDS = 600
    RETRY_SECONDS = 600
    MAX_RESPONSE_BYTES = 2 * 1024 * 1024
    TIMEOUT = httpx.Timeout(15.0, connect=5.0)
    EMPTY: dict = {}

    def __init__(self, client: Optional[httpx.AsyncClient] = None):
        self._client = client
        self._owns_client = client is None
        self._lock = asyncio.Lock()
        self._last_good: Optional[dict] = None
        self._served: Optional[dict] = None
        self._tried_at: Optional[datetime] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self.TIMEOUT, follow_redirects=False, headers={"User-Agent": USER_AGENT})
            self._owns_client = True
        return self._client

    async def aclose(self) -> None:
        if self._owns_client and self._client is not None and not self._client.is_closed:
            await self._client.aclose()

    # Same streaming size cap as ExternalFloodService._json.
    async def _json(self, method: str, url: str, **kwargs: Any) -> Any:
        client = await self._get_client()
        async with client.stream(method, url, **kwargs) as response:
            response.raise_for_status()
            chunks, size = [], 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > self.MAX_RESPONSE_BYTES:
                    raise ValueError("Upstream response exceeds size limit")
                chunks.append(chunk)
        return json.loads(b"".join(chunks))

    async def _fetch(self) -> dict:
        raise NotImplementedError

    def _fresh(self, now: datetime) -> bool:
        if self._served is None or self._tried_at is None:
            return False
        ttl = self.RETRY_SECONDS if self._served["stale"] else self.TTL_SECONDS
        return (now - self._tried_at).total_seconds() < min(ttl, self.TTL_SECONDS)

    async def get(self) -> dict:
        now = datetime.now(timezone.utc)
        if self._fresh(now):
            return self._served
        async with self._lock:
            now = datetime.now(timezone.utc)
            if self._fresh(now):
                return self._served
            self._tried_at = now
            try:
                result = {**await self._fetch(), "retrieved_at": now.isoformat(), "stale": False}
                self._last_good = result
            except Exception:
                result = {**(self._last_good or self.EMPTY), "stale": True}
            self._served = result
            return result


def _parse_time(value: Any) -> Optional[datetime]:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


RAIN_ATTRIBUTION = "RISE Sri Lanka (NBRO rain gauge network)"
RAIN_STALE_AFTER = timedelta(hours=3)


def parse_rise_rainfall(payload: dict, now: datetime) -> list[dict]:
    """RISE /api/rainfall stations -> [{name, district, lat, lon, rain_24h_mm, observed_at, stale}]."""
    rows = []
    for s in payload.get("stations") or []:
        if not isinstance(s, dict) or s.get("disabled"):
            continue
        lat, lon, mm = s.get("lat"), s.get("lon"), s.get("rain_24h_mm")
        if not all(isinstance(v, (int, float)) for v in (lat, lon, mm)):
            continue
        observed = _parse_time(s.get("observed_at_utc"))
        rows.append({
            "name": str(s.get("name") or s.get("label") or s.get("id") or "Rain gauge"),
            "district": s.get("district"),
            "lat": lat, "lon": lon,
            "rain_24h_mm": round(float(mm), 1),
            "observed_at": observed.isoformat() if observed else None,
            # Older than 3 h (or undated): the 24 h total no longer describes the last 24 h.
            "stale": observed is None or now - observed > RAIN_STALE_AFTER,
        })
    return rows


class Rain24hService(_CachedFeed):
    TTL_SECONDS = 10 * 60
    URL = "https://risesrilanka.org/api/rainfall"
    EMPTY = {"source": RAIN_ATTRIBUTION, "source_url": "https://risesrilanka.org/docs/api", "stations": [], "latest_observation_at": None}

    async def _fetch(self) -> dict:
        payload = await self._json("GET", self.URL)
        stations = parse_rise_rainfall(payload, datetime.now(timezone.utc))
        if not stations:
            raise ValueError("RISE rainfall returned no usable stations")
        times = [s["observed_at"] for s in stations if s["observed_at"]]
        return {**self.EMPTY, "stations": stations, "latest_observation_at": max(times) if times else None}


FACILITY_ATTRIBUTION = "© OpenStreetMap contributors (ODbL)"
FACILITY_DISCLAIMER = "From OpenStreetMap — not an official evacuation centre list"
# Sri Lanka's bounding box (also clips a sliver of Indian sea, no land). Hospitals, plus the only
# OSM tags that mean a place people go to in an emergency; plain amenity=shelter is left out:
# in Sri Lanka it is almost all bus halts and huts.
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_QUERY = """[out:json][timeout:90][bbox:5.85,79.5,9.9,81.95];
(nwr["amenity"="hospital"];nwr["social_facility"="shelter"];nwr["emergency"="assembly_point"];nwr["amenity"="shelter"]["shelter_type"="evacuation"];);
out center tags;"""


def parse_overpass_facilities(payload: dict) -> list[dict]:
    """Overpass elements -> [{id, kind: hospital|shelter, name, lat, lon, phone}]."""
    rows = []
    for el in payload.get("elements") or []:
        tags = el.get("tags") or {}
        lat = el.get("lat", (el.get("center") or {}).get("lat"))
        lon = el.get("lon", (el.get("center") or {}).get("lon"))
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            continue
        if tags.get("amenity") == "hospital":
            if tags.get("emergency") in {"emergency_ward_entrance"}:  # an entrance node, not a hospital
                continue
            kind = "hospital"
        else:
            kind = "shelter"
        rows.append({
            "id": f"{el.get('type', 'node')}/{el.get('id')}",
            "kind": kind,
            "name": tags.get("name:en") or tags.get("name"),
            "lat": round(lat, 5), "lon": round(lon, 5),
            "phone": tags.get("phone") or tags.get("contact:phone"),
        })
    return rows


class MapFacilitiesService(_CachedFeed):
    TTL_SECONDS = 24 * 3600  # OSM changes slowly; one Overpass query a day
    MAX_RESPONSE_BYTES = 8 * 1024 * 1024
    TIMEOUT = httpx.Timeout(100.0, connect=10.0)
    EMPTY = {"source": FACILITY_ATTRIBUTION, "disclaimer": FACILITY_DISCLAIMER, "facilities": []}

    async def _fetch(self) -> dict:
        payload = await self._json("POST", OVERPASS_URL, data={"data": OVERPASS_QUERY})
        facilities = parse_overpass_facilities(payload)
        if not facilities:
            raise ValueError("Overpass returned no facilities")
        return {**self.EMPTY, "facilities": facilities}
