import asyncio
from datetime import datetime, timedelta, timezone

import httpx

from app.services.map_feeds import MapFacilitiesService, Rain24hService, parse_overpass_facilities, parse_rise_rainfall

NOW = datetime(2026, 10, 28, 7, 30, tzinfo=timezone.utc)

# Trimmed from a real https://risesrilanka.org/api/rainfall response (2026-10-28).
RISE = {
    "source": "Sri Lanka National Building Research Organisation rainfall network",
    "latest_observation_at": "2026-10-28T07:15:00+00:00",
    "count": 4,
    "stations": [
        {"id": "L02", "label": "Kotahera - Colombo", "name": "Kotahera", "district": "Colombo", "disabled": False,
         "current_mm": 10.8, "rain_24h_mm": 36.4, "lat": 6.9426, "lon": 80.22,
         "observed_at_utc": "2026-10-28T07:15:00+00:00", "freshness_status": "current"},
        {"id": "L15", "label": "Bogahakumbura - Badulla", "name": "Bogahakumbura", "district": "Badulla", "disabled": False,
         "current_mm": 0, "rain_24h_mm": 0, "lat": 6.8625, "lon": 80.8733,
         "observed_at_utc": "2026-10-09T04:31:00+00:00", "freshness_status": "stale"},
        {"id": "L99", "name": "Off", "disabled": True, "rain_24h_mm": 5, "lat": 7.0, "lon": 80.0},
        {"id": "L98", "name": "No coords", "disabled": False, "rain_24h_mm": 5, "lat": None, "lon": None},
    ],
}

# Trimmed from a real Overpass response for the Sri Lanka bbox.
OVERPASS = {"elements": [
    {"type": "node", "id": 1, "lat": 6.9171, "lon": 79.8667, "tags": {"amenity": "hospital", "name": "National Hospital", "phone": "+94 11 269 1111"}},
    {"type": "way", "id": 2, "center": {"lat": 7.29, "lon": 80.63}, "tags": {"amenity": "hospital", "name": "Teaching Hospital Kandy"}},
    {"type": "node", "id": 3, "lat": 6.9, "lon": 79.9, "tags": {"amenity": "hospital", "emergency": "emergency_ward_entrance"}},
    {"type": "node", "id": 4, "lat": 7.73, "lon": 81.68, "tags": {"amenity": "social_facility", "social_facility": "shelter", "name": "Dawooth Foundation"}},
    {"type": "relation", "id": 5, "tags": {"amenity": "hospital"}},
]}


def test_rise_rainfall_parsing_marks_old_stations_stale():
    rows = parse_rise_rainfall(RISE, NOW)
    assert [r["name"] for r in rows] == ["Kotahera", "Bogahakumbura"]
    assert rows[0] == {"name": "Kotahera", "district": "Colombo", "lat": 6.9426, "lon": 80.22, "rain_24h_mm": 36.4,
                       "observed_at": "2026-10-28T07:15:00+00:00", "stale": False}
    assert rows[1]["stale"] is True
    # Exactly 3 h is still fresh; a minute more is stale.
    edge = {"stations": [{**RISE["stations"][0], "observed_at_utc": (NOW - timedelta(hours=3)).isoformat()}]}
    assert parse_rise_rainfall(edge, NOW)[0]["stale"] is False
    edge["stations"][0]["observed_at_utc"] = (NOW - timedelta(hours=3, minutes=1)).isoformat()
    assert parse_rise_rainfall(edge, NOW)[0]["stale"] is True


def test_overpass_parsing_keeps_hospitals_and_shelters():
    rows = parse_overpass_facilities(OVERPASS)
    assert [(r["id"], r["kind"]) for r in rows] == [("node/1", "hospital"), ("way/2", "hospital"), ("node/4", "shelter")]
    assert rows[0]["phone"] == "+94 11 269 1111" and rows[1]["lat"] == 7.29


def test_feed_serves_last_good_as_stale_and_does_not_hammer_upstream():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(200, json=RISE)
        return httpx.Response(503)

    async def scenario():
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        service = Rain24hService(client=client)
        first = await service.get()
        assert first["stale"] is False and len(first["stations"]) == 2
        assert first["source"] == "RISE Sri Lanka (NBRO rain gauge network)"
        assert (await service.get()) is first and calls["n"] == 1  # cached
        service._tried_at -= timedelta(minutes=11)
        second = await service.get()
        assert second["stale"] is True and second["stations"] == first["stations"] and calls["n"] == 2
        await service.get()
        assert calls["n"] == 2  # a failure is not retried at once
        await client.aclose()
    asyncio.run(scenario())


def test_facilities_failure_without_last_good_is_empty_and_stale():
    async def scenario():
        client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(502)))
        result = await MapFacilitiesService(client=client, snapshot=None).get()
        assert result["stale"] is True and result["facilities"] == []
        assert "not an official evacuation centre list" in result["disclaimer"]
        await client.aclose()
    asyncio.run(scenario())


def test_facilities_failure_serves_bundled_snapshot():
    async def scenario():
        client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(406)))
        result = await MapFacilitiesService(client=client).get()
        assert result["stale"] is True and len(result["facilities"]) > 500
        assert result["retrieved_at"] and "not an official evacuation centre list" in result["disclaimer"]
        await client.aclose()
    asyncio.run(scenario())
