# SPDX-License-Identifier: Apache-2.0
"""Bounded server-side adapters for Google Maps Platform map context."""
import asyncio
import base64
import json
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import quote

import httpx


class PointWeatherService:
    CACHE_TTL_SECONDS = 300

    def __init__(self, open_meteo):
        self._open_meteo = open_meteo
        self._cache: dict[tuple[float, float], tuple[float, dict]] = {}
        self._lock = asyncio.Lock()

    async def get(self, latitude: float, longitude: float) -> dict:
        key = (round(latitude, 4), round(longitude, 4))
        now = datetime.now(timezone.utc).timestamp()
        cached = self._cache.get(key)
        if cached and cached[0] > now:
            return cached[1]
        async with self._lock:
            cached = self._cache.get(key)
            if cached and cached[0] > now:
                return cached[1]
            weather = await self._open_meteo.get_weather(latitude, longitude)
            value = {
                "location": {"latitude": latitude, "longitude": longitude},
                "weather": weather,
                "source": "Open-Meteo",
                "source_type": "model",
            }
            self._cache[key] = (now + self.CACHE_TTL_SECONDS, value)
            return value


class NominatimPlaceService:
    """Key-free, submit-only Sri Lanka place search via OpenStreetMap Nominatim."""

    SEARCH_URL = "https://nominatim.openstreetmap.org/search"
    CACHE_TTL_SECONDS = 300
    MAX_RESPONSE_BYTES = 256 * 1024
    MAX_CACHE_ENTRIES = 512
    MIN_REQUEST_INTERVAL_SECONDS = 1.0

    def __init__(self, client: Optional[httpx.AsyncClient] = None):
        self._client = client
        self._owns_client = client is None
        self._cache: dict[str, tuple[float, dict]] = {}
        self._request_lock = asyncio.Lock()
        self._last_request_at = 0.0

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(8.0, connect=3.0),
                follow_redirects=False,
                headers={
                    "User-Agent": "FloodWatch-LK/1.0 (+https://floodwatch.teklab.dev)",
                    "Accept": "application/json",
                },
            )
            self._owns_client = True
        return self._client

    async def aclose(self) -> None:
        if self._owns_client and self._client is not None and not self._client.is_closed:
            await self._client.aclose()

    async def search(self, input_text: str) -> dict:
        key = input_text.casefold()
        now = datetime.now(timezone.utc).timestamp()
        cached = self._cache.get(key)
        if cached and cached[0] > now:
            return cached[1]

        if self._request_lock.locked():
            raise RuntimeError("place search is busy")
        async with self._request_lock:
            cached = self._cache.get(key)
            if cached and cached[0] > datetime.now(timezone.utc).timestamp():
                return cached[1]

            loop = asyncio.get_running_loop()
            delay = self.MIN_REQUEST_INTERVAL_SECONDS - (loop.time() - self._last_request_at)
            if delay > 0:
                await asyncio.sleep(delay)
            client = await self._get_client()
            async with client.stream(
                "GET",
                self.SEARCH_URL,
                params={
                    "q": input_text,
                    "format": "jsonv2",
                    "countrycodes": "lk",
                    "addressdetails": "0",
                    "limit": "8",
                },
                headers={
                    "User-Agent": "FloodWatch-LK/1.0 (+https://floodwatch.teklab.dev)",
                    "Accept": "application/json",
                },
            ) as response:
                self._last_request_at = loop.time()
                response.raise_for_status()
                content = bytearray()
                async for chunk in response.aiter_bytes():
                    if len(content) + len(chunk) > self.MAX_RESPONSE_BYTES:
                        raise ValueError("Nominatim response too large")
                    content.extend(chunk)
            payload = json.loads(content)
            if not isinstance(payload, list):
                raise ValueError("Nominatim response must be a list")

            suggestions = []
            for item in payload[:8]:
                if not isinstance(item, dict):
                    continue
                try:
                    latitude = float(item["lat"])
                    longitude = float(item["lon"])
                    text = str(item["display_name"])
                except (KeyError, TypeError, ValueError):
                    continue
                if not (5.7 <= latitude <= 10.2 and 79.3 <= longitude <= 82.2 and text):
                    continue
                coordinates = f"{latitude:.6f},{longitude:.6f}".encode()
                token = base64.urlsafe_b64encode(coordinates).decode().rstrip("=")
                suggestions.append({"place_id": f"osm_{token}", "text": text})

            value = {
                "suggestions": suggestions,
                "source": "OpenStreetMap Nominatim",
                "source_type": "community",
            }
            expires_at = datetime.now(timezone.utc).timestamp() + self.CACHE_TTL_SECONDS
            self._cache = {
                cache_key: cached_value
                for cache_key, cached_value in self._cache.items()
                if cached_value[0] > now
            }
            while len(self._cache) >= self.MAX_CACHE_ENTRIES:
                self._cache.pop(next(iter(self._cache)))
            self._cache[key] = (expires_at, value)
            return value

    async def place(self, place_id: str) -> dict:
        if not place_id.startswith("osm_"):
            raise LookupError("place not found")
        encoded = place_id[4:]
        try:
            padding = "=" * (-len(encoded) % 4)
            latitude_text, longitude_text = base64.urlsafe_b64decode(encoded + padding).decode().split(",", 1)
            latitude = float(latitude_text)
            longitude = float(longitude_text)
        except (ValueError, UnicodeDecodeError):
            raise LookupError("place not found") from None
        if not (5.7 <= latitude <= 10.2 and 79.3 <= longitude <= 82.2):
            raise LookupError("place not found")
        return {
            "place_id": place_id,
            "formatted_address": None,
            "location": {"latitude": latitude, "longitude": longitude},
            "source": "OpenStreetMap Nominatim",
            "source_type": "community",
        }


