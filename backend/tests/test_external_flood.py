import json
import asyncio
from datetime import datetime, timedelta, timezone

import httpx

from app.services.external_flood import ExternalFloodService
from app.services.google_floods import GoogleFloodsService, normalize_severity


def response(request: httpx.Request) -> httpx.Response:
    payloads = {
        "/api/gauges": {"record_count": 4, "last_updated_utc": "2026-10-26T10:00:00Z", "data_status": "available", "stale": False},
        "/api/rainfall": {"records": [{}, {}], "last_updated_utc": "2026-10-26T10:05:00Z", "data_status": "available"},
        "/api/flood-risk": {"record_count": 3, "generated_at": "2026-10-26T10:06:00Z", "data_status": "available_delayed", "status_message": "Delayed official observations"},
        "/api/alerts": {"items": [{}], "updated_at": "2026-10-26T10:04:00Z", "data_status": "available"},
        "/levels/latest": [{"timestamp": "2026-10-26 15:30:00"}, {"timestamp": "2026-10-26 15:30:00"}],
        "/alerts": [{"timestamp": "2026-10-26 15:30:00"}],
    }
    return httpx.Response(200, json=payloads[request.url.path])


def test_normalizes_and_keeps_sources_separate():
    async def scenario():
        client = httpx.AsyncClient(transport=httpx.MockTransport(response))
        snapshot = await ExternalFloodService(client=client).snapshot()
        assert [source["id"] for source in snapshot["sources"]] == ["rise-sri-lanka", "sl-flood-community", "google-flood-forecasting"]
        rise, community, google = snapshot["sources"]
        assert rise["summary"]["gauge_count"] == 4
        assert rise["summary"]["flood_risk_count"] == 3
        assert rise["summary"]["endpoint_statuses"]["flood-risk"]["data_status"] == "available_delayed"
        assert community["summary"] == {"latest_level_count": 2, "alert_count": 1, "stale": False}
        assert community["updated_at"] == "2026-10-26T15:30:00+05:30"
        assert "not an official DMC API" in community["attribution"]
        assert google["status"] == "disabled"
        assert snapshot["source_status_counts"] == {
            "ok": 1,
            "partial": 0,
            "stale": 1,
            "disabled": 1,
            "error": 0,
        }
        assert snapshot["oldest_usable_update_at"] == "2026-10-26T15:30:00+05:30"
        assert snapshot["newest_usable_update_at"] == "2026-10-26T10:05:00Z"
        await client.aclose()
    asyncio.run(scenario())


def test_stale_last_good_on_transient_failure():
    async def scenario():
        client = httpx.AsyncClient(transport=httpx.MockTransport(response))
        service = ExternalFloodService(client=client)
        first = await service.snapshot()
        service._cached_at = datetime.now(timezone.utc) - timedelta(hours=1)
        async def fail(_: str):
            raise httpx.ConnectError("offline")
        service._json = fail
        second = await service.snapshot()
        rise, community = second["sources"][:2]
        assert first["sources"][0]["summary"]["gauge_count"] == rise["summary"]["gauge_count"]
        assert rise["status"] == "stale" and rise["summary"]["stale"] is True
        assert community["status"] == "stale"
        await client.aclose()
    asyncio.run(scenario())


class NoCallGoogle:
    async def search_gauges_by_area(self):
        raise AssertionError("disabled source made an upstream call")
    async def search_latest_flood_status_by_area(self):
        raise AssertionError("disabled source made an upstream call")
    async def aclose(self):
        pass


def test_disabled_google_never_calls_upstream():
    async def scenario():
        source = await ExternalFloodService(google_api_key="", google_service=NoCallGoogle())._google_source()
        assert source["status"] == "disabled"
    asyncio.run(scenario())


