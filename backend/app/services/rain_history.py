# SPDX-License-Identifier: Apache-2.0
"""
30-year rainfall context per district: ERA5 reanalysis (model data, not rain gauges)
from the Open-Meteo archive API, stored in rain_daily and read from the DB only.

- backfill(): one district per request (2-year chunks), polite sleeps and a call
  budget, resumable; the daily job and scripts/backfill_rain_history.py use it.
- update_recent(): re-fetches the last 14 days (ERA5 arrives ~5 days late, so
  "yesterday" is usually still null) and upserts whatever is there.
- summary()/overview(): monthly normals (1996-2025), month-to-date vs the
  pro-rated normal, top-5 wettest days, and a linear trend of annual totals
  shown only when its 95% CI excludes 0.

Open-Meteo counts >2 weeks for one location as fractional calls (14 days = 1
call), so a 2-year chunk costs ~52 calls and a full district ~780.
"""
import asyncio
import calendar
import logging
import math
import time
from datetime import date, timedelta
from typing import Optional

import httpx
from sqlalchemy import func, select

from ..database import engine as default_engine
from ..models import RainDaily
from .irrigation_fetcher import _insert

logger = logging.getLogger(__name__)

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
UA = {"User-Agent": "FloodWatch.lk/1.0 (+https://floodwatch.teklab.dev)"}
START = date(1996, 1, 1)
NORMAL_YEARS = (1996, 2025)
CHUNK_YEARS = 2
READY_WITHIN_DAYS = 30  # latest stored day must be this recent to be shown (ERA5 lags ~5 days)
SOURCE_LABEL = "Model data (ERA5 reanalysis via Open-Meteo), 1996–2025. Not rain-gauge measurements."

# District capitals (the coordinates FloodWatch used for its 25 district points).
DISTRICTS: dict[str, tuple[float, float]] = {
    "Colombo": (6.9271, 79.8612), "Gampaha": (7.0873, 80.0144), "Kalutara": (6.5854, 79.9607),
    "Kandy": (7.2906, 80.6337), "Matale": (7.4675, 80.6234), "Nuwara Eliya": (6.9497, 80.7891),
    "Galle": (6.0535, 80.2210), "Matara": (5.9549, 80.5550), "Hambantota": (6.1429, 81.1212),
    "Jaffna": (9.6615, 80.0255), "Kilinochchi": (9.3803, 80.3770), "Mannar": (8.9810, 79.9044),
    "Vavuniya": (8.7514, 80.4971), "Mullaitivu": (9.2671, 80.8142), "Batticaloa": (7.7310, 81.6747),
    "Ampara": (7.2975, 81.6820), "Trincomalee": (8.5874, 81.2152), "Kurunegala": (7.4863, 80.3647),
    "Puttalam": (8.0362, 79.8283), "Anuradhapura": (8.3114, 80.4037), "Polonnaruwa": (7.9403, 81.0188),
    "Badulla": (6.9934, 81.0550), "Monaragala": (6.8728, 81.3507), "Ratnapura": (6.6828, 80.3992),
    "Kegalle": (7.2513, 80.3464),
}

# Two-sided 95% Student t critical values by degrees of freedom.
T95 = {1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262,
       10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110,
       18: 2.101, 19: 2.093, 20: 2.086, 21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
       26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042}


def _calls(start: date, end: date) -> float:
    return max(1.0, ((end - start).days + 1) / 14)


# ---------------------------------------------------------------------------
# Pure statistics (unit-tested)
# ---------------------------------------------------------------------------

def monthly_totals(rows: list[tuple[date, float]]) -> dict[tuple[int, int], float]:
    out: dict[tuple[int, int], float] = {}
    for d, mm in rows:
        out[(d.year, d.month)] = out.get((d.year, d.month), 0.0) + mm
    return out


def monthly_normals(rows: list[tuple[date, float]], years=NORMAL_YEARS) -> list[Optional[float]]:
    """Mean monthly total over `years` (inclusive), for months with complete data."""
    totals = monthly_totals(rows)
    days = {}
    for d, _ in rows:
        days[(d.year, d.month)] = days.get((d.year, d.month), 0) + 1
    out = []
    for m in range(1, 13):
        vals = [totals[(y, m)] for y in range(years[0], years[1] + 1)
                if days.get((y, m)) == calendar.monthrange(y, m)[1]]
        out.append(round(sum(vals) / len(vals), 1) if vals else None)
    return out


