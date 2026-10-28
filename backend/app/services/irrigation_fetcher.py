# SPDX-License-Identifier: Apache-2.0

"""
Irrigation Department river gauges (public ArcGIS, no key).

  - Readings:  gauges_2_view      (append-only, rolling ~7 days, ~40 gauges)
  - Stations:  hydrostations      (location, basin, Alert/Minor/Major levels, unit)

A scheduler job (sync_gauges, every 15 min) pulls readings into Postgres
(gauge_readings, unique on gauge+observed_at), backfilling the whole ~7-day
layer when the table is empty, and prunes rows older than 30 days. Every read
path (get_gauges / get_history and the legacy helpers below) reads the DB only,
so when upstream is down the last stored data is served and marked stale.

All levels and thresholds are stored in metres; stations whose unit is "ft"
(Nagalagam Street) are converted on ingest.
"""
import logging
import statistics
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.engine import Engine

from ..database import engine as default_engine
from ..models import GaugeReading, GaugeStation

logger = logging.getLogger(__name__)

ARCGIS_BASE = "https://services3.arcgis.com/J7ZFXmR8rSmQ3FGf/arcgis/rest/services"
ARCGIS_URL = f"{ARCGIS_BASE}/gauges_2_view/FeatureServer/0/query"
HYDROSTATIONS_URL = f"{ARCGIS_BASE}/hydrostations/FeatureServer/0/query"

FT_TO_M = 0.3048
STALE_AFTER = timedelta(hours=6)
TREND_DEADBAND_M = 0.02
RETENTION = timedelta(days=30)
RATE_WINDOW = timedelta(hours=6)  # rate of rise: least-squares over readings this close to the latest
RATE_READINGS = 6                 # ... at most this many, at least 3
ETA_MAX_H = 48                    # beyond this a straight-line extrapolation means nothing
PAGE_SIZE = 1000  # layer maxRecordCount

