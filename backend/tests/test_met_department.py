# SPDX-License-Identifier: Apache-2.0
"""Regression tests for the measured Met Department bulletin."""
import asyncio

from app.services.met_department import MetDepartmentService, MetStation


class FailingMetDepartmentService(MetDepartmentService):
    def __init__(self) -> None:
        super().__init__()
        self.FALLBACK_BULLETIN_PATH = None
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
