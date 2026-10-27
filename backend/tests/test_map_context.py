import asyncio

import httpx
from fastapi import Request
from fastapi.testclient import TestClient

from app.main import app
from app.services.map_context import GoogleMapsService
from app.config.rate_limit import get_client_identity


def test_google_maps_service_uses_official_hosts_fields_and_disclaimers():
    seen = []

    def upstream(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.host == "places.googleapis.com" and request.url.path.endswith(":autocomplete"):
            return httpx.Response(200, json={"suggestions": [{"placePrediction": {"placeId": "abc", "text": {"text": "Colombo"}}}]})
        if request.url.host == "geocode.googleapis.com":
            return httpx.Response(200, json={"results": [{"place": "places/abc", "formattedAddress": "Colombo", "location": {"latitude": 6.9271, "longitude": 79.8612}}]})
        if request.url.host == "routes.googleapis.com":
            return httpx.Response(200, json={"routes": [{"distanceMeters": 1000, "duration": "120s", "polyline": {"encodedPolyline": "xyz"}}]})
        return httpx.Response(200, json={"results": [{"elevation": 12.3, "location": {"lat": 6.9, "lng": 79.8}, "resolution": 9.5}], "status": "OK"})

    async def scenario():
        client = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        service = GoogleMapsService("server-key", client=client)
        assert (await service.autocomplete("Colombo"))["suggestions"][0]["place_id"] == "abc"
        assert (await service.place("abc"))["location"]["latitude"] == 6.9271
        route = await service.route({"latitude": 6.9, "longitude": 79.8}, {"latitude": 7.0, "longitude": 80.0})
        assert route["route_type"] == "candidate"
        assert "not verified as flood-safe" in route["safety_disclaimer"]
        elevation = await service.elevation(6.9, 79.8)
        assert elevation["source_type"] == "model"
        assert "not flood depth" in elevation["disclaimer"]
        await client.aclose()

    asyncio.run(scenario())
    assert [request.url.host for request in seen] == [
        "places.googleapis.com", "geocode.googleapis.com", "routes.googleapis.com", "maps.googleapis.com"
    ]
    assert seen[0].headers["x-goog-fieldmask"] == "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text"
    assert seen[2].headers["x-goog-fieldmask"] == "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline"


def test_google_endpoints_are_disabled_without_dedicated_key():
    client = TestClient(app)
    assert client.post("/api/map-context/places/autocomplete", json={"input": "Colombo"}).status_code == 503
    assert client.get("/api/map-context/places/abc").status_code == 503
    assert client.post("/api/map-context/route", json={
        "origin": {"latitude": 6.9, "longitude": 79.8},
        "destination": {"latitude": 7.0, "longitude": 80.0},
    }).status_code == 503
    assert client.get("/api/map-context/elevation?lat=6.9&lon=79.8").status_code == 503


def test_map_context_rejects_invalid_coordinates_and_inputs_before_upstream():
    client = TestClient(app)
    assert client.get("/api/map-context/weather?lat=91&lon=79.8").status_code == 422
    assert client.get("/api/map-context/elevation?lat=6.9&lon=181").status_code == 422
    assert client.post("/api/map-context/places/autocomplete", json={"input": " "}).status_code == 422
    assert client.get("/api/map-context/places/$").status_code == 422


def test_map_context_weather_is_open_meteo_model(monkeypatch):
    async def fake_weather(latitude, longitude):
        return {
            "location": {"latitude": latitude, "longitude": longitude},
            "weather": {"current": {"temperature": 27}},
            "source": "Open-Meteo",
            "source_type": "model",
        }

    monkeypatch.setattr("app.routers.map_context.weather_service.get", fake_weather)
    response = TestClient(app).get("/api/map-context/weather?lat=6.9&lon=79.8")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "Open-Meteo"
    assert body["source_type"] == "model"
    assert body["weather"]["current"]["temperature"] == 27


def test_map_context_response_cap_and_redirect_refusal():
    async def scenario():
        redirect = httpx.AsyncClient(transport=httpx.MockTransport(
            lambda request: httpx.Response(302, headers={"location": "https://example.com"})
        ))
        service = GoogleMapsService("server-key", client=redirect)
        try:
            await service.autocomplete("Colombo")
        except httpx.HTTPStatusError:
            pass
        else:
            raise AssertionError("redirect must be refused")
        await redirect.aclose()

        oversized = httpx.AsyncClient(transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                headers={"content-length": str(2 * 1024 * 1024 + 1)},
                content=b"{}",
            )
        ))
        service = GoogleMapsService("server-key", client=oversized)
        try:
            await service.elevation(6.9, 79.8)
        except ValueError as exc:
            assert "too large" in str(exc)
        else:
            raise AssertionError("oversized response must be refused")
        await oversized.aclose()

    asyncio.run(scenario())


def test_point_weather_is_cached_with_model_provenance():
    from app.services.map_context import PointWeatherService

    class FakeOpenMeteo:
        calls = 0

        async def get_weather(self, latitude, longitude):
            self.calls += 1
            return {"current": {"temperature": 27}}

    async def scenario():
        upstream = FakeOpenMeteo()
        service = PointWeatherService(upstream)
        first = await service.get(6.9, 79.8)
        second = await service.get(6.9, 79.8)
        assert upstream.calls == 1
        assert first == second
        assert first["source_type"] == "model"
        assert first["source"] == "Open-Meteo"

    asyncio.run(scenario())


def test_client_identity_rejects_direct_forwarded_spoof():
    request = Request({
        "type": "http",
        "headers": [(b"x-forwarded-for", b"198.51.100.9")],
        "client": ("203.0.113.7", 1234),
    })
    assert get_client_identity(request, "10.0.0.0/8") == "203.0.113.7"


def test_client_identity_accepts_forwarding_from_configured_proxy():
    request = Request({
        "type": "http",
        "headers": [(b"x-forwarded-for", b"198.51.100.9")],
        "client": ("10.1.2.3", 1234),
    })
    assert get_client_identity(request, "10.0.0.0/8") == "198.51.100.9"


def test_paid_budget_is_shared_across_endpoints_and_isolated_by_client():
    calls = []

    def upstream(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.url.host == "places.googleapis.com":
            return httpx.Response(200, json={"suggestions": []})
        if request.url.host == "geocode.googleapis.com":
            return httpx.Response(200, json={"results": [{
                "formattedAddress": "Colombo",
                "location": {"latitude": 6.9, "longitude": 79.8},
            }]})
        return httpx.Response(200, json={
            "results": [{"elevation": 10, "resolution": 5}],
            "status": "OK",
        })

    async def scenario():
        client = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        service = GoogleMapsService("server-key", client=client, client_daily_budget=2)
        await service.autocomplete("Colombo", "client-a")
        await service.place("abc", "client-a")
        try:
            await service.elevation(6.9, 79.8, "client-a")
        except RuntimeError as exc:
            assert "client daily" in str(exc)
        else:
            raise AssertionError("one client must not exceed its cross-endpoint budget")
        assert (await service.elevation(7.0, 80.0, "client-b"))["elevation_meters"] == 10
        assert len(calls) == 3
        await client.aclose()

    asyncio.run(scenario())