# Station metadata with flood thresholds and coordinates
# From: https://raw.githubusercontent.com/nuuuwan/lk_irrigation/main/data/static/stations.json
STATION_METADATA = {
    "Glencourse": {
        "river": "Kelani Ganga",
        "district_ids": ["LK-11", "LK-12", "LK-92"],
        "lat": 6.975736673046383,
        "lon": 80.18660711562987,
        "alert_level_m": 15.0,
        "minor_flood_m": 16.5,
        "major_flood_m": 19.0,
    },
    "Hanwella": {
        "river": "Kelani Ganga",
        "district_ids": ["LK-11", "LK-12"],
        "lat": 6.909166666666667,
        "lon": 80.08194444444445,
        "alert_level_m": 5.5,   # DMC Official
        "minor_flood_m": 6.5,   # DMC Official: Minor Flood at 6.5m
        "major_flood_m": 10.0,  # DMC Official: Major Flood at 10.0m
    },
    "Nagalagam Street": {
        "river": "Kelani Ganga",
        "district_ids": ["LK-11", "LK-12"],
        "lat": 6.96027242132317,
        "lon": 79.87858326530204,
        # DMC Official thresholds (in feet - station measures and displays in feet)
        # Alert: 4.00 ft, Minor Flood: 5.00 ft, Major Flood: 7.00 ft
        "alert_level_m": 4.0,      # 4.00 ft (kept in feet, not meters)
        "minor_flood_m": 5.0,      # 5.00 ft (kept in feet, not meters)
        "major_flood_m": 7.0,      # 7.00 ft (kept in feet, not meters)
        "unit": "ft",  # This station reports in feet - DO NOT convert
    },
    "Kithulgala": {
        "river": "Kelani Ganga",
        "district_ids": ["LK-92"],
        "lat": 6.989722222222222,
        "lon": 80.41027777777778,
        "alert_level_m": 7.0,   # DMC Official
        "minor_flood_m": 8.5,   # DMC Official: Minor Flood at 8.5m
        "major_flood_m": 10.0,  # No DMC major flood defined, using estimate
    },
    "Holombuwa": {
        "river": "Kelani Ganga",
        "district_ids": ["LK-92"],
        "lat": 7.037777777777778,
        "lon": 80.26472222222222,
        "alert_level_m": 3.5,   # DMC Official
        "minor_flood_m": 4.5,   # DMC Official: Minor Flood at 4.5m
        "major_flood_m": 6.0,   # No DMC major flood defined, using estimate
    },
    "Deraniyagala": {
        "river": "Seethawaka Ganga",
        "district_ids": ["LK-92"],
        "lat": 6.9513888888888884,
        "lon": 80.33861111111111,
        "alert_level_m": 2.5,
        "minor_flood_m": 3.0,
        "major_flood_m": 4.0,
    },
    "Norwood": {
        "river": "Kehelgamu Oya",
        "district_ids": ["LK-23"],
        "lat": 6.835555555555556,
        "lon": 80.61416666666667,
        "alert_level_m": 2.0,
        "minor_flood_m": 2.5,
        "major_flood_m": 3.5,
    },
    "Ellagawa": {
        "river": "Kalu Ganga",
        "district_ids": ["LK-91", "LK-13"],
        "lat": 6.730399127799353,
        "lon": 80.21307042256922,
        "alert_level_m": 10.0,
        "minor_flood_m": 10.7,
        "major_flood_m": 12.2,
    },
    "Putupaula": {
        "river": "Kalu Ganga",
        "district_ids": ["LK-91"],
        "lat": 6.528611111111111,
        "lon": 80.05583333333334,
        "alert_level_m": 3.0,
        "minor_flood_m": 3.5,
        "major_flood_m": 4.5,
    },
    "Ratnapura": {
        "river": "Kalu Ganga",
        "district_ids": ["LK-91"],
        "lat": 6.681944444444444,
        "lon": 80.40527777777778,
        "alert_level_m": 6.0,
        "minor_flood_m": 7.0,
        "major_flood_m": 9.0,
    },
    "Millakanda": {
        "river": "Kalu Ganga",
        "district_ids": ["LK-91", "LK-13"],
        "lat": 6.601388888888889,
        "lon": 80.18027777777778,
        "alert_level_m": 4.0,
        "minor_flood_m": 5.0,
        "major_flood_m": 6.5,
    },
    "Kalawellawa": {
        "river": "Kuda Ganga",
        "district_ids": ["LK-91"],
        "lat": 6.526944444444444,
        "lon": 80.34194444444445,
        "alert_level_m": 2.5,
        "minor_flood_m": 3.0,
        "major_flood_m": 4.0,
    },
    "Thalgahagoda": {
        "river": "Nilwala Ganga",
        "district_ids": ["LK-32"],
        "lat": 6.1,  # Approximate - needs exact coordinates
        "lon": 80.45,  # Approximate - needs exact coordinates
        "alert_level_m": 1.4,   # Navy Official
        "minor_flood_m": 1.7,   # Navy Official
        "major_flood_m": 2.8,   # Navy Official
    },
    "Pitabeddara": {
        "river": "Nilwala Ganga",
        "district_ids": ["LK-32"],
        "lat": 6.198611111111111,
        "lon": 80.47527777777778,
        "alert_level_m": 4.0,   # Navy Official
        "minor_flood_m": 5.0,   # Navy Official
        "major_flood_m": 6.5,   # Navy Official (updated from 6.0)
    },
    "Panadugama": {
        "river": "Nilwala Ganga",
        "district_ids": ["LK-32"],
        "lat": 6.032777777777778,
        "lon": 80.51416666666667,
        "alert_level_m": 5.0,   # Navy Official (updated from 3.5)
        "minor_flood_m": 6.0,   # Navy Official (updated from 4.0)
        "major_flood_m": 7.5,   # Navy Official (updated from 5.0)
    },
    "Urawa": {
        "river": "Nilwala Ganga",
        "district_ids": ["LK-32"],
        "lat": 5.996388888888889,
        "lon": 80.54944444444445,
        "alert_level_m": 2.5,   # Navy Official (updated from 3.0)
        "minor_flood_m": 4.0,   # Navy Official (updated from 3.5)
        "major_flood_m": 6.0,   # Navy Official (updated from 4.5)
    },
    "Baddegama": {
        "river": "Gin Ganga",
        "district_ids": ["LK-31"],
        "lat": 6.189722222222222,
        "lon": 80.19833333333333,
        "alert_level_m": 4.0,
        "minor_flood_m": 5.0,
        "major_flood_m": 6.5,
    },
    "Tawalama": {
        "river": "Gin Ganga",
        "district_ids": ["LK-31"],
        "lat": 6.337777777777778,
        "lon": 80.30861111111111,
        "alert_level_m": 5.0,
        "minor_flood_m": 6.0,
        "major_flood_m": 7.5,
    },
    "Agaliya": {
        "river": "Gin Ganga",
        "district_ids": ["LK-31"],
        "lat": 6.103055555555556,
        "lon": 80.16305555555556,
        "alert_level_m": 2.5,
        "minor_flood_m": 3.0,
        "major_flood_m": 4.0,
    },
    "Magura": {
        "river": "Maha Oya",
        "district_ids": ["LK-12"],
        "lat": 7.198611111111111,
        "lon": 79.94833333333333,
        "alert_level_m": 3.0,
        "minor_flood_m": 3.5,
        "major_flood_m": 4.5,
    },
    "Dunamale": {
        "river": "Attanagalu Oya",
        "district_ids": ["LK-12"],
        "lat": 7.1325,
        "lon": 79.97916666666667,
        "alert_level_m": 3.0,
        "minor_flood_m": 3.5,
        "major_flood_m": 4.5,
    },
    "Colombo": {
        "river": "Colombo Lake",
        "district_ids": ["LK-11"],
        "lat": 6.915833333333333,
        "lon": 79.86472222222222,
        "alert_level_m": 0.6,
        "minor_flood_m": 0.8,
        "major_flood_m": 1.0,
    },
    "Thimbirigasyaya": {
        "river": "Wellawatta Canal",
        "district_ids": ["LK-11"],
        "lat": 6.893888888888889,
        "lon": 79.8675,
        "alert_level_m": 0.6,
        "minor_flood_m": 0.8,
        "major_flood_m": 1.0,
    },
    "Ingiriya": {
        "river": "Wak Oya",
        "district_ids": ["LK-13"],
        "lat": 6.715277777777778,
        "lon": 80.13611111111111,
        "alert_level_m": 2.5,
        "minor_flood_m": 3.0,
        "major_flood_m": 4.0,
    },
    "Manampitiya": {
        "river": "Mahaweli Ganga",
        "district_ids": ["LK-72"],
        "lat": 7.865277777777778,
        "lon": 81.11361111111111,
        "alert_level_m": 10.0,
        "minor_flood_m": 11.0,
        "major_flood_m": 13.0,
    },
    "Peradeniya": {
        "river": "Mahaweli Ganga",
        "district_ids": ["LK-21"],
        "lat": 7.258055555555556,
        "lon": 80.59472222222222,
        "alert_level_m": 5.0,
        "minor_flood_m": 6.0,
        "major_flood_m": 7.5,
    },
    "Weragantota": {
        "river": "Mahaweli Ganga",
        "district_ids": ["LK-22"],
        "lat": 7.34,
        "lon": 80.96638888888889,
        "alert_level_m": 8.0,
        "minor_flood_m": 9.0,
        "major_flood_m": 11.0,
    },
    "Nawalapitiya": {
        "river": "Mahaweli Ganga",
        "district_ids": ["LK-21"],
        "lat": 7.05,
        "lon": 80.53333333333333,
        "alert_level_m": 4.0,
        "minor_flood_m": 5.0,
        "major_flood_m": 6.5,
    },
    "Thaldena": {
        "river": "Badulu Oya",
        "district_ids": ["LK-81"],
        "lat": 6.995,
        "lon": 81.03333333333333,
        "alert_level_m": 4.0,
        "minor_flood_m": 5.0,
        "major_flood_m": 6.0,
    },
    "Wellawaya": {
        "river": "Menik Ganga",
        "district_ids": ["LK-82"],
        "lat": 6.736388888888889,
        "lon": 81.10305555555556,
        "alert_level_m": 2.0,
        "minor_flood_m": 2.5,
        "major_flood_m": 3.5,
    },
    "Kataragama": {
        "river": "Menik Ganga",
        "district_ids": ["LK-82"],
        "lat": 6.416388888888889,
        "lon": 81.33166666666666,
        "alert_level_m": 3.0,
        "minor_flood_m": 3.5,
        "major_flood_m": 4.5,
    },
    "Thanamalwila": {
        "river": "Kirindi Oya",
        "district_ids": ["LK-82"],
        "lat": 6.443888888888889,
        "lon": 81.12694444444444,
        "alert_level_m": 2.5,
        "minor_flood_m": 3.0,
        "major_flood_m": 4.0,
    },
    "Hulandawa": {
        "river": "Walawe Ganga",
        "district_ids": ["LK-91"],
        "lat": 6.419166666666667,
        "lon": 80.77305555555555,
        "alert_level_m": 5.0,
        "minor_flood_m": 6.0,
        "major_flood_m": 7.5,
    },
    "Moraketiya": {
        "river": "Walawe Ganga",
        "district_ids": ["LK-33"],
        "lat": 6.309722222222222,
        "lon": 80.84638888888889,
        "alert_level_m": 4.0,
        "minor_flood_m": 5.0,
        "major_flood_m": 6.5,
    },
    "Panapitiya": {
        "river": "Walawe Ganga",
        "district_ids": ["LK-33"],
        "lat": 6.165,
        "lon": 80.86333333333333,
        "alert_level_m": 3.0,
        "minor_flood_m": 3.5,
        "major_flood_m": 4.5,
    },
    "Embilipitiya": {
        "river": "Walawe Ganga",
        "district_ids": ["LK-91"],
        "lat": 6.333888888888889,
        "lon": 80.85027777777778,
        "alert_level_m": 4.0,
        "minor_flood_m": 5.0,
        "major_flood_m": 6.5,
    },
    "Kaluganga": {
        "river": "Kumbukkan Oya",
        "district_ids": ["LK-82"],
        "lat": 6.613611111111112,
        "lon": 81.36333333333333,
        "alert_level_m": 3.0,
        "minor_flood_m": 3.5,
        "major_flood_m": 4.5,
    },
    "Padiyatalawa": {
        "river": "Heda Oya",
        "district_ids": ["LK-52"],
        "lat": 7.385555555555555,
        "lon": 81.20555555555555,
        "alert_level_m": 3.0,
        "minor_flood_m": 3.5,
        "major_flood_m": 4.5,
    },
    "Rathkinda": {
        "river": "Maduru Oya",
        "district_ids": ["LK-72"],
        "lat": 7.582222222222222,
        "lon": 81.14611111111111,
        "alert_level_m": 4.0,
        "minor_flood_m": 5.0,
        "major_flood_m": 6.5,
    },
    "Puttalam Lagoon": {
        "river": "Puttalam Lagoon",
        "district_ids": ["LK-62"],
        "lat": 8.033333333333333,
        "lon": 79.83333333333333,
        "alert_level_m": 0.5,
        "minor_flood_m": 0.7,
        "major_flood_m": 1.0,
    },
}

