# SPDX-License-Identifier: Apache-2.0
"""OpenWeatherMap One Call: persistent daily budget guard and cache-only reads."""
import asyncio
from datetime import date

from sqlalchemy import create_engine

from app.database import Base
from app.services import openweathermap as owm


def _engine(tmp_path):
    eng = create_engine(f"sqlite:///{tmp_path / 'owm.db'}")
    Base.metadata.create_all(eng, tables=[Base.metadata.tables["owm_usage"], Base.metadata.tables["owm_cache"]])
    return eng


def test_guard_blocks_call_901(tmp_path):
    eng = _engine(tmp_path)
    day = date(2026, 10, 11)
    assert all(owm.reserve_call(eng, day, 900) for _ in range(900))
    assert owm.reserve_call(eng, day, 900) is False  # call 901
    assert owm.calls_used(eng, day) == 900
    assert owm.reserve_call(eng, date(2026, 10, 12), 900) is True  # new UTC day


def test_counter_survives_new_engine(tmp_path):
    day = date(2026, 10, 11)
    eng = _engine(tmp_path)
    for _ in range(900):
        owm.reserve_call(eng, day, 900)
    eng.dispose()
    assert owm.reserve_call(create_engine(f"sqlite:///{tmp_path / 'owm.db'}"), day, 900) is False


class _FakeClient:
    is_closed = False

    def __init__(self):
        self.calls = 0

    async def get(self, url, params=None):
        self.calls += 1
        raise AssertionError("must not reach OWM")


def test_exhausted_budget_serves_cache_and_flags_stale(tmp_path):
    eng = _engine(tmp_path)
    svc = owm.OpenWeatherMapService("k", db_engine=eng)
    client = _FakeClient()
    svc._http_client = client
    today = owm.datetime.now(owm.timezone.utc).date()
    for _ in range(owm.DAILY_CALL_BUDGET):
        owm.reserve_call(eng, today)

    asyncio.run(svc.refresh_all(force=True))

    assert client.calls == 0
    assert svc.is_stale() is True
    assert asyncio.run(svc.get_all_districts_early_warning()) == []


def test_reads_never_call_upstream(tmp_path):
    svc = owm.OpenWeatherMapService("k", db_engine=_engine(tmp_path))
    client = _FakeClient()
    svc._http_client = client
    asyncio.run(svc.get_all_districts_early_warning())
    asyncio.run(svc.get_district_early_warning("Colombo"))
    assert client.calls == 0


class _OkClient(_FakeClient):
    async def get(self, url, params=None):
        self.calls += 1

        class R:
            def raise_for_status(self):
                pass

            def json(self):
                return {"current": {}, "hourly": [], "daily": [], "alerts": []}
        return R()


def test_refresh_is_25_calls_persisted_and_not_repeated(tmp_path):
    eng = _engine(tmp_path)
    svc = owm.OpenWeatherMapService("k", db_engine=eng)
    svc._http_client = client = _OkClient()
    assert asyncio.run(svc.refresh_all()) is True
    assert client.calls == 25 and len(svc._results) == 25 and not svc.is_stale()

    # Restart: snapshot reloads from DB and a fresh snapshot is not re-fetched.
    svc2 = owm.OpenWeatherMapService("k", db_engine=eng)
    svc2._http_client = client2 = _OkClient()
    asyncio.run(svc2.refresh_all())
    assert client2.calls == 0 and len(asyncio.run(svc2.get_all_districts_early_warning())) == 25


def test_daily_call_arithmetic_within_guard():
    import math
    from app.config import OWM_LOCATIONS, get_settings

    interval = get_settings().owm_refresh_minutes
    assert len(OWM_LOCATIONS) == 25
    assert interval == 120
    assert len(OWM_LOCATIONS) * (1440 / interval) == 300
    assert len(OWM_LOCATIONS) * (1440 / interval) <= owm.DAILY_CALL_BUDGET
    # Worst case with restarts: runs are at least interval - 10 min apart.
    assert len(OWM_LOCATIONS) * math.ceil(1440 / owm.OpenWeatherMapService.MIN_REFRESH_AGE_MINUTES) <= owm.DAILY_CALL_BUDGET


def test_refresh_interval_floor_keeps_rate_under_guard():
    import pytest
    from pydantic import ValidationError
    from app.config import OWM_LOCATIONS, Settings

    with pytest.raises(ValidationError):
        Settings(owm_refresh_minutes=39)
    assert len(OWM_LOCATIONS) * (1440 / 40) <= owm.DAILY_CALL_BUDGET