class GoogleMapsService:
    PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete"
    GEOCODE_PLACE_URL = "https://geocode.googleapis.com/v4/geocode/places/"
    ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
    ELEVATION_URL = "https://maps.googleapis.com/maps/api/elevation/json"
    MAX_RESPONSE_BYTES = 2 * 1024 * 1024
    DAILY_CALL_BUDGET = 500
    MAX_CLIENT_BUDGET_ENTRIES = 10_000
    CACHE_TTL_SECONDS = 300

    def __init__(
        self,
        api_key: str,
        client: Optional[httpx.AsyncClient] = None,
        client_daily_budget: int = 50,
    ):
        self.api_key = api_key
        self._client = client
        self._owns_client = client is None
        self._cache: dict[tuple[Any, ...], tuple[float, dict]] = {}
        self._cache_lock = asyncio.Lock()
        self._budget_lock = asyncio.Lock()
        self._budget_day = datetime.now(timezone.utc).date()
        self._calls_today = 0
        self._client_daily_budget = client_daily_budget
        self._client_calls: dict[str, int] = {}

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(8.0, connect=3.0),
                follow_redirects=False,
            )
            self._owns_client = True
        return self._client

    async def aclose(self) -> None:
        if self._owns_client and self._client is not None and not self._client.is_closed:
            await self._client.aclose()

    async def _reserve_budget(self, client_id: str) -> None:
        async with self._budget_lock:
            today = datetime.now(timezone.utc).date()
            if today != self._budget_day:
                self._budget_day = today
                self._calls_today = 0
                self._client_calls.clear()
            budget_key = client_id
            if budget_key not in self._client_calls and len(self._client_calls) >= self.MAX_CLIENT_BUDGET_ENTRIES:
                budget_key = "__overflow__"
            client_calls = self._client_calls.get(budget_key, 0)
            if client_calls >= self._client_daily_budget:
                raise RuntimeError("Google Maps client daily call budget exhausted")
            if self._calls_today >= self.DAILY_CALL_BUDGET:
                raise RuntimeError("Google Maps daily call budget exhausted")
            self._client_calls[budget_key] = client_calls + 1
            self._calls_today += 1

    async def _request(
        self,
        method: str,
        url: str,
        *,
        headers: Optional[dict[str, str]] = None,
        params: Optional[dict[str, Any]] = None,
        body: Optional[dict[str, Any]] = None,
        client_id: str = "unknown",
    ) -> dict:
        if not self.api_key:
            raise RuntimeError("Google Maps integration is disabled")
        await self._reserve_budget(client_id)
        client = await self._get_client()
        async with client.stream(method, url, headers=headers, params=params, json=body) as response:
            if 300 <= response.status_code < 400:
                response.raise_for_status()
            response.raise_for_status()
            declared_size = response.headers.get("content-length")
            if declared_size and int(declared_size) > self.MAX_RESPONSE_BYTES:
                raise ValueError("upstream response too large")
            chunks: list[bytes] = []
            size = 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > self.MAX_RESPONSE_BYTES:
                    raise ValueError("upstream response too large")
                chunks.append(chunk)
        payload = json.loads(b"".join(chunks))
        if not isinstance(payload, dict):
            raise ValueError("upstream response must be an object")
        return payload

    async def _cached(self, key: tuple[Any, ...], fetch) -> dict:
        now = datetime.now(timezone.utc).timestamp()
        cached = self._cache.get(key)
        if cached and cached[0] > now:
            return cached[1]
        async with self._cache_lock:
            cached = self._cache.get(key)
            if cached and cached[0] > now:
                return cached[1]
            value = await fetch()
            self._cache[key] = (now + self.CACHE_TTL_SECONDS, value)
            return value

    async def autocomplete(self, input_text: str, client_id: str = "unknown") -> dict:
        async def fetch() -> dict:
            data = await self._request(
                "POST",
                self.PLACES_AUTOCOMPLETE_URL,
                headers={
                    "X-Goog-Api-Key": self.api_key,
                    "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
                },
                body={"input": input_text},
                client_id=client_id,
            )
            suggestions = []
            for item in data.get("suggestions", [])[:10]:
                prediction = item.get("placePrediction", {}) if isinstance(item, dict) else {}
                place_id = prediction.get("placeId")
                text = prediction.get("text", {}).get("text") if isinstance(prediction.get("text"), dict) else None
                if place_id and text:
                    suggestions.append({"place_id": place_id, "text": text})
            return {"suggestions": suggestions, "source": "Google Places API", "source_type": "provider"}

        return await self._cached(("autocomplete", input_text.casefold()), fetch)

    async def place(self, place_id: str, client_id: str = "unknown") -> dict:
        async def fetch() -> dict:
            data = await self._request(
                "GET",
                self.GEOCODE_PLACE_URL + quote(place_id, safe=""),
                headers={
                    "X-Goog-Api-Key": self.api_key,
                    "X-Goog-FieldMask": "results.place,results.formattedAddress,results.location",
                },
                client_id=client_id,
            )
            results = data.get("results", [])
            if not results or not isinstance(results[0], dict):
                raise LookupError("place not found")
            result = results[0]
            location = result.get("location", {})
            return {
                "place_id": place_id,
                "formatted_address": result.get("formattedAddress"),
                "location": {"latitude": location.get("latitude"), "longitude": location.get("longitude")},
                "source": "Google Geocoding API",
                "source_type": "provider",
            }

        return await self._cached(("place", place_id), fetch)

    async def route(self, origin: dict, destination: dict, client_id: str = "unknown") -> dict:
        async def fetch() -> dict:
            data = await self._request(
                "POST",
                self.ROUTES_URL,
                headers={
                    "X-Goog-Api-Key": self.api_key,
                    "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
                },
                body={
                    "origin": {"location": {"latLng": origin}},
                    "destination": {"location": {"latLng": destination}},
                    "travelMode": "DRIVE",
                },
                client_id=client_id,
            )
            routes = data.get("routes", [])
            if not routes or not isinstance(routes[0], dict):
                raise LookupError("candidate route not found")
            route = routes[0]
            return {
                "route_type": "candidate",
                "distance_meters": route.get("distanceMeters"),
                "duration": route.get("duration"),
                "encoded_polyline": route.get("polyline", {}).get("encodedPolyline"),
                "source": "Google Routes API",
                "source_type": "provider",
                "safety_disclaimer": "Candidate route only; it is not verified as flood-safe, open, or passable.",
            }

        key = ("route", origin["latitude"], origin["longitude"], destination["latitude"], destination["longitude"])
        return await self._cached(key, fetch)

    async def elevation(self, latitude: float, longitude: float, client_id: str = "unknown") -> dict:
        async def fetch() -> dict:
            data = await self._request(
                "GET",
                self.ELEVATION_URL,
                params={"locations": f"{latitude},{longitude}", "key": self.api_key},
                client_id=client_id,
            )
            results = data.get("results", [])
            if data.get("status") != "OK" or not results or not isinstance(results[0], dict):
                raise LookupError("elevation not found")
            result = results[0]
            return {
                "elevation_meters": result.get("elevation"),
                "resolution_meters": result.get("resolution"),
                "location": {"latitude": latitude, "longitude": longitude},
                "source": "Google Elevation API",
                "source_type": "model",
                "disclaimer": "Terrain elevation estimate only; this is not flood depth or water-surface elevation.",
            }

        return await self._cached(("elevation", latitude, longitude), fetch)
