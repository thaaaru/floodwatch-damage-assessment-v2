# SPDX-License-Identifier: Apache-2.0
"""Irrigation Dept river gauges: status, thresholds, trend, stale, upsert, DB-only reads."""
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select

from app.database import Base
from app.models import GaugeReading
from app.services import irrigation_fetcher as irr


def _engine(tmp_path):
    eng = create_engine(f"sqlite:///{tmp_path / 'g.db'}")
    Base.metadata.create_all(eng, tables=[Base.metadata.tables["gauge_readings"], Base.metadata.tables["gauge_stations"]])
    return eng


def _ms(dt):
    return int(dt.timestamp() * 1000)


NOW = datetime.now(timezone.utc).replace(microsecond=0)


def _reading(gauge, level, minutes_ago, pulls=(4, 6, 8), basin="Kalu Ganga"):
    return {"gauge": gauge, "basin": basin, "water_level": level, "rain_fall": 1.5,
            "EditDate": _ms(NOW - timedelta(minutes=minutes_ago)),
            "alertpull": pulls[0], "minorpull": pulls[1], "majorpull": pulls[2]}


STATIONS = [
    {"station": "Magura", "basin": "Kalu Ganga ", "latitude": 6.51, "longitude": 80.24, "Unit": "m",
     "Alert_Level": 4, "Minor_Flood_Level": 6, "Major_Flood_Level": 8},
    {"station": "Nagalagam Street", "basin": "Kelani Ganga", "latitude": 6.96, "longitude": 79.88, "Unit": "ft",
     "Alert_Level": 4, "Minor_Flood_Level": 5, "Major_Flood_Level": 7},
]


# --- status ----------------------------------------------------------------

@pytest.mark.parametrize("level,expected", [
    (3.9, "normal"), (4.0, "alert"), (6.0, "minor"), (7.99, "minor"), (8.0, "major"), (None, "unknown"),
])
def test_compute_status(level, expected):
    assert irr.compute_status(level, {"alert": 4, "minor": 6, "major": 8}) == expected


def test_status_unknown_without_thresholds_and_partial_thresholds():
    assert irr.compute_status(5.0, {"alert": None, "minor": None, "major": None}) == "unknown"
    assert irr.compute_status(5.0, {"alert": 4.75, "minor": None, "major": None}) == "alert"
    assert irr.compute_status(1.0, {"alert": 4.75, "minor": None, "major": None}) == "normal"


# --- threshold fallback order -------------------------------------------------

def test_threshold_fallback_order():
    reading = {"alert_m": 1.0, "minor_m": None, "major_m": 0}
    station = {"alert_m": 2.0, "minor_m": 3.0, "major_m": None}
    meta = {"alert_level_m": 9, "minor_flood_m": 9, "major_flood_m": 5.0}
    assert irr.resolve_thresholds(reading, station, meta) == {"alert": 1.0, "minor": 3.0, "major": 5.0}


def test_threshold_metadata_in_feet_is_converted():
    meta = {"alert_level_m": 4.0, "minor_flood_m": 5.0, "major_flood_m": 7.0, "unit": "ft"}
    th = irr.resolve_thresholds({}, None, meta)
    assert th["alert"] == pytest.approx(1.2192) and th["major"] == pytest.approx(2.1336)


def test_no_threshold_anywhere_is_none():
    assert irr.resolve_thresholds({}, {}, None) == {"alert": None, "minor": None, "major": None}


# --- trend and stale ------------------------------------------------------------

@pytest.mark.parametrize("levels,expected", [
    ([1.05, 1.02, 1.00], "rising"),     # +5 cm
    ([1.00, 1.02, 1.05], "falling"),    # -5 cm
    ([1.015, 1.01, 1.00], "steady"),    # +1.5 cm inside deadband
    ([1.02, 1.00], "steady"),           # exactly 2 cm -> steady
    ([1.03, 1.00], "rising"),
    ([1.0], None),
])
def test_trend_deadband(levels, expected):
    assert irr.compute_trend(levels) == expected


def test_stale():
    assert irr.is_stale(NOW - timedelta(hours=5, minutes=59), NOW) is False
    assert irr.is_stale(NOW - timedelta(hours=6, minutes=1), NOW) is True
    assert irr.is_stale(None, NOW) is True


# --- ingest / reads ---------------------------------------------------------------

def test_upsert_is_idempotent(tmp_path):
    f = irr.IrrigationFetcher(_engine(tmp_path))
    readings = [_reading("Magura", 2.9, 45), _reading("Magura", 2.95, 30), _reading("Magura", 3.0, 15)]
    f.ingest(readings, STATIONS)
    f.ingest(readings, STATIONS)
    with f.engine.connect() as c:
        assert c.execute(select(func.count()).select_from(GaugeReading.__table__)).scalar() == 3


def test_retention_drops_rows_older_than_30_days(tmp_path):
    f = irr.IrrigationFetcher(_engine(tmp_path))
    f.ingest([_reading("Magura", 2.0, 31 * 24 * 60), _reading("Magura", 2.1, 10)], STATIONS)
    assert len(f.get_history("Magura", days=30)) == 1


def test_get_gauges_latest_status_trend_and_feet_conversion(tmp_path):
    f = irr.IrrigationFetcher(_engine(tmp_path))
    f.ingest([
        _reading("Magura", 6.0, 45), _reading("Magura", 6.2, 30), _reading("Magura", 6.5, 15),
        _reading("Nagalagam Street", 5.5, 15, pulls=(4, 5, 7), basin="Kelani Ganga"),
        _reading("Ampara", 0.3, 8 * 60, pulls=(None, None, None), basin="Gal Oya"),
    ], STATIONS)
    g = {x["station"]: x for x in f.get_gauges()}
    assert set(g) == {"Magura", "Nagalagam Street", "Ampara"}
    assert g["Magura"]["water_level_m"] == 6.5 and g["Magura"]["status"] == "minor"
    assert g["Magura"]["trend"] == "rising" and g["Magura"]["stale"] is False
    assert g["Magura"]["lat"] == 6.51 and g["Magura"]["basin"] == "Kalu Ganga"
    # 5.5 ft = 1.676 m, minor threshold 5 ft = 1.524 m
    assert g["Nagalagam Street"]["water_level_m"] == pytest.approx(1.68, abs=0.01)
    assert g["Nagalagam Street"]["status"] == "minor"
    assert g["Ampara"]["status"] == "unknown" and g["Ampara"]["stale"] is True
    assert len(f.get_history("Magura")) == 3


def test_read_endpoints_never_call_upstream(tmp_path, monkeypatch):
    from app.main import app
    from app.services.irrigation_fetcher import irrigation_fetcher

    monkeypatch.setattr(irrigation_fetcher, "engine", _engine(tmp_path))
    irrigation_fetcher.ingest([_reading("Magura", 3.0, 15)], STATIONS)

    def boom(*a, **k):
        raise AssertionError("upstream HTTP call from a read endpoint")
    monkeypatch.setattr(httpx.AsyncClient, "send", boom)

    client = TestClient(app)
    r = client.get("/api/intel/irrigation")
    assert r.status_code == 200 and r.json()["count"] == 1
    assert r.json()["stations"][0]["status"] == "normal"
    assert client.get("/api/intel/irrigation/history/Magura").json()["readings"][0]["level_m"] == 3.0
    assert client.get("/api/intel/rivers").json()["count"] == 1
    assert client.post("/api/intel/irrigation/refresh").status_code == 200
    assert client.post("/api/intel/rivers/refresh").status_code == 200