def prorated_normal(normal_month: float, as_of: date) -> float:
    """The month's normal scaled to the days elapsed (1st..as_of inclusive)."""
    return normal_month * as_of.day / calendar.monthrange(as_of.year, as_of.month)[1]


def pct_of_normal(mtd: float, normal_to_date: float) -> Optional[float]:
    return round(100 * mtd / normal_to_date) if normal_to_date > 0 else None


def linear_trend(points: list[tuple[int, float]]) -> Optional[dict]:
    """OLS slope of annual totals with a 95% CI; `significant` only when the CI excludes 0."""
    n = len(points)
    if n < 10:
        return None
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    slope = sum((x - mx) * (y - my) for x, y in points) / sxx
    intercept = my - slope * mx
    sse = sum((y - (intercept + slope * x)) ** 2 for x, y in points)
    se = math.sqrt(sse / (n - 2) / sxx)
    t = T95.get(n - 2, 1.96)
    lo, hi = slope - t * se, slope + t * se
    return {"slope_mm_per_year": round(slope, 2), "ci_low": round(lo, 2), "ci_high": round(hi, 2),
            "intercept": intercept, "significant": lo > 0 or hi < 0}


def summarize(rows: list[tuple[date, float]]) -> Optional[dict]:
    if not rows:
        return None
    rows = sorted(rows)
    as_of = rows[-1][0]
    normals = monthly_normals(rows)
    mtd = round(sum(mm for d, mm in rows if d.year == as_of.year and d.month == as_of.month), 1)
    normal_m = normals[as_of.month - 1]
    to_date = round(prorated_normal(normal_m, as_of), 1) if normal_m is not None else None
    annual = monthly_totals(rows)
    years_complete = {}
    for d, _ in rows:
        years_complete[d.year] = years_complete.get(d.year, 0) + 1
    annual_totals = [(y, round(sum(v for (yy, _), v in annual.items() if yy == y), 1))
                     for y in range(NORMAL_YEARS[0], NORMAL_YEARS[1] + 1)
                     if years_complete.get(y) == (366 if calendar.isleap(y) else 365)]
    return {
        "as_of": as_of.isoformat(),
        "month": as_of.month,
        "mtd_mm": mtd,
        "normal_to_date_mm": to_date,
        "pct_of_normal": pct_of_normal(mtd, to_date) if to_date is not None else None,
        "monthly_normals_mm": normals,
        "wettest_days": [{"date": d.isoformat(), "mm": round(mm, 1)}
                         for d, mm in sorted(rows, key=lambda r: r[1], reverse=True)[:5]],
        "annual_totals": [{"year": y, "mm": v} for y, v in annual_totals],
        "trend": linear_trend(annual_totals),
        "first_date": rows[0][0].isoformat(),
    }


# ---------------------------------------------------------------------------
# Storage, fetching and cached reads
# ---------------------------------------------------------------------------