# District ID to name mapping
DISTRICT_MAP = {
    "LK-11": "Colombo",
    "LK-12": "Gampaha",
    "LK-13": "Kalutara",
    "LK-21": "Kandy",
    "LK-22": "Matale",
    "LK-23": "Nuwara Eliya",
    "LK-31": "Galle",
    "LK-32": "Matara",
    "LK-33": "Hambantota",
    "LK-41": "Jaffna",
    "LK-42": "Kilinochchi",
    "LK-43": "Mannar",
    "LK-44": "Vavuniya",
    "LK-45": "Mullaitivu",
    "LK-51": "Batticaloa",
    "LK-52": "Ampara",
    "LK-53": "Trincomalee",
    "LK-61": "Kurunegala",
    "LK-62": "Puttalam",
    "LK-71": "Anuradhapura",
    "LK-72": "Polonnaruwa",
    "LK-81": "Badulla",
    "LK-82": "Monaragala",
    "LK-91": "Ratnapura",
    "LK-92": "Kegalle",
}


# ---------------------------------------------------------------------------
# Pure helpers (unit-tested)
# ---------------------------------------------------------------------------

def _num(v) -> Optional[float]:
    """Positive float or None (ArcGIS uses null/0 for 'not defined')."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None


def resolve_thresholds(reading: dict, station: Optional[dict], metadata: Optional[dict]) -> dict:
    """Per level: reading (alertpull...) -> hydrostations -> STATION_METADATA. Metres, None if missing."""
    meta = metadata or {}
    meta_scale = FT_TO_M if meta.get("unit") == "ft" else 1.0
    fallback = {
        "alert": _num(meta.get("alert_level_m")),
        "minor": _num(meta.get("minor_flood_m")),
        "major": _num(meta.get("major_flood_m")),
    }
    out = {}
    for key in ("alert", "minor", "major"):
        meta_val = fallback[key] * meta_scale if fallback[key] else None
        out[key] = _num(reading.get(f"{key}_m")) or _num((station or {}).get(f"{key}_m")) or meta_val
    return out


def compute_status(level: Optional[float], thresholds: dict) -> str:
    """normal / alert / minor / major, or unknown when there is no level or no threshold."""
    if level is None or not any(thresholds.get(k) for k in ("alert", "minor", "major")):
        return "unknown"
    for key in ("major", "minor", "alert"):
        t = thresholds.get(key)
        if t is not None and level >= t:
            return key
    return "normal"


def compute_trend(levels_newest_first: list) -> Optional[str]:
    """rising / falling / steady from the last (up to) 3 readings, +/-2 cm deadband."""
    levels = [l for l in levels_newest_first[:3] if l is not None]
    if len(levels) < 2:
        return None
    delta = round(levels[0] - levels[-1], 3)  # mm; avoids float noise at the deadband edge
    if delta > TREND_DEADBAND_M:
        return "rising"
    if delta < -TREND_DEADBAND_M:
        return "falling"
    return "steady"


def rise_rate(readings_newest_first: list) -> Optional[float]:
    """m/h: least-squares slope over the last 3-6 (observed_at, level) readings within RATE_WINDOW of the latest."""
    pts = [(_utc(t), l) for t, l in readings_newest_first[:RATE_READINGS] if t is not None and l is not None]
    if not pts:
        return None
    pts = [((t - pts[0][0]).total_seconds() / 3600, l) for t, l in pts if pts[0][0] - t <= RATE_WINDOW]
    if len(pts) < 3:
        return None
    xs, ys = zip(*pts)
    return statistics.linear_regression(xs, ys).slope  # x distinct: readings are unique per observed_at


def eta_next_threshold(level: Optional[float], rate: Optional[float], thresholds: dict) -> Optional[dict]:
    """Next threshold above the level and hours to reach it at a constant rate; None past major or > ETA_MAX_H."""
    if level is None or rate is None or rate <= 0:
        return None
    for key in ("alert", "minor", "major"):
        t = thresholds.get(key)
        if t is not None and level < t:
            hours = (t - level) / rate
            return {"level": key, "hours": round(hours, 1)} if hours <= ETA_MAX_H else None
    return None


def is_stale(observed_at: Optional[datetime], now: Optional[datetime] = None) -> bool:
    if observed_at is None:
        return True
    now = now or datetime.now(timezone.utc)
    return now - _utc(observed_at) > STALE_AFTER


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _metadata_for(name: str) -> Optional[dict]:
    meta = STATION_METADATA.get(name)
    if meta:
        return meta
    for key, m in STATION_METADATA.items():
        if key.lower() in name.lower() or name.lower() in key.lower():
            return m
    return None


def _insert(engine: Engine, table):
    if engine.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    return insert(table)


class IrrigationFetcher:
    """Irrigation Dept gauges: scheduler-side sync into Postgres, DB-only reads."""

    def __init__(self, db_engine: Optional[Engine] = None):
        self.engine = db_engine or default_engine

    # ------------------------------------------------------------------
    # Ingest (scheduler only)
    # ------------------------------------------------------------------

    @staticmethod
    async def _query_all(client: httpx.AsyncClient, url: str, params: dict) -> list[dict]:
        """Paged ArcGIS query -> list of feature attributes."""
        out: list[dict] = []
        offset = 0
        while True:
            resp = await client.get(url, params={**params, "resultOffset": offset,
                                                 "resultRecordCount": PAGE_SIZE, "f": "json"})
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise RuntimeError(f"ArcGIS error: {data['error']}")
            feats = data.get("features", [])
            out.extend(f.get("attributes", {}) for f in feats)
            if not data.get("exceededTransferLimit") or not feats:
                return out
            offset += len(feats)

    def ingest(self, readings: list[dict], stations: list[dict]) -> int:
        """Upsert hydrostations and readings (idempotent). Returns readings offered."""
        units: dict[str, str] = {}
        with self.engine.begin() as conn:
            for st in stations:
                name = (st.get("station") or "").strip()
                if not name:
                    continue
                unit = (st.get("Unit") or "m").strip().lower()
                units[name] = unit
                k = FT_TO_M if unit == "ft" else 1.0
                row = {
                    "gauge": name,
                    "basin": (st.get("basin") or "").strip() or None,
                    "lat": st.get("latitude"),
                    "lon": st.get("longitude"),
                    "unit": unit,
                    "alert_m": (_num(st.get("Alert_Level")) or 0) * k or None,
                    "minor_m": (_num(st.get("Minor_Flood_Level")) or 0) * k or None,
                    "major_m": (_num(st.get("Major_Flood_Level")) or 0) * k or None,
                }
                stmt = _insert(self.engine, GaugeStation.__table__).values(**row)
                conn.execute(stmt.on_conflict_do_update(
                    index_elements=["gauge"], set_={c: stmt.excluded[c] for c in row if c != "gauge"}))

            if not units:  # stations call failed: fall back to stored units
                units = {g: u for g, u in conn.execute(select(GaugeStation.gauge, GaugeStation.unit))}

            rows = []
            for r in readings:
                name = (r.get("gauge") or "").strip()
                edit = r.get("EditDate")
                if not name or not edit:
                    continue
                unit = units.get(name) or (_metadata_for(name) or {}).get("unit", "m")
                k = FT_TO_M if unit == "ft" else 1.0
                level = r.get("water_level")
                rows.append({
                    "gauge": name,
                    "basin": (r.get("basin") or "").strip() or None,
                    "level_m": round(level * k, 3) if level is not None else None,
                    "rainfall_mm": r.get("rain_fall"),
                    "alert_m": (_num(r.get("alertpull")) or 0) * k or None,
                    "minor_m": (_num(r.get("minorpull")) or 0) * k or None,
                    "major_m": (_num(r.get("majorpull")) or 0) * k or None,
                    "observed_at": datetime.fromtimestamp(edit / 1000, tz=timezone.utc),
                })
            for i in range(0, len(rows), 500):
                stmt = _insert(self.engine, GaugeReading.__table__).values(rows[i:i + 500])
                conn.execute(stmt.on_conflict_do_nothing(index_elements=["gauge", "observed_at"]))

            conn.execute(delete(GaugeReading).where(
                GaugeReading.observed_at < datetime.now(timezone.utc) - RETENTION))
        return len(rows)

    async def sync_gauges(self) -> int:
        """Fetch upstream and store. Backfills the whole layer (~7 days) when the table is empty."""
        with self.engine.connect() as conn:
            empty = conn.execute(select(func.count()).select_from(GaugeReading.__table__)).scalar() == 0
        since = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")
        where = "1=1" if empty else f"EditDate >= TIMESTAMP '{since}'"
        async with httpx.AsyncClient(timeout=60.0) as client:
            readings = await self._query_all(client, ARCGIS_URL, {
                "where": where,
                "outFields": "gauge,basin,water_level,rain_fall,EditDate,alertpull,minorpull,majorpull",
                "orderByFields": "objectid ASC",
            })
            try:
                stations = await self._query_all(client, HYDROSTATIONS_URL, {"where": "1=1", "outFields": "*"})
            except Exception as e:
                logger.warning(f"hydrostations fetch failed, using stored stations: {e}")
                stations = []
        n = self.ingest(readings, stations)
        logger.info(f"Gauges synced: {n} readings ({'backfill' if empty else 'last 24h'}), {len(stations)} stations")
        return n

    # ------------------------------------------------------------------
    # Reads (DB only, never upstream)
    # ------------------------------------------------------------------

    def get_gauges(self) -> list[dict]:
        """Latest reading per gauge with status, trend, stale flag and, when rising, time to the next threshold."""
        ranked = select(
            *GaugeReading.__table__.c,
            func.row_number().over(partition_by=GaugeReading.gauge,
                                   order_by=GaugeReading.observed_at.desc()).label("rn"),
        ).subquery()
        with self.engine.connect() as conn:
            rows = conn.execute(select(ranked).where(ranked.c.rn <= RATE_READINGS)
                                .order_by(ranked.c.gauge, ranked.c.rn)).mappings().all()
            stations = {r["gauge"]: dict(r) for r in conn.execute(select(GaugeStation.__table__)).mappings()}

        by_gauge: dict[str, list] = {}
        for r in rows:
            by_gauge.setdefault(r["gauge"], []).append(r)

        now = datetime.now(timezone.utc)
        out = []
        for name, recent in by_gauge.items():
            latest = recent[0]
            station = stations.get(name)
            meta = _metadata_for(name)
            th = resolve_thresholds(dict(latest), station, meta)
            level = latest["level_m"]
            observed = _utc(latest["observed_at"])
            lat = (station or {}).get("lat") or (meta or {}).get("lat")
            lon = (station or {}).get("lon") or (meta or {}).get("lon")
            district_ids = (meta or {}).get("district_ids", [])
            pct = lambda t: round(level / t * 100, 1) if (level is not None and t) else None
            trend = compute_trend([r["level_m"] for r in recent])
            stale = is_stale(observed, now)
            rate = rise_rate([(r["observed_at"], r["level_m"]) for r in recent]) if trend == "rising" and not stale else None
            rate = rate if rate is not None and rate > 0 else None
            out.append({
                "station": name,
                "basin": latest["basin"] or (station or {}).get("basin"),
                "river": latest["basin"] or (station or {}).get("basin") or (meta or {}).get("river"),
                "lat": lat,
                "lon": lon,
                "districts": [DISTRICT_MAP.get(d, d) for d in district_ids],
                "district_ids": district_ids,
                "water_level_m": round(level, 2) if level is not None else None,
                "rainfall_mm": latest["rainfall_mm"],
                "alert_level_m": th["alert"],
                "minor_flood_level_m": th["minor"],
                "major_flood_level_m": th["major"],
                "status": compute_status(level, th),
                "trend": trend,
                "stale": stale,
                "observed_at": observed.isoformat(),
                "last_updated": observed.isoformat(),
                "pct_to_alert": pct(th["alert"]),
                "pct_to_minor_flood": pct(th["minor"]),
                "pct_to_major_flood": pct(th["major"]),
                "rise_rate_m_per_h": round(rate, 3) if rate is not None else None,
                "eta_next_threshold": eta_next_threshold(level, rate, th),
            })
        return sorted(out, key=lambda g: g["station"])

    def get_history(self, gauge: str, days: int = 7) -> list[dict]:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        with self.engine.connect() as conn:
            rows = conn.execute(
                select(GaugeReading.observed_at, GaugeReading.level_m)
                .where(GaugeReading.gauge == gauge, GaugeReading.observed_at >= since)
                .order_by(GaugeReading.observed_at)
            ).all()
        return [{"observed_at": _utc(t).isoformat(), "level_m": l} for t, l in rows]

    # ------------------------------------------------------------------
    # Legacy helpers (flood threat, intel, river provider) - DB-backed
    # ------------------------------------------------------------------

    async def fetch_water_levels(self) -> list[dict]:
        return self.get_gauges()

    def get_cached_data(self) -> list[dict]:
        return self.get_gauges()

    def is_cache_valid(self) -> bool:
        return True  # reads always come from the DB

    def get_summary(self, data: Optional[list[dict]] = None) -> dict:
        data = self.get_gauges() if data is None else data
        counts = Counter(g["status"] for g in data)
        ranked = [g for g in data if g.get("pct_to_major_flood") is not None]
        highest = max(ranked, key=lambda g: g["pct_to_major_flood"], default=None)
        return {
            "total_stations": len(data),
            **{k: counts.get(k, 0) for k in ("normal", "alert", "minor", "major", "unknown")},
            "stale": sum(1 for g in data if g["stale"]),
            "highest_risk_station": highest,
        }

    def get_stations_by_district(self, district: str) -> list[dict]:
        d = district.lower()
        return [s for s in self.get_gauges() if any(x.lower() == d for x in s.get("districts", []))]

    def get_flood_risk_for_district(self, district: str) -> dict:
        """Calculate flood risk for a district based on river levels"""
        stations = self.get_stations_by_district(district)
        if not stations:
            return {"risk_level": "unknown", "risk_score": 0, "stations": []}

        max_pct = max((s.get("pct_to_major_flood") or 0) for s in stations)

        if max_pct >= 100:
            risk_level = "major_flood"
            risk_score = 100
        elif max_pct >= 80:
            risk_level = "high"
            risk_score = 80 + (max_pct - 80) * 0.5
        elif max_pct >= 60:
            risk_level = "medium"
            risk_score = 50 + (max_pct - 60) * 1.5
        elif max_pct >= 40:
            risk_level = "low"
            risk_score = 20 + (max_pct - 40) * 1.5
        else:
            risk_level = "minimal"
            risk_score = max_pct * 0.5

        return {
            "district": district,
            "risk_level": risk_level,
            "risk_score": round(min(risk_score, 100), 1),
            "max_pct_to_flood": round(max_pct, 1),
            "station_count": len(stations),
            "stations": stations,
        }


# Singleton instance
irrigation_fetcher = IrrigationFetcher()
