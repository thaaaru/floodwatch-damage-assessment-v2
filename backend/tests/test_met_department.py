# SPDX-License-Identifier: Apache-2.0
"""Regression tests for the measured Met Department bulletin."""
import asyncio

from app.services.met_department import MetDepartmentService, MetStation


class FailingMetDepartmentService(MetDepartmentService):
    def __init__(self) -> None:
        super().__init__()
        self.FALLBACK_BULLETIN_PATH = None
        self.LAST_GOOD_PATH = None
        self.fetch_count = 0

    async def _fetch_and_parse(self):
        self.fetch_count += 1
        raise RuntimeError("upstream unavailable")


def test_summary_reuses_failed_station_fetch_without_retrying():
    service = FailingMetDepartmentService()

    async def load():
        stations = await service.get_stations()
        summary = await service.get_summary(stations)
        return stations, summary

    stations, summary = asyncio.run(load())

    assert stations == []
    assert summary["station_count"] == 0
    assert service.fetch_count == 1


def test_failed_fetch_uses_bundled_measured_bulletin(tmp_path):
    snapshot = tmp_path / "3hourly.xlsx"
    snapshot.write_bytes(b"measured bulletin")
    station = MetStation(
        wmo_id=43466,
        name="Colombo",
        district="Colombo",
        latitude=6.9,
        longitude=79.9,
        report_time_utc="2026-10-25T06:00:00+00:00",
        rainfall_3h_mm=1.0,
        rainfall_since_830am_mm=2.0,
        temperature_c=28.0,
        relative_humidity_pct=80,
        weather_type="rain",
    )
    service = FailingMetDepartmentService()
    service.FALLBACK_BULLETIN_PATH = snapshot
    service._parse_workbook = lambda content: [station]

    stations = asyncio.run(service.get_stations())

    assert stations == [station]
    assert service.fetch_count == 1


def test_failed_fetch_backs_off_instead_of_retrying_every_request():
    service = FailingMetDepartmentService()

    async def load_twice():
        await service.get_stations()
        await service.get_stations()

    asyncio.run(load_twice())
    assert service.fetch_count == 1

    asyncio.run(service.get_stations(force_refresh=True))
    assert service.fetch_count == 2


def test_last_good_bulletin_survives_restart(tmp_path):
    """A bulletin fetched OK is saved; after a restart with the Met Dept down it is served."""
    class Resp:
        content = b"fresh bulletin"
        def raise_for_status(self): pass

    class Client:
        async def get(self, *a, **k): return Resp()

    station = MetStation(43466, "Colombo", "Colombo", 6.9, 79.9, "2026-10-30T06:00:00+00:00", 1.0, 2.0, 28.0, 80, "rain")
    up = MetDepartmentService()
    up.LAST_GOOD_PATH = tmp_path / "last_good.xlsx"
    up._parse_workbook = lambda content: [station] if content == b"fresh bulletin" else []
    async def client(): return Client()
    up._get_client = client
    assert asyncio.run(up.get_stations()) == [station]
    assert up.LAST_GOOD_PATH.read_bytes() == b"fresh bulletin"

    down = FailingMetDepartmentService()  # the restarted process, Met Dept unreachable
    down.LAST_GOOD_PATH = up.LAST_GOOD_PATH
    down._parse_workbook = up._parse_workbook
    assert asyncio.run(down.get_stations()) == [station]


def test_relay_upload_needs_token_and_a_real_bulletin(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    from app.config import get_settings
    from app.main import app
    from app.services.met_department import met_department_service as svc

    station = MetStation(43466, "Colombo", "Colombo", 6.9, 79.9, "2026-10-31T03:00:00+00:00", 1.0, 2.0, 28.0, 80, "rain")
    monkeypatch.setattr(svc, "LAST_GOOD_PATH", tmp_path / "last_good.xlsx")
    monkeypatch.setattr(svc, "_parse_workbook", lambda content: [station] if content == b"xlsx" else [])
    c, url = TestClient(app), "/api/weather/met-stations/upload"
    monkeypatch.setattr(get_settings(), "met_relay_token", "")
    assert c.post(url, content=b"xlsx", headers={"X-Relay-Token": "s3cret"}).status_code == 404  # off
    monkeypatch.setattr(get_settings(), "met_relay_token", "s3cret")
    assert c.post(url, content=b"xlsx", headers={"X-Relay-Token": "wrong"}).status_code == 401
    assert c.post(url, content=b"junk", headers={"X-Relay-Token": "s3cret"}).status_code == 422
    r = c.post(url, content=b"xlsx", headers={"X-Relay-Token": "s3cret"})
    assert r.status_code == 200 and r.json()["stations"] == 1
    assert (tmp_path / "last_good.xlsx").read_bytes() == b"xlsx"
    assert c.get("/api/weather/met-stations").json()["stations"][0]["name"] == "Colombo"
