# SPDX-License-Identifier: Apache-2.0

"""
Sri Lanka Department of Meteorology - official ground-gauge service.

Data source:
  https://meteo.gov.lk/excels/3hourly.xlsx

This is the *authoritative* rainfall source for Sri Lanka: 24 WMO-compliant
weather stations reporting measured precipitation every 3 hours. Compared
against forecasts from Open-Meteo / OpenWeatherMap, this is ground truth
(not modeled, not interpolated) and is the value Sri Lanka officially
uses for flood declarations.

The Excel sheet's "Rainfall (mm)" column is the 3-hour total for the most
recent reporting period. "Tot RF since 830am" is the daily accumulation
from 08:30 local time. Hourly forecasts and modeled rainfall are
intentionally NOT exposed by this module.
"""
from __future__ import annotations

import asyncio
import io
import logging
import re
from dataclasses import dataclass, asdict
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx

try:  # stdlib in 3.9+
    from zoneinfo import ZoneInfo
    COLOMBO_TZ = ZoneInfo("Asia/Colombo")
except ImportError:  # pragma: no cover
    COLOMBO_TZ = timezone(timedelta(hours=5, minutes=30))

from openpyxl import load_workbook

logger = logging.getLogger(__name__)

EXCEL_URL = "https://meteo.gov.lk/excels/3hourly.xlsx"

# Station coordinates. The Met Dept Excel does NOT include lat/lon, so we
# maintain a canonical lookup. WMO IDs are stable; we key on those when
# possible, with case-insensitive name match as a fallback.
#
# Coordinates verified against Wikipedia / WMO station registry entries.
STATION_LOCATIONS: dict[int, dict] = {
    43404:  {"name": "Jaffna",            "lat": 9.66500, "lon": 80.01500, "district": "Jaffna"},
    43410:  {"name": "Mullaitivu",        "lat": 9.26670, "lon": 80.81670, "district": "Mullaitivu"},
    43413:  {"name": "Mannar",            "lat": 8.98170, "lon": 79.90430, "district": "Mannar"},
    43415:  {"name": "Vavuniya",          "lat": 8.75220, "lon": 80.49740, "district": "Vavuniya"},
    43418:  {"name": "Trincomalee",       "lat": 8.58720, "lon": 81.21520, "district": "Trincomalee"},
    43421:  {"name": "Anuradhapura",      "lat": 8.31100, "lon": 80.40370, "district": "Anuradhapura"},
    43422:  {"name": "Maha Illuppallama", "lat": 8.11670, "lon": 80.46670, "district": "Anuradhapura"},
    43424:  {"name": "Puttalam",          "lat": 8.04080, "lon": 79.82780, "district": "Puttalam"},
    43436:  {"name": "Batticaloa",        "lat": 7.71670, "lon": 81.70000, "district": "Batticaloa"},
    43441:  {"name": "Kurunegala",        "lat": 7.48660, "lon": 80.36220, "district": "Kurunegala"},
    43444:  {"name": "Katugastota",       "lat": 7.31670, "lon": 80.63330, "district": "Kandy"},
    43450:  {"name": "Katunayake",        "lat": 7.16970, "lon": 79.88410, "district": "Gampaha"},
    43466:  {"name": "Colombo",           "lat": 6.92710, "lon": 79.86120, "district": "Colombo"},
    43467:  {"name": "Ratmalana",         "lat": 6.82110, "lon": 79.88610, "district": "Colombo"},
    43473:  {"name": "Nuwara Eliya",      "lat": 6.94970, "lon": 80.78910, "district": "Nuwara Eliya"},
    43475:  {"name": "Pottuvil",          "lat": 6.87360, "lon": 81.84000, "district": "Ampara"},
    43476:  {"name": "Bandarawela",       "lat": 6.83280, "lon": 80.98520, "district": "Badulla"},
    43479:  {"name": "Badulla",           "lat": 6.99340, "lon": 81.05500, "district": "Badulla"},
    43486:  {"name": "Ratnapura",         "lat": 6.68280, "lon": 80.39920, "district": "Ratnapura"},
    43495:  {"name": "Galle",             "lat": 6.05350, "lon": 80.22100, "district": "Galle"},
    43497:  {"name": "Hambantota",        "lat": 6.12410, "lon": 81.11850, "district": "Hambantota"},
    330601: {"name": "Mattala",           "lat": 6.28490, "lon": 81.12380, "district": "Hambantota"},
    721501: {"name": "Polonnaruwa",       "lat": 7.93840, "lon": 81.01880, "district": "Polonnaruwa"},
    821501: {"name": "Monaragala",        "lat": 6.87280, "lon": 81.35070, "district": "Monaragala"},
}