class RainHistory:
    def __init__(self, db_engine=None, sleep_s: float = 75.0):
        self.engine = db_engine or default_engine
        self.sleep_s = sleep_s
        # district -> (computed_at, summary); 1 h TTL so a backfill run in another process shows up.
        self._cache: dict[str, tuple[float, Optional[dict]]] = {}

    # --- writes ---------------------------------------------------------
    def store(self, district: str, values: list[tuple[date, Optional[float]]]) -> int:
        rows = [{"district": district, "date": d, "precip_mm": mm} for d, mm in values if mm is not None]
        if not rows:
            return 0
        with self.engine.begin() as conn:
            for i in range(0, len(rows), 500):
                stmt = _insert(self.engine, RainDaily.__table__).values(rows[i:i + 500])
                conn.execute(stmt.on_conflict_do_update(index_elements=["district", "date"],
                                                        set_={"precip_mm": stmt.excluded.precip_mm}))
        self._cache.pop(district, None)
        return len(rows)

    async def fetch(self, client: httpx.AsyncClient, district: str, start: date, end: date):
        lat, lon = DISTRICTS[district]
        r = await client.get(ARCHIVE_URL, headers=UA, params={
            "latitude": lat, "longitude": lon, "start_date": start.isoformat(), "end_date": end.isoformat(),
            "daily": "precipitation_sum", "timezone": "Asia/Colombo", "models": "era5",
        })
        r.raise_for_status()
        daily = r.json().get("daily") or {}
        return [(date.fromisoformat(t), v) for t, v in zip(daily.get("time", []), daily.get("precipitation_sum", []))]

    def _range(self, district: str) -> tuple[Optional[date], Optional[date], int]:
        with self.engine.connect() as conn:
            lo, hi, n = conn.execute(select(func.min(RainDaily.date), func.max(RainDaily.date), func.count())
                                     .where(RainDaily.district == district)).one()
        return lo, hi, n

    def missing_chunks(self, district: str, today: date) -> list[tuple[date, date]]:
        """2-year chunks not yet stored, START..today-1. Partial history resumes after the last stored day."""
        lo, hi, _ = self._range(district)
        start = START if hi is None or lo > START else hi + timedelta(days=1)
        end_all = today - timedelta(days=1)
        out = []
        while start <= end_all:
            end = min(date(start.year + CHUNK_YEARS, 1, 1) - timedelta(days=1), end_all)
            out.append((start, end))
            start = end + timedelta(days=1)
        return out

    async def backfill(self, budget_calls: float = 3000, today: Optional[date] = None) -> float:
        """Fill missing history district by district within a call budget. Returns calls used."""
        today = today or date.today()
        used = 0.0
        async with httpx.AsyncClient(timeout=60) as client:
            for district in DISTRICTS:
                chunks = self.missing_chunks(district, today)
                # Only the tail (recent ERA5 lag) is left: update_recent handles it.
                if not chunks or (len(chunks) == 1 and (chunks[0][1] - chunks[0][0]).days < 30):
                    continue
                for start, end in chunks:
                    cost = _calls(start, end)
                    if used + cost > budget_calls:
                        logger.info("Rain history backfill: budget reached (%.0f calls)", used)
                        return used
                    self.store(district, await self.fetch(client, district, start, end))
                    used += cost
                    logger.info("Rain history: %s %s..%s (%.0f calls so far)", district, start, end, used)
                    await asyncio.sleep(self.sleep_s)
        return used

    async def update_recent(self, days: int = 14, today: Optional[date] = None) -> int:
        """Re-fetch the last `days` days for districts that already have history (1 call each)."""
        today = today or date.today()
        start, end = today - timedelta(days=days), today - timedelta(days=1)
        stored = 0
        async with httpx.AsyncClient(timeout=60) as client:
            for district in DISTRICTS:
                if self._range(district)[1] is None:
                    continue
                try:
                    stored += self.store(district, await self.fetch(client, district, start, end))
                except httpx.HTTPError as e:
                    logger.warning("Rain history update failed for %s: %s", district, e)
                await asyncio.sleep(2)
        return stored

    # --- reads (DB only) --------------------------------------------------
    def summary(self, district: str) -> Optional[dict]:
        hit = self._cache.get(district)
        if hit is None or time.monotonic() - hit[0] > 3600:
            with self.engine.connect() as conn:
                rows = conn.execute(select(RainDaily.date, RainDaily.precip_mm)
                                    .where(RainDaily.district == district)).all()
            hit = (time.monotonic(), summarize([(d, mm) for d, mm in rows]))
            self._cache[district] = hit
        # A district whose backfill has not reached the present yet is "not ready", not old news.
        if hit[1] and date.fromisoformat(hit[1]["as_of"]) < date.today() - timedelta(days=READY_WITHIN_DAYS):
            return None
        return hit[1]

    def overview(self) -> list[dict]:
        out = []
        for name, (lat, lon) in DISTRICTS.items():
            s = self.summary(name)
            out.append({"district": name, "lat": lat, "lon": lon,
                        **({k: s[k] for k in ("as_of", "month", "mtd_mm", "normal_to_date_mm", "pct_of_normal")}
                           if s else {"as_of": None})})
        return out


rain_history = RainHistory()
