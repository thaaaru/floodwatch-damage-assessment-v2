#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""
check_river_apis.py
-------------------

Pings every river/water-level data source FloodWatch LK knows about and
prints a concise health report (HTTP status, latency, sample station count
and freshness). Useful before deploys and for monitoring.

Usage:
    python scripts/check_river_apis.py
    python scripts/check_river_apis.py --json     # machine-readable
    python scripts/check_river_apis.py --google-key <KEY>

Sources probed:
    1. Sri Lanka Irrigation Dept (ArcGIS REST)
    2. Sri Lanka Navy flood monitoring (HTML scrape)
    3. nuuuwan/lk_irrigation alert_data.json (GitHub mirror, compact)
    4. nuuuwan/lk_irrigation all.json (GitHub mirror, full history)
    5. Google Flood Forecasting API (requires --google-key)
    6. Open-Meteo Flood API (GloFAS-backed, free)
    7. GDACS country-level flood events
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from dataclasses import dataclass, asdict, field
from typing import Any, Optional

try:
    import httpx
except ImportError:  # pragma: no cover
    print(
        "Error: httpx is required. Install with: pip install httpx",
        file=sys.stderr,
    )
    sys.exit(1)


ANSI_GREEN = "\x1b[32m"
ANSI_YELLOW = "\x1b[33m"
ANSI_RED = "\x1b[31m"
ANSI_CYAN = "\x1b[36m"
ANSI_BOLD = "\x1b[1m"
ANSI_RESET = "\x1b[0m"


@dataclass
class ProbeResult:
    name: str
    url: str
    ok: bool
    http_status: Optional[int]
    latency_ms: Optional[float]
    detail: str
    sample: dict[str, Any] = field(default_factory=dict)


async def _get(
    client: httpx.AsyncClient, url: str, **kwargs: Any
) -> tuple[Optional[httpx.Response], Optional[float], Optional[str]]:
    start = time.monotonic()
    try:
        resp = await client.get(url, **kwargs)
        latency_ms = (time.monotonic() - start) * 1000.0
        return resp, latency_ms, None
    except httpx.HTTPError as exc:
        latency_ms = (time.monotonic() - start) * 1000.0
        return None, latency_ms, f"{type(exc).__name__}: {exc}"


async def probe_irrigation_arcgis(client: httpx.AsyncClient) -> ProbeResult:
    url = (
        "https://services3.arcgis.com/J7ZFXmR8rSmQ3FGf/arcgis/rest/services/"
        "gauges_2_view/FeatureServer/0/query"
    )
    params = {
        "where": "1=1",
        "outFields": "gauge,water_level,EditDate",
        "orderByFields": "EditDate DESC",
        "resultRecordCount": 5,
        "f": "json",
    }
    resp, latency, err = await _get(client, url, params=params)
    if resp is None:
        return ProbeResult(
            "SL Irrigation (ArcGIS)", url, False, None, latency, err or "no response"
        )
    detail = f"HTTP {resp.status_code}"
    sample: dict[str, Any] = {}
    ok = resp.status_code == 200
    if ok:
        try:
            data = resp.json()
            if "error" in data:
                err_code = data["error"].get("code")
                err_msg = data["error"].get("message", "?")
                # 429-style throttling: the endpoint itself is healthy, just
                # rate-limited at the tenant level. Mark as warn (still OK) so
                # operators see green/yellow rather than red.
                if "Too many requests" in err_msg or err_code == 429:
                    detail = f"HTTP 200 but rate-limited (transient): {err_msg}"
                    # Treat as OK; ArcGIS limit is per-org per-minute.
                else:
                    ok = False
                    detail = f"HTTP 200 but ArcGIS error: {err_msg}"
            else:
                features = data.get("features", [])
                sample = {
                    "feature_count": len(features),
                    "first_station": (features[0].get("attributes", {}).get("gauge") if features else None),
                    "first_level": (features[0].get("attributes", {}).get("water_level") if features else None),
                }
        except ValueError:
            ok = False
            detail = "HTTP 200 but body was not JSON"
    return ProbeResult("SL Irrigation (ArcGIS)", url, ok, resp.status_code, latency, detail, sample)