# Name-keyed fallback (case-insensitive, stripped). Used when the Excel file
# revision renumbers a station or temporarily omits its WMO ID.
STATION_BY_NAME: dict[str, dict] = {
    v["name"].lower(): {"wmo": k, **v} for k, v in STATION_LOCATIONS.items()
}


def _parse_rainfall(value) -> float:
    """Convert an Excel cell value to mm. Handles "Trace" and stringy floats."""
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().lower()
    if s in ("", "-", "nil", "0"):
        return 0.0
    if s == "trace":
        # Met Dept convention: trace = measurable but < 0.1 mm.
        return 0.05
    # Strip stray units, then try parse.
    s = re.sub(r"[^\d.\-]", "", s)
    try:
        return float(s) if s else 0.0
    except ValueError:
        return 0.0


def _parse_report_time(raw) -> Optional[datetime]:
    """Convert the Excel 'Report_Time' value to a tz-aware datetime."""
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw.replace(tzinfo=COLOMBO_TZ) if raw.tzinfo is None else raw
    s = str(raw).strip()
    for fmt in ("%Y-%m-%d %H%M", "%Y-%m-%d %H:%M", "%Y/%m/%d %H%M", "%Y/%m/%d %H:%M"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=COLOMBO_TZ)
        except ValueError:
            continue
    return None


@dataclass
class MetStation:
    """One reading from a Met Dept WMO station."""
    wmo_id: int
    name: str
    district: str
    latitude: float
    longitude: float
    report_time_utc: str           # ISO-8601 UTC
    rainfall_3h_mm: float          # 3-hour total
    rainfall_since_830am_mm: float # daily accumulation from 08:30 local
    temperature_c: Optional[float]
    relative_humidity_pct: Optional[int]
    weather_type: str              # 'rain', 'showers', 'fairday', etc.

    def to_dict(self) -> dict:
        return asdict(self)


