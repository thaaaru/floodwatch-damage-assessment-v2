# SPDX-License-Identifier: Apache-2.0
"""
News & updates feed (/news), refreshed server-side every 15 minutes by the
scheduler. Page visits read the in-memory snapshot only (GET /api/news).

Sources (all public, no key unless noted):
  - SL Met       https://meteo.gov.lk/content.json: forecasts with their real
                 "Issued at" times; severe-weather advisory PDFs dated by the
                 PDF's Last-Modified header.
  - NewsFirst    english.newsfirst.lk weather tag via the site's own JSON API
                 (apienglish.newsfirst.lk), real publish times (date_gmt).
  - GDACS        TC/FL events, filtered to Sri Lanka's region by event location.
  - IMD RSMC     daily Tropical Weather Outlook link from rsmcnewdelhi.imd.gov.in,
                 dated from its "based on 0300 UTC of DD.MM.YYYY" title.
  - ReliefWeb    API v2 needs a pre-approved appname (RELIEFWEB_APPNAME); off
                 when empty.

Rules: never invent a date (no date -> published_at None, shown without a
time); drop items older than 30 days; newest first; keep a source's last
good items when a refresh fails and report its status.
"""
import asyncio
import html
import logging
import re
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Optional

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)

UA = {"User-Agent": "FloodWatch.lk/1.0 (+https://floodwatch.teklab.dev)"}
COLOMBO = timezone(timedelta(hours=5, minutes=30))
MAX_AGE = timedelta(days=30)
# Sri Lanka and its region (Bay of Bengal, Arabian Sea, south India, Maldives)
REGION = {"west": 60.0, "east": 100.0, "south": -10.0, "north": 30.0}
MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august",
     "september", "october", "november", "december"], start=1)}
RELEVANT = re.compile(
    r"rain|flood|storm|cyclone|lightning|weather|monsoon|landslide|wind|depression|"
    r"low[- ]pressure|drought|thunder|heat|advisory|warning|spill|tsunami|sea", re.I)


def item(id, title, summary, source, icon, url, published_at: Optional[datetime], category, severity="info"):
    return {
        "id": id, "title": title, "summary": summary, "source": source, "sourceIcon": icon,
        "url": url, "category": category, "severity": severity,
        "publishedAt": published_at.astimezone(timezone.utc).isoformat() if published_at else None,
    }


def _strip(s: str) -> str:
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or ""))).strip()


# ---------------------------------------------------------------------------
# SL Met
# ---------------------------------------------------------------------------

def parse_issued_local(text: str) -> Optional[datetime]:
    """'Issued at 05.30 a.m. on 11 October 2026' (Colombo time) -> aware datetime."""
    m = re.search(r"Issued at (\d{1,2})[.:](\d{2})\s*([ap])\.?\s*m\.?\s+on\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", text, re.I)
    if not m or m.group(5).lower() not in MONTHS:
        return None
    hour = int(m.group(1)) % 12 + (12 if m.group(3).lower() == "p" else 0)
    return datetime(int(m.group(6)), MONTHS[m.group(5).lower()], int(m.group(4)), hour, int(m.group(2)), tzinfo=COLOMBO)


def parse_issued_utc(text: str) -> Optional[datetime]:
    """'Issued at 0000UTC on 2026.10.11' -> aware datetime."""
    m = re.search(r"Issued at (\d{2})(\d{2})\s*UTC on (\d{4})\.(\d{2})\.(\d{2})", text, re.I)
    if not m:
        return None
    return datetime(int(m.group(3)), int(m.group(4)), int(m.group(5)), int(m.group(1)), int(m.group(2)), tzinfo=timezone.utc)


def _english_block(text: str, start: str) -> Optional[str]:
    i = text.find(start)
    if i < 0:
        return None
    block = text[i:]
    # Stop where a non-Latin (Sinhala/Tamil) paragraph starts again.
    m = re.search(r"\r?\n\r?\n[^\x00-\x7F]", block)
    return (block[:m.start()] if m else block).strip()


def _paragraphs(block: str, skip: int, n: int) -> str:
    paras = [p.strip() for p in re.split(r"(?:\r?\n){2,}", block) if p.strip()]
    return " ".join(paras[skip:skip + n])[:320]


