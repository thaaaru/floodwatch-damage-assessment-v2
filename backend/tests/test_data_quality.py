from datetime import datetime, timedelta, timezone

from app.services.data_quality import DataQuality

NOW = datetime(2026, 11, 8, 6, 0, tzinfo=timezone.utc)
MET = [
    {"name": "Colombo", "latitude": 6.9, "longitude": 79.87, "report_time_utc": "2026-11-08T03:00:00+00:00",
     "rainfall_since_830am_mm": 80.0, "rainfall_3h_mm": 20.0},
    {"name": "Bad", "latitude": 8.0, "longitude": 81.0, "report_time_utc": "2026-11-08T03:00:00+00:00",
     "rainfall_since_830am_mm": 900.0, "rainfall_3h_mm": -1.0},
]
NBRO = {"latest_observation_at": "2026-11-08T05:45:00+00:00", "stale": False, "stations": [
    {"name": "Near", "lat": 6.92, "lon": 79.9, "rain_24h_mm": 10.0, "stale": False},
    {"name": "Old", "lat": 6.91, "lon": 79.88, "rain_24h_mm": 200.0, "stale": True},
]}
GAUGES = [{"observed_at": "2026-11-08T05:30:00+00:00", "stale": False}]
ERA5 = [{"as_of": "2026-11-02"}, {"as_of": None}]


def test_flags_impossible_values_disagreement_and_frozen_feed():
    dq = DataQuality()
    r = dq.evaluate(MET, NBRO, GAUGES, ERA5, NOW)
    by = {s["source"]: s for s in r["sources"]}
    assert by["met"]["status"] == "warn" and len(by["met"]["issues"]) == 2
    assert by["nbro"]["status"] == "ok" and by["nbro"]["stale_count"] == 1
    assert by["rivers"]["status"] == "ok" and by["era5"]["lag_days"] == 6
    # Stale gauge ignored: Colombo 80 mm vs live Near 10 mm within 10 km.
    assert r["disagreements"] == [{"met": "Colombo", "met_mm": 80.0, "nbro": "Near", "nbro_24h_mm": 10.0, "gauges_within_km": 10}]

    later = dq.evaluate(MET, NBRO, GAUGES, ERA5, NOW + timedelta(hours=7))
    by = {s["source"]: s for s in later["sources"]}
    assert "values unchanged for 7 h" in by["nbro"]["issues"]
    assert any("h old" in i for i in by["nbro"]["issues"])


def test_empty_source_fails_and_dry_feed_may_sit_still():
    dq = DataQuality()
    dry = {**NBRO, "stations": [{**g, "rain_24h_mm": 0.0} for g in NBRO["stations"]]}
    dq.evaluate([], dry, [], [], NOW)
    r = dq.evaluate([], dry, [], [], NOW + timedelta(minutes=10))
    by = {s["source"]: s for s in r["sources"]}
    assert by["met"]["status"] == "fail" and by["rivers"]["status"] == "fail"
    assert by["nbro"]["issues"] == [] and by["era5"]["issues"] == ["no ERA5 history"]
