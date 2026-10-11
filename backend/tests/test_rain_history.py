# SPDX-License-Identifier: Apache-2.0
"""30-year rainfall context: % of normal, pro-rating, trend gate, DB-only reads."""
from datetime import date, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from app.database import Base
from app.services import rain_history as rh


def _days(start: date, end: date, mm):
    d, out = start, []
    while d <= end:
        out.append((d, mm(d) if callable(mm) else mm))
        d += timedelta(days=1)
    return out


def test_pct_of_normal_and_prorating():
    # October normal 310 mm; on 15 Oct the pro-rated normal is 310 * 15/31 = 150 mm
    assert rh.prorated_normal(310, date(2026, 10, 15)) == pytest.approx(150.0)
    assert rh.pct_of_normal(213, 150) == 142
    assert rh.pct_of_normal(5, 0) is None
    # February in a leap year has 29 days
    assert rh.prorated_normal(58, date(2024, 2, 10)) == pytest.approx(20.0)


def test_summary_uses_complete_normal_months_and_prorates_month_to_date():
    rows = _days(date(1996, 1, 1), date(2025, 12, 31), 10.0)          # 10 mm every day
    rows += _days(date(2026, 1, 1), date(2026, 10, 5), 20.0)           # this year: 20 mm/day
    s = rh.summarize(rows)
    assert s["as_of"] == "2026-10-05" and s["month"] == 10
    assert s["monthly_normals_mm"][9] == 310.0                         # 31 days x 10 mm
    assert s["monthly_normals_mm"][1] == 282.7                          # Feb: 8 leap years of 290 mm, 22 of 280
    assert s["mtd_mm"] == 100.0                                         # 5 days x 20 mm
    assert s["normal_to_date_mm"] == 50.0                               # 310 * 5/31
    assert s["pct_of_normal"] == 200
    assert len(s["annual_totals"]) == 30                               # 1996..2025 complete years
    assert s["wettest_days"][0]["mm"] == 20.0 and len(s["wettest_days"]) == 5


def test_trend_shown_only_when_ci_excludes_zero():
    rising = [(y, 2000 + 20 * (y - 1996) + (15 if y % 2 else -15)) for y in range(1996, 2026)]
    t = rh.linear_trend(rising)
    assert t["significant"] and t["ci_low"] > 0 and t["slope_mm_per_year"] == pytest.approx(20, abs=1)

    noisy = [(y, 2000 + (400 if y % 2 else -400) + (1 if y > 2010 else 0)) for y in range(1996, 2026)]
    t = rh.linear_trend(noisy)
    assert not t["significant"] and t["ci_low"] < 0 < t["ci_high"]
    assert rh.linear_trend(rising[:5]) is None                          # too few years


def test_missing_chunks_resume_after_last_stored_day(tmp_path):
    eng = create_engine(f"sqlite:///{tmp_path / 'r.db'}")
    Base.metadata.create_all(eng, tables=[Base.metadata.tables["rain_daily"]])
    svc = rh.RainHistory(eng, sleep_s=0)
    today = date(2026, 10, 11)
    chunks = svc.missing_chunks("Colombo", today)
    assert chunks[0] == (date(1996, 1, 1), date(1997, 12, 31)) and chunks[-1][1] == date(2026, 10, 10)
    svc.store("Colombo", _days(date(1996, 1, 1), date(2010, 6, 30), 1.0) + [(date(2010, 7, 1), None)])
    assert svc.missing_chunks("Colombo", today)[0][0] == date(2010, 7, 1)  # nulls are not stored


def test_read_endpoints_never_call_upstream(tmp_path, monkeypatch):
    from app.main import app

    eng = create_engine(f"sqlite:///{tmp_path / 'r.db'}")
    Base.metadata.create_all(eng, tables=[Base.metadata.tables["rain_daily"]])
    svc = rh.RainHistory(eng, sleep_s=0)
    as_of = date.today() - timedelta(days=5)
    svc.store("Ratnapura", _days(date(2020, 1, 1), as_of, 12.0))
    svc.store("Kandy", _days(date(1996, 1, 1), date(2005, 12, 31), 3.0))  # backfill still in progress
    monkeypatch.setattr(rh.rain_history, "engine", eng)
    monkeypatch.setattr(rh.rain_history, "_cache", {})

    def boom(*a, **k):
        raise AssertionError("upstream HTTP call from a read endpoint")
    monkeypatch.setattr(httpx.AsyncClient, "send", boom)

    client = TestClient(app)
    r = client.get("/api/rain-history/districts")
    assert r.status_code == 200 and "Not rain-gauge measurements" in r.json()["source"]
    by = {d["district"]: d for d in r.json()["districts"]}
    assert by["Ratnapura"]["mtd_mm"] == 12.0 * as_of.day and by["Colombo"]["as_of"] is None
    assert by["Kandy"]["as_of"] is None  # partial history is not shown as if it were current
    d = client.get("/api/rain-history/districts/Ratnapura").json()
    assert d["as_of"] == as_of.isoformat() and len(d["monthly_normals_mm"]) == 12
    assert client.get("/api/rain-history/districts/Atlantis").status_code == 404