ADVISORIES = {
    "tsunami_pdf": ("Tsunami advisory", "alert", "critical"),
    "land_pdf": ("Severe weather advisory (land)", "alert", "warning"),
    "lighting_pdf": ("Severe lightning advisory", "alert", "warning"),
    "sea_pdf": ("Severe weather advisory (sea)", "alert", "warning"),
    "heat_pdf": ("Heat advisory", "alert", "info"),
}


async def fetch_slmet(client: httpx.AsyncClient) -> list[dict]:
    r = await client.get("https://meteo.gov.lk/content.json", headers=UA)
    r.raise_for_status()
    data = r.json()
    out = []

    pwf = _english_block(data.get("public_weather_forecast") or "", "WEATHER FORECAST FOR")
    if pwf:
        title = pwf.splitlines()[0].strip().title()
        heavy = bool(re.search(r"fairly heavy|heavy falls|75\s*mm|100\s*mm|150\s*mm", pwf, re.I))
        out.append(item("slmet-public-" + title, title, _paragraphs(pwf, 1, 2), "SL Met", "🇱🇰",
                        "https://meteo.gov.lk", parse_issued_local(pwf), "weather", "warning" if heavy else "info"))

    sea = _english_block(data.get("sea_weather_forecast") or "", "WEATHER FORECAST FOR SEA AREAS")
    if sea:
        issued = parse_issued_local(sea)
        rough = bool(re.search(r"rough|strong winds|gale", sea, re.I))
        out.append(item(f"slmet-sea-{issued.isoformat() if issued else 'undated'}", "Sea area weather forecast",
                        _paragraphs(sea, 1, 2), "SL Met", "🌊", "https://meteo.gov.lk", issued, "weather",
                        "warning" if rough else "info"))

    fleet = data.get("fleet_shipping_forecast") or ""
    system = re.search(r"[^.\n]*(cyclonic storm|cyclone|deep depression|depression|low[- ]pressure area)[^.\n]*\.", fleet, re.I)
    if system:
        issued = parse_issued_utc(fleet)
        name = re.search(r'"([^"]+)"', system.group(0))
        out.append(item(f"slmet-fleet-{issued.isoformat() if issued else 'undated'}",
                        f'Cyclonic storm "{name.group(1)}"' if name else "Weather system advisory (fleet forecast)",
                        system.group(0).strip(), "SL Met", "🌀", "https://meteo.gov.lk", issued, "cyclone",
                        "critical" if re.search(r"cyclonic storm|severe", system.group(0), re.I) else "warning"))

    for key, path in (data.get("severe_weather_advisory") or {}).items():
        if not path or key not in ADVISORIES:
            continue
        url = f"https://meteo.gov.lk/{path.lstrip('/')}"
        published = None
        try:  # the PDF's Last-Modified is its real publish time
            h = await client.head(url, headers=UA)
            if h.headers.get("last-modified"):
                published = parsedate_to_datetime(h.headers["last-modified"])
        except Exception as e:
            logger.info(f"SL Met advisory HEAD failed for {url}: {e}")
        title, category, severity = ADVISORIES[key]
        out.append(item(f"slmet-{key}-{published.isoformat() if published else 'undated'}", title,
                        "Advisory issued by the Department of Meteorology (PDF).", "SL Met", "⚠️", url,
                        published, category, severity))
    return out


# ---------------------------------------------------------------------------
# NewsFirst (site JSON API behind english.newsfirst.lk)
# ---------------------------------------------------------------------------

async def fetch_newsfirst(client: httpx.AsyncClient) -> list[dict]:
    r = await client.get("https://apienglish.newsfirst.lk/post/tag/weather/0/20/", headers=UA)
    r.raise_for_status()
    posts = r.json().get("postResponseDto")
    if not isinstance(posts, list):
        raise ValueError("unexpected NewsFirst API shape")
    out = []
    for p in posts:
        title = _strip((p.get("title") or {}).get("rendered", ""))
        summary = _strip((p.get("excerpt") or {}).get("rendered", "")) or _strip((p.get("content") or {}).get("rendered", ""))
        if not title or not RELEVANT.search(f"{title} {summary[:300]}"):
            continue
        published = datetime.fromisoformat(p["date_gmt"].replace("Z", "+00:00")) if p.get("date_gmt") else None
        lower = title.lower()
        category, severity = "weather", "info"
        if "cyclone" in lower or "storm" in lower:
            category, severity = "cyclone", "warning"
        elif "flood" in lower or "landslide" in lower or "spill" in lower:
            category, severity = "flood", "warning"
        elif "advisory" in lower or "warning" in lower or "alert" in lower:
            category, severity = "alert", "warning"
        out.append(item(f"newsfirst-{p.get('id')}", title, summary[:300], "NewsFirst", "📰",
                        f"https://english.newsfirst.lk/{p.get('post_url', '').lstrip('/')}", published, category, severity))
    return out