class MetDepartmentService:
    """Async client for Sri Lanka Department of Meteorology 3-hourly bulletin."""

    # The Met Dept publishes a new bulletin every 3 hours. We refresh every
    # 15 min so we pick up the new file within a few minutes of release
    # without hammering their server.
    CACHE_TTL_SECONDS = 15 * 60
    REQUEST_TIMEOUT = 30.0

    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None
        self._client_lock = asyncio.Lock()
        self._cache: list[MetStation] = []
        self._cache_at: Optional[datetime] = None
        self._cache_lock = asyncio.Lock()
        self._last_report_time: Optional[datetime] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            async with self._client_lock:
                if self._client is None:
                    self._client = httpx.AsyncClient(
                        timeout=self.REQUEST_TIMEOUT,
                        # Met Dept's CDN sometimes returns gzipped HTML on bad
                        # accept headers; pin explicit UA + accept.
                        headers={
                            "User-Agent": "FloodWatch-LK/1.0 (+https://floodwatch.teklab.dev)",
                            "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
                        },
                        follow_redirects=True,
                    )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _is_cache_fresh(self) -> bool:
        if self._cache_at is None:
            return False
        age = (datetime.now(timezone.utc) - self._cache_at).total_seconds()
        return age < self.CACHE_TTL_SECONDS

    async def get_stations(self, force_refresh: bool = False) -> list[MetStation]:
        """Return the latest measured readings from all 24 Met Dept stations.

        Stations are returned in the order the Met Dept publishes them
        (north to south). Empty list on persistent failure.
        """
        if not force_refresh and self._is_cache_fresh():
            return self._cache

        async with self._cache_lock:
            # Re-check under lock to avoid a thundering herd refresh.
            if not force_refresh and self._is_cache_fresh():
                return self._cache

            try:
                stations = await self._fetch_and_parse()
            except Exception as exc:
                logger.warning(
                    "Met Dept fetch failed (%s); serving stale cache of %d stations",
                    exc, len(self._cache),
                )
                return self._cache

            self._cache = stations
            self._cache_at = datetime.now(timezone.utc)
            if stations:
                # Track the *report time* (when Met Dept generated the bulletin)
                # separately from when we fetched it.
                report_time_str = stations[0].report_time_utc
                try:
                    self._last_report_time = datetime.fromisoformat(report_time_str)
                except ValueError:
                    self._last_report_time = None
            logger.info(
                "Met Dept bulletin refreshed: %d stations, report_time=%s",
                len(stations), self._last_report_time,
            )
            return stations

    async def _fetch_and_parse(self) -> list[MetStation]:
        client = await self._get_client()
        # Cache-bust on every fetch since their CDN has aggressive headers.
        params = {"t": int(datetime.now(timezone.utc).timestamp())}
        resp = await client.get(EXCEL_URL, params=params)
        resp.raise_for_status()
        return self._parse_workbook(resp.content)

    @staticmethod
    def _parse_workbook(content: bytes) -> list[MetStation]:
        wb = load_workbook(io.BytesIO(content), data_only=True)
        if "Sheet1" not in wb.sheetnames:
            raise ValueError(
                "Met Dept Excel layout changed: 'Sheet1' missing "
                f"(sheets={wb.sheetnames!r})"
            )
        ws = wb["Sheet1"]
        rows = ws.iter_rows(min_row=2, values_only=True)

        out: list[MetStation] = []
        for row in rows:
            # Schema: Station_ID, Station_Name, Report_Time, Rainfall (mm),
            # Tot RF since 830am, Temperature (C), RH (%), weathertype
            if not row or row[0] is None:
                continue
            try:
                wmo_id = int(row[0])
            except (TypeError, ValueError):
                continue

            raw_name = (row[1] or "").strip().title()
            report_time = _parse_report_time(row[2])
            rainfall_3h = _parse_rainfall(row[3])
            rainfall_day = _parse_rainfall(row[4])

            try:
                temp = float(row[5]) if row[5] not in (None, "") else None
            except (TypeError, ValueError):
                temp = None
            try:
                rh = int(row[6]) if row[6] not in (None, "") else None
            except (TypeError, ValueError):
                rh = None
            weather_type = (row[7] or "").strip().lower() if len(row) > 7 else ""

            meta = STATION_LOCATIONS.get(wmo_id)
            if meta is None:
                # Try name match as fallback (Met Dept occasionally retires
                # a WMO ID).
                meta = STATION_BY_NAME.get(raw_name.lower())
            if meta is None:
                logger.warning(
                    "Met Dept station %s (%s) has no known coordinates; skipping",
                    wmo_id, raw_name,
                )
                continue

            report_iso = (
                report_time.astimezone(timezone.utc).isoformat()
                if report_time else
                datetime.now(timezone.utc).isoformat()
            )
            out.append(MetStation(
                wmo_id=wmo_id,
                name=meta["name"],
                district=meta["district"],
                latitude=meta["lat"],
                longitude=meta["lon"],
                report_time_utc=report_iso,
                rainfall_3h_mm=rainfall_3h,
                rainfall_since_830am_mm=rainfall_day,
                temperature_c=temp,
                relative_humidity_pct=rh,
                weather_type=weather_type,
            ))

        return out

    async def get_summary(self) -> dict:
        """Aggregate summary (used for legend / status strip)."""
        stations = await self.get_stations()
        if not stations:
            return {
                "station_count": 0,
                "report_time_utc": None,
                "rainfall_total_mm": 0.0,
                "wettest_station": None,
                "stations_with_rain": 0,
            }
        wettest = max(stations, key=lambda s: s.rainfall_since_830am_mm)
        return {
            "station_count": len(stations),
            "report_time_utc": stations[0].report_time_utc,
            "rainfall_total_mm": round(sum(s.rainfall_since_830am_mm for s in stations), 1),
            "wettest_station": {
                "name": wettest.name,
                "district": wettest.district,
                "rainfall_since_830am_mm": wettest.rainfall_since_830am_mm,
            },
            "stations_with_rain": sum(1 for s in stations if s.rainfall_since_830am_mm > 0),
        }


# Module-level singleton, mirroring the openweathermap_service / google_floods_service pattern.
met_department_service = MetDepartmentService()
