# SPDX-License-Identifier: Apache-2.0
"""Data health: every 30 min, check each live source for age, impossible values and frozen values,
and compare Met stations with nearby NBRO gauges. Read-only: it flags, it never changes a feed.
Served at /api/health/data; no alerts (by decision)."""
import asyncio
import hashlib
import json
import logging
from datetime import date, datetime, timezone
from typing import Optional

from .osm_facilities import _haversine_distance

logger = logging.getLogger(__name__)

# Sri Lanka's 24 h record is ~500 mm; anything past these is a bad reading, not weather.
MAX_24H_MM = 600
MAX_3H_MM = 300
NEARBY_KM = 10
DISAGREE_MM = 50
FROZEN_HOURS = 6
MAX_AGE_HOURS = {"met": 6, "nbro": 1, "rivers": 2}
ERA5_MAX_LAG_DAYS = 10


def _age_h(iso: Optional[str], now: datetime) -> Optional[float]:
    if not iso:
        return None
    t = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    t = t if t.tzinfo else t.replace(tzinfo=timezone.utc)
    return round((now - t).total_seconds() / 3600, 1)


def _status(issues: list[str], fail: bool) -> str:
    return "fail" if fail else ("warn" if issues else "ok")


def check_age(name: str, latest: Optional[str], count: int, now: datetime) -> dict:
    age = _age_h(latest, now)
    issues = []
    if not count:
        issues.append("no data")
    elif age is None:
        issues.append("no observation time")
    elif age > MAX_AGE_HOURS[name]:
        issues.append(f"latest reading is {age} h old (limit {MAX_AGE_HOURS[name]} h)")
    return {"source": name, "count": count, "latest": latest, "age_hours": age, "issues": issues}


def out_of_range(rows: list[dict], key: str, limit: float, label: str) -> list[str]:
    return [f"{r['name']}: {label} {r[key]} mm is impossible" for r in rows
            if isinstance(r.get(key), (int, float)) and not 0 <= r[key] <= limit]


def disagreements(met: list[dict], nbro: list[dict]) -> list[dict]:
    """Met since-08:30 is inside NBRO's last 24 h, so Met far above every nearby NBRO gauge is suspect.
    The reverse can't be judged: NBRO's 24 h includes yesterday."""
    out = []
    live = [g for g in nbro if not g.get("stale")]
    for s in met:
        near = [g for g in live if _haversine_distance(s["latitude"], s["longitude"], g["lat"], g["lon"]) <= NEARBY_KM]
        if not near:
            continue
        top = max(near, key=lambda g: g["rain_24h_mm"])
        if s["rainfall_since_830am_mm"] - top["rain_24h_mm"] > DISAGREE_MM:
            out.append({"met": s["name"], "met_mm": s["rainfall_since_830am_mm"],
                        "nbro": top["name"], "nbro_24h_mm": top["rain_24h_mm"], "gauges_within_km": NEARBY_KM})
    return out


class DataQuality:
    def __init__(self) -> None:
        self._prints: dict[str, tuple[str, datetime]] = {}  # source -> (fingerprint, first seen)
        self.report: dict = {"checked_at": None, "sources": [], "disagreements": []}

    def frozen(self, name: str, values: list[float], now: datetime) -> Optional[str]:
        """Identical non-zero values for FROZEN_HOURS: the feed is repeating itself. All-dry is allowed to sit still."""
        fp = hashlib.sha1(json.dumps(values).encode()).hexdigest()
        prev = self._prints.get(name)
        if prev is None or prev[0] != fp:
            self._prints[name] = (fp, now)
            return None
        hours = (now - prev[1]).total_seconds() / 3600
        return f"values unchanged for {hours:.0f} h" if hours >= FROZEN_HOURS and any(values) else None

    def evaluate(self, met: list[dict], nbro: dict, gauges: list[dict], era5: list[dict], now: datetime) -> dict:
        sources = []

        m = check_age("met", max((s["report_time_utc"] for s in met), default=None), len(met), now)
        m["issues"] += out_of_range(met, "rainfall_since_830am_mm", MAX_24H_MM, "since 08:30")
        m["issues"] += out_of_range(met, "rainfall_3h_mm", MAX_3H_MM, "3 h")
        if f := self.frozen("met", [s["rainfall_since_830am_mm"] for s in met], now):
            m["issues"].append(f)
        sources.append(m)

        stations = nbro.get("stations") or []
        n = check_age("nbro", nbro.get("latest_observation_at"), len(stations), now)
        n["stale_count"] = sum(1 for g in stations if g.get("stale"))
        n["issues"] += out_of_range(stations, "rain_24h_mm", MAX_24H_MM, "24 h")
        if nbro.get("stale"):
            n["issues"].append("upstream fetch failing: serving last good copy")
        if f := self.frozen("nbro", [g["rain_24h_mm"] for g in stations], now):
            n["issues"].append(f)
        sources.append(n)

        r = check_age("rivers", max((g["observed_at"] for g in gauges if g.get("observed_at")), default=None), len(gauges), now)
        r["stale_count"] = sum(1 for g in gauges if g.get("stale"))
        sources.append(r)

        latest = max((d["as_of"] for d in era5 if d.get("as_of")), default=None)
        lag = (now.date() - date.fromisoformat(latest)).days if latest else None
        e = {"source": "era5", "count": sum(1 for d in era5 if d.get("as_of")), "latest": latest, "lag_days": lag, "issues": []}
        if lag is None:
            e["issues"].append("no ERA5 history")
        elif lag > ERA5_MAX_LAG_DAYS:
            e["issues"].append(f"ERA5 is {lag} days behind (normal ~6)")
        sources.append(e)

        for s in sources:
            s["status"] = _status(s["issues"], fail=not s["count"])
        self.report = {"checked_at": now.isoformat(), "sources": sources, "disagreements": disagreements(met, stations)}
        return self.report

    async def run(self) -> dict:
        from ..routers.map_layers import rain_24h_service
        from .irrigation_fetcher import irrigation_fetcher
        from .met_department import met_department_service
        from .rain_history import rain_history

        async def safe(fn, default):
            try:
                return await fn()
            except Exception as e:
                logger.warning("Data health: source read failed: %s", e)
                return default

        met = [s.to_dict() for s in await safe(met_department_service.get_stations, [])]
        nbro = await safe(rain_24h_service.get, {})
        gauges = await safe(lambda: asyncio.to_thread(irrigation_fetcher.get_gauges), [])
        era5 = await safe(lambda: asyncio.to_thread(rain_history.overview), [])
        report = self.evaluate(met, nbro, gauges, era5, datetime.now(timezone.utc))
        bad = [f"{s['source']}: {'; '.join(s['issues'][:3])}" for s in report["sources"] if s["issues"]]
        if bad:
            logger.warning("Data health: %s", " | ".join(bad))
        return report


data_quality = DataQuality()