# ---------------------------------------------------------------------------
# GDACS
# ---------------------------------------------------------------------------

def in_region(lon: float, lat: float) -> bool:
    return REGION["west"] <= lon <= REGION["east"] and REGION["south"] <= lat <= REGION["north"]


async def fetch_gdacs(client: httpx.AsyncClient) -> list[dict]:
    # The country= filter returns 204 for multiple countries, so filter by location here.
    since = (datetime.now(timezone.utc) - MAX_AGE).strftime("%Y-%m-%d")
    r = await client.get("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH",
                         params={"eventlist": "TC,FL", "fromdate": since}, headers={**UA, "Accept": "application/json"})
    if r.status_code == 204 or not r.content:
        return []
    r.raise_for_status()
    out = []
    for f in r.json().get("features", []):
        g, p = f.get("geometry") or {}, f.get("properties") or {}
        if g.get("type") != "Point" or not in_region(*g["coordinates"][:2]):
            continue
        level = p.get("alertlevel") or "Green"
        when = p.get("todate") or p.get("fromdate")
        published = datetime.fromisoformat(when).replace(tzinfo=timezone.utc) if when else None
        out.append(item(f"gdacs-{p.get('eventtype')}-{p.get('eventid')}-{p.get('episodeid')}",
                        f"{level} alert: {p.get('name') or p.get('eventtype')}", _strip(p.get("htmldescription") or p.get("description") or ""),
                        "GDACS", "🔴", ((p.get("url") or {}).get("report")) or "https://www.gdacs.org",
                        published, "cyclone" if p.get("eventtype") == "TC" else "flood",
                        {"Red": "critical", "Orange": "warning"}.get(level, "info")))
    return out


# ---------------------------------------------------------------------------
# IMD RSMC New Delhi
# ---------------------------------------------------------------------------

IMD_BASE = "https://rsmcnewdelhi.imd.gov.in/"


def parse_imd(page: str) -> list[dict]:
    block = page[page.find("Cyclone Warnings/Advisory"):] if "Cyclone Warnings/Advisory" in page else page
    m = re.search(r'href="([^"]*Tropical_Weather_Outlook_based_on_(\d{4})_UTC_of_(\d{2})\.(\d{2})\.(\d{4})\.pdf)"', block)
    if not m:
        return []
    href, hhmm, dd, mm, yyyy = m.groups()
    published = datetime(int(yyyy), int(mm), int(dd), int(hhmm[:2]), int(hhmm[2:]), tzinfo=timezone.utc)
    national = re.search(r'href="([^"]+)"[^>]*>\s*National Bulletin', block)
    active = bool(national and "no cyclone" not in national.group(1).lower())
    summary = ("Cyclone bulletins are active for the North Indian Ocean - see RSMC New Delhi."
               if active else "Daily tropical weather outlook for the North Indian Ocean; no cyclone bulletin in force.")
    return [item(f"imd-two-{published.isoformat()}",
                 f"IMD Tropical Weather Outlook ({hhmm} UTC, {published:%d %b %Y})", summary, "IMD RSMC", "🇮🇳",
                 IMD_BASE + href.replace(" ", "%20").lstrip("/"), published, "cyclone",
                 "warning" if active else "info")]


async def fetch_imd(client: httpx.AsyncClient) -> list[dict]:
    r = await client.get(IMD_BASE, headers=UA)
    r.raise_for_status()
    items = parse_imd(r.text)
    if not items:
        raise ValueError("Tropical Weather Outlook link not found (page layout changed?)")
    return items


# ---------------------------------------------------------------------------
# ReliefWeb (API v2, pre-approved appname required)
# ---------------------------------------------------------------------------