async def probe_navy(client: httpx.AsyncClient) -> ProbeResult:
    url = "https://floodms.navy.lk/wlrs/api/"
    resp, latency, err = await _get(client, url)
    if resp is None:
        return ProbeResult(
            "SL Navy FloodMS",
            url,
            False,
            None,
            latency,
            err or "no response (often geo-restricted)",
        )
    ok = resp.status_code == 200 and "L.marker" in resp.text
    detail = f"HTTP {resp.status_code}"
    sample = {}
    if ok:
        marker_count = resp.text.count("L.marker(")
        sample = {"marker_count": marker_count}
        if marker_count == 0:
            ok = False
            detail = "HTTP 200 but no markers found in HTML"
    return ProbeResult("SL Navy FloodMS", url, ok, resp.status_code, latency, detail, sample)


async def probe_github_alert(client: httpx.AsyncClient) -> ProbeResult:
    url = "https://raw.githubusercontent.com/nuuuwan/lk_irrigation/main/data/alert_data.json"
    resp, latency, err = await _get(client, url)
    if resp is None:
        return ProbeResult("GitHub alert_data.json", url, False, None, latency, err or "no response")
    detail = f"HTTP {resp.status_code}"
    sample = {}
    ok = resp.status_code == 200
    if ok:
        try:
            data = resp.json()
            event_data = data.get("event_data", {})
            ok = isinstance(event_data, dict) and bool(event_data)
            if ok:
                stations = list(event_data.keys())
                first = stations[0]
                latest_date = max(event_data[first].keys()) if event_data[first] else "?"
                sample = {
                    "station_count": len(stations),
                    "first_station": first,
                    "latest_date_for_first": latest_date,
                }
            else:
                detail = "HTTP 200 but event_data was empty"
        except ValueError:
            ok = False
            detail = "HTTP 200 but body was not JSON"
    return ProbeResult("GitHub alert_data.json", url, ok, resp.status_code, latency, detail, sample)


async def probe_github_all(client: httpx.AsyncClient) -> ProbeResult:
    url = "https://raw.githubusercontent.com/nuuuwan/lk_irrigation/main/data/all.json"
    # HEAD-style probe: only request first chunk to check liveness without downloading 15 MB.
    resp, latency, err = await _get(client, url, headers={"Range": "bytes=0-2047"})
    if resp is None:
        return ProbeResult("GitHub all.json", url, False, None, latency, err or "no response")
    # GitHub raw may not honor Range; accept 200 or 206.
    ok = resp.status_code in (200, 206)
    detail = f"HTTP {resp.status_code}"
    sample = {}
    if ok:
        head = resp.text[:512]
        # Quick structural sanity check
        if "station_name" in head and "water_level_m" in head:
            sample = {"head_preview": head[:160] + "..."}
        else:
            ok = False
            detail = f"HTTP {resp.status_code} but schema did not match expected fields"
    return ProbeResult("GitHub all.json", url, ok, resp.status_code, latency, detail, sample)


async def probe_google_floods(client: httpx.AsyncClient, api_key: Optional[str]) -> ProbeResult:
    base = "https://floodforecasting.googleapis.com/v1/floodStatus:queryArea"
    url = f"{base}?regionCode=LK"
    if not api_key:
        return ProbeResult(
            "Google Floods API",
            url,
            False,
            None,
            None,
            "skipped: no API key provided (pass --google-key)",
        )
    resp, latency, err = await _get(client, url, params={"key": api_key})
    if resp is None:
        return ProbeResult("Google Floods API", url, False, None, latency, err or "no response")
    ok = resp.status_code == 200
    detail = f"HTTP {resp.status_code}"
    sample = {}
    if ok:
        try:
            data = resp.json()
            statuses = data.get("floodStatuses", []) or data.get("gauges", [])
            sample = {"item_count": len(statuses)}
        except ValueError:
            ok = False
            detail = "HTTP 200 but body was not JSON"
    elif resp.status_code in (401, 403):
        detail = f"HTTP {resp.status_code} (auth/quota issue; check API key + flood API enabled)"
    return ProbeResult("Google Floods API", url, ok, resp.status_code, latency, detail, sample)