def test_malformed_upstream_is_partial_not_merged():
    def malformed(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/rainfall":
            return httpx.Response(200, json=[])
        if request.url.path == "/alerts" and request.url.host == "lk-flood-api.vercel.app":
            return httpx.Response(200, json={"unexpected": True})
        if request.url.path == "/levels/latest":
            return httpx.Response(200, json=[{"timestamp": "not-a-date"}])
        return response(request)

    async def scenario():
        client = httpx.AsyncClient(transport=httpx.MockTransport(malformed))
        snapshot = await ExternalFloodService(client=client).snapshot()
        assert snapshot["sources"][0]["status"] == "partial"
        assert snapshot["sources"][1]["status"] == "partial"
        assert snapshot["sources"][1]["updated_at"] is None
        assert snapshot["source_status_counts"] == {
            "ok": 0,
            "partial": 2,
            "stale": 0,
            "disabled": 1,
            "error": 0,
        }
        assert snapshot["oldest_usable_update_at"] == "2026-10-26T10:00:00Z"
        assert snapshot["newest_usable_update_at"] == "2026-10-26T10:00:00Z"
        await client.aclose()
    asyncio.run(scenario())


def test_google_uses_official_v1_verbs_shapes_and_severity():
    seen = []
    def google_response(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.url.path, request.url.query, request.content))
        if request.url.path.endswith("searchGaugesByArea"):
            return httpx.Response(200, json={"gauges": [{"gaugeId": "g1"}]})
        if request.url.path.endswith("searchLatestFloodStatusByArea"):
            return httpx.Response(200, json={"floodStatuses": [{"gaugeId": "g1", "severity": "FLOOD_SEVERITY_SEVERE"}]})
        return httpx.Response(200, json={"gaugeForecasts": []})

    async def scenario():
        client = httpx.AsyncClient(transport=httpx.MockTransport(google_response))
        service = GoogleFloodsService("test-key", client=client)
        gauges = await service.search_gauges_by_area()
        statuses = await service.search_latest_flood_status_by_area()
        assert gauges[0]["gaugeId"] == "g1"
        assert normalize_severity(statuses[0]["severity"]) == "severe"
        assert [(method, path) for method, path, _, _ in seen] == [
            ("POST", "/v1/gauges:searchGaugesByArea"),
            ("POST", "/v1/floodStatus:searchLatestFloodStatusByArea"),
        ]
        assert json.loads(seen[0][3])["regionCode"] == "LK"
        await client.aclose()
    asyncio.run(scenario())


def test_google_enriched_response_joins_status_with_gauge_metadata():
    def google_response(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("searchGaugesByArea"):
            return httpx.Response(200, json={"gauges": [{
                "gaugeId": "g1",
                "riverName": "Kelani",
                "siteName": "Hanwella",
                "location": {"latitude": 6.9, "longitude": 80.1},
            }]})
        return httpx.Response(200, json={"floodStatuses": [{
            "gaugeId": "g1",
            "severity": "FLOOD_SEVERITY_ABOVE_NORMAL",
            "issuedTime": "2026-10-26T10:00:00Z",
        }]})

    async def scenario():
        client = httpx.AsyncClient(transport=httpx.MockTransport(google_response))
        result = await GoogleFloodsService("test-key", client=client).get_all_gauges_enriched()
        assert result["gauge_count"] == 1
        assert result["gauges"][0] == {
            "gauge_id": "g1",
            "severity": "above_normal",
            "river": "Kelani",
            "site_name": "Hanwella",
            "latitude": 6.9,
            "longitude": 80.1,
            "issued_time": "2026-10-26T10:00:00Z",
            "source_url": "https://sites.research.google/floods/",
            "raw_status": {
                "gaugeId": "g1",
                "severity": "FLOOD_SEVERITY_ABOVE_NORMAL",
                "issuedTime": "2026-10-26T10:00:00Z",
            },
            "raw_meta": {
                "gaugeId": "g1",
                "riverName": "Kelani",
                "siteName": "Hanwella",
                "location": {"latitude": 6.9, "longitude": 80.1},
            },
        }
        await client.aclose()

    asyncio.run(scenario())