async def fetch_reliefweb(client: httpx.AsyncClient, appname: str) -> list[dict]:
    since = (datetime.now(timezone.utc) - MAX_AGE).strftime("%Y-%m-%dT00:00:00+00:00")
    r = await client.post("https://api.reliefweb.int/v2/reports", params={"appname": appname}, headers=UA, json={
        "limit": 10,
        "sort": ["date.created:desc"],
        "fields": {"include": ["title", "url_alias", "date.created", "disaster_type.name", "body"]},
        "filter": {"operator": "AND", "conditions": [
            {"field": "primary_country.iso3", "value": "lka"},
            {"field": "date.created", "value": {"from": since}},
        ]},
    })
    r.raise_for_status()
    out = []
    for rep in r.json().get("data", []):
        f = rep.get("fields", {})
        types = " ".join(t.get("name", "") for t in f.get("disaster_type", []))
        created = (f.get("date") or {}).get("created")
        out.append(item(f"reliefweb-{rep.get('id')}", f.get("title", "ReliefWeb report"), _strip(f.get("body", ""))[:300],
                        "ReliefWeb", "🌐", f.get("url_alias") or f"https://reliefweb.int/node/{rep.get('id')}",
                        datetime.fromisoformat(created) if created else None,
                        "cyclone" if "Cyclone" in types else "flood" if "Flood" in types else "general"))
    return out


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

def finalize(items: list[dict], now: Optional[datetime] = None) -> list[dict]:
    """Drop items older than 30 days; newest first; undated items last."""
    now = now or datetime.now(timezone.utc)
    kept = [i for i in items if not i["publishedAt"] or now - datetime.fromisoformat(i["publishedAt"]) <= MAX_AGE]
    dated = sorted((i for i in kept if i["publishedAt"]), key=lambda i: i["publishedAt"], reverse=True)
    return dated + [i for i in kept if not i["publishedAt"]]


class NewsFeed:
    def __init__(self):
        self.items_by_source: dict[str, list[dict]] = {}
        self.status: dict[str, dict] = {}
        self.refreshed_at: Optional[datetime] = None

    async def refresh(self) -> None:
        appname = get_settings().reliefweb_appname.strip()
        sources = {
            "SL Met": fetch_slmet,
            "NewsFirst": fetch_newsfirst,
            "GDACS": fetch_gdacs,
            "IMD RSMC": fetch_imd,
            "ReliefWeb": (lambda c: fetch_reliefweb(c, appname)) if appname else None,
        }
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            async def run(name, fn):
                checked = datetime.now(timezone.utc).isoformat()
                if fn is None:
                    self.status[name] = {"source": name, "status": "disabled", "lastChecked": checked, "itemCount": 0,
                                         "message": "RELIEFWEB_APPNAME not set (ReliefWeb API v2 needs an approved appname)"}
                    return
                try:
                    items = finalize(await fn(client))
                    self.items_by_source[name] = items
                    self.status[name] = {"source": name, "status": "ok" if items else "empty", "lastChecked": checked,
                                         "itemCount": len(items), "message": None if items else "No current items"}
                except Exception as e:
                    kept = self.items_by_source.get(name, [])
                    logger.warning(f"News source {name} failed: {e}")
                    self.status[name] = {"source": name, "status": "error", "lastChecked": checked,
                                         "itemCount": len(kept), "message": f"{type(e).__name__}: {str(e)[:160]}"}
            await asyncio.gather(*(run(n, f) for n, f in sources.items()))
        for name, st in self.status.items():
            dates = [i["publishedAt"] for i in self.items_by_source.get(name, []) if i["publishedAt"]]
            st["newest"] = max(dates) if dates else None
        self.refreshed_at = datetime.now(timezone.utc)
        logger.info("News refreshed: " + ", ".join(f"{n} {s['status']}({s['itemCount']})" for n, s in self.status.items()))

    def snapshot(self) -> dict:
        items = finalize([i for name, items in self.items_by_source.items()
                          if self.status.get(name, {}).get("status") != "disabled" for i in items])
        return {
            "refreshedAt": self.refreshed_at.isoformat() if self.refreshed_at else None,
            "sources": [self.status[n] for n in sorted(self.status)],
            "items": items,
        }


news_feed = NewsFeed()