async def probe_open_meteo_flood(client: httpx.AsyncClient) -> ProbeResult:
    # Colombo (Kelani river mouth area) as a canonical Sri Lanka test point.
    url = "https://flood-api.open-meteo.com/v1/flood"
    params = {
        "latitude": 6.93,
        "longitude": 79.85,
        "daily": "river_discharge,river_discharge_max",
        "past_days": 1,
        "forecast_days": 3,
    }
    resp, latency, err = await _get(client, url, params=params)
    if resp is None:
        return ProbeResult("Open-Meteo Flood", url, False, None, latency, err or "no response")
    ok = resp.status_code == 200
    detail = f"HTTP {resp.status_code}"
    sample = {}
    if ok:
        try:
            data = resp.json()
            daily = data.get("daily") or {}
            discharge = daily.get("river_discharge") or []
            sample = {
                "days": len(daily.get("time") or []),
                "today_discharge_m3s": discharge[1] if len(discharge) > 1 else (discharge[0] if discharge else None),
                "max_in_window": max((v for v in discharge if v is not None), default=None),
            }
        except ValueError:
            ok = False
            detail = "HTTP 200 but body was not JSON"
    return ProbeResult("Open-Meteo Flood", url, ok, resp.status_code, latency, detail, sample)


async def probe_gdacs(client: httpx.AsyncClient) -> ProbeResult:
    url = (
        "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
        "?eventlist=FL&country=LK"
    )
    resp, latency, err = await _get(client, url)
    if resp is None:
        return ProbeResult("GDACS (LK floods)", url, False, None, latency, err or "no response")
    # 204 No Content is GDACS's normal "no active flood events" response - the
    # endpoint is healthy, there just isn't anything to report.
    ok = resp.status_code in (200, 204)
    detail = f"HTTP {resp.status_code}"
    sample = {}
    if resp.status_code == 204:
        sample = {"event_count": 0, "note": "no active flood events"}
    elif resp.status_code == 200:
        try:
            data = resp.json()
            features = data.get("features", []) or []
            sample = {"event_count": len(features)}
        except ValueError:
            ok = False
            detail = "HTTP 200 but body was not JSON"
    return ProbeResult("GDACS (LK floods)", url, ok, resp.status_code, latency, detail, sample)


async def run_all(google_key: Optional[str]) -> list[ProbeResult]:
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(15.0),
        headers={"User-Agent": "FloodWatch-LK river-api health-check"},
        follow_redirects=True,
    ) as client:
        tasks = [
            probe_irrigation_arcgis(client),
            probe_navy(client),
            probe_github_alert(client),
            probe_github_all(client),
            probe_google_floods(client, google_key),
            probe_open_meteo_flood(client),
            probe_gdacs(client),
        ]
        return await asyncio.gather(*tasks)


def format_table(results: list[ProbeResult]) -> str:
    lines = []
    header = f"{ANSI_BOLD}{'SOURCE':30}  {'STATUS':10}  {'HTTP':5}  {'ms':>7}  DETAIL / SAMPLE{ANSI_RESET}"
    lines.append(header)
    lines.append("-" * 100)
    for r in results:
        status_label = f"{ANSI_GREEN}OK{ANSI_RESET}" if r.ok else f"{ANSI_RED}FAIL{ANSI_RESET}"
        http = str(r.http_status) if r.http_status is not None else "-"
        ms = f"{r.latency_ms:7.0f}" if r.latency_ms is not None else "      -"
        extra = r.detail
        if r.sample:
            extra += f"  | {r.sample}"
        lines.append(f"{r.name:30}  {status_label:18}  {http:5}  {ms}  {extra}")

    ok_count = sum(1 for r in results if r.ok)
    summary_color = ANSI_GREEN if ok_count == len(results) else (ANSI_YELLOW if ok_count > 0 else ANSI_RED)
    lines.append("-" * 100)
    lines.append(f"{summary_color}{ok_count}/{len(results)} sources healthy{ANSI_RESET}")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON instead of a table")
    parser.add_argument("--google-key", default=None, help="Google Cloud API key for the Flood Forecasting API")
    args = parser.parse_args()

    results = asyncio.run(run_all(args.google_key))

    if args.json:
        print(json.dumps([asdict(r) for r in results], indent=2, default=str))
    else:
        print(f"{ANSI_CYAN}{ANSI_BOLD}FloodWatch LK river-data source health check{ANSI_RESET}")
        print(format_table(results))

    # Exit non-zero if every probe failed.
    return 0 if any(r.ok for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
