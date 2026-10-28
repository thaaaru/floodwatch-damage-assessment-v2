# SPDX-License-Identifier: Apache-2.0
"""
Official bulletins, served as published (links out to the PDF; never paraphrased):

  - Met Department severe-weather advisories: read from the news feed's SL Met
    snapshot (meteo.gov.lk/content.json, refreshed every 15 min); no extra calls.
  - DMC situation report: latest "Situation Report" PDF on dmc.gov.lk (report
    type 1), per-district totals from its District Total rows.
  - NBRO landslide early warning: latest PDF under DMC report type 5
    ("Landslide Warning"); district, DS division and level from the table's
    columns (Level 1 Yellow / Level 2 Amber / Level 3 Red), validity window.

The DMC fetcher runs hourly from the scheduler and downloads a PDF only when the
listing points to a new one. Parsed results persist in cache/dmc_bulletins.json.
Rules: a parse that fails or doesn't add up returns the link and date with
parsed_ok=false and no figures; landslide warnings past their validity (or older
than 36 h with none stated) are returned as inactive with no warnings.
"""
import html
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from typing import Optional

import httpx

from .news_feed import ADVISORIES, COLOMBO, MONTHS, UA, news_feed

logger = logging.getLogger(__name__)

DMC = "https://www.dmc.gov.lk"
SITREP_LIST = f"{DMC}/index.php?option=com_dmcreports&view=reports&Itemid=273&report_type_id=1&lang=en"
LANDSLIDE_LIST = f"{DMC}/index.php?option=com_dmcreports&view=reports&Itemid=276&report_type_id=5&lang=en"
CACHE_FILE = Path(__file__).parent.parent.parent / "cache" / "dmc_bulletins.json"
NO_VALIDITY_MAX_AGE = timedelta(hours=36)

DISTRICTS = [
    "Colombo", "Gampaha", "Kalutara", "Kandy", "Matale", "Nuwara Eliya", "Galle", "Matara", "Hambantota",
    "Jaffna", "Kilinochchi", "Mannar", "Mullaitivu", "Vavuniya", "Trincomalee", "Batticaloa", "Ampara",
    "Kurunegala", "Puttalam", "Anuradhapura", "Polonnaruwa", "Badulla", "Monaragala", "Ratnapura", "Kegalle",
]
_ALIASES = {"rathnapura": "Ratnapura", "killinochchi": "Kilinochchi", "mulaitivu": "Mullaitivu",
            "mullativu": "Mullaitivu", "moneragala": "Monaragala", "nuwaraeliya": "Nuwara Eliya",
            "trincomale": "Trincomalee", "kegalla": "Kegalle", "polonnaruva": "Polonnaruwa"}
_CANON = {re.sub(r"[^a-z]", "", d.lower()): d for d in DISTRICTS} | _ALIASES


def district_name(text: str) -> Optional[str]:
    """'Rathnapura' / 'Nuwara Eliya ' -> canonical district (frontend lib/districts.ts spelling), else None."""
    return _CANON.get(re.sub(r"[^a-z]", "", text.lower()))


# ---------------------------------------------------------------------------
# DMC report listing (Joomla com_dmcreports table)
# ---------------------------------------------------------------------------

def parse_listing(page: str) -> list[dict]:
    """Rows newest first: {title, published (Colombo time), url}."""
    rows = []
    for m in re.finditer(r'<tr class="rowdate_\d+">(.*?)</tr>', page, re.S):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", m.group(1), re.S)]
        href = re.search(r'href="([^"]+\.pdf)"', m.group(1), re.I)
        if len(cells) < 3 or not href:
            continue
        published = None
        try:
            published = datetime.strptime(f"{cells[1]} {cells[2]}", "%Y-%m-%d %H:%M").replace(tzinfo=COLOMBO)
        except ValueError:
            pass
        rows.append({"title": cells[0], "published": published, "url": DMC + "/" + href.group(1).lstrip("/")})
    return rows


def pdf_text(data: bytes) -> str:
    from pypdf import PdfReader
    return "\n".join(p.extract_text() or "" for p in PdfReader(BytesIO(data)).pages)


def pdf_fragments(data: bytes) -> list[list]:
    """Text fragments in content-stream order as [x, text]; x is the page position (points)."""
    from pypdf import PdfReader
    out: list[list] = []

    def visit(text, cm, tm, *_):
        x = tm[4] * cm[0] + tm[5] * cm[2] + cm[4]
        out.extend([round(x, 1), line.strip()] for line in text.split("\n") if line.strip())

    for p in PdfReader(BytesIO(data)).pages:
        p.extract_text(visitor_text=visit)
    return out


# ---------------------------------------------------------------------------
# DMC situation report
# ---------------------------------------------------------------------------

SITREP_FIELDS = ["affected_families", "affected_people", "deaths", "injured", "missing", "houses_fully_damaged",
                 "houses_partially_damaged", "sme_damaged", "infrastructure_damaged", "safe_locations",
                 "safe_location_families", "safe_location_people"]
_TWELVE = re.compile(r"^\d+(?: \d+){11}$")


def parse_sitrep(text: str) -> dict:
    """District Total rows are 12 numbers in SITREP_FIELDS order (column order checked against the
    header positions on the 2026-10-25 report). The last such row is the GRAND TOTAL: districts must
    add up to it, otherwise parsed_ok is False and no figures are returned."""
    m = re.search(r"Date\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})(?:\s+at\s+(\d{2})(\d{2})\s*hrs)?", text)
    report_time = None
    if m and m.group(2).lower() in MONTHS:
        report_time = datetime(int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1)),
                               int(m.group(4) or 0), int(m.group(5) or 0), tzinfo=COLOMBO)
    districts, current, rows = {}, None, []
    for line in (ln.strip() for ln in text.splitlines()):
        if district_name(line):
            current = district_name(line)
        elif _TWELVE.match(line):
            nums = [int(n) for n in line.split()]
            rows.append(nums)
            if current and current not in districts:
                districts[current] = dict(zip(SITREP_FIELDS, nums))
            current = None
    totals = {f: sum(d[f] for d in districts.values()) for f in SITREP_FIELDS}
    ok = bool(districts) and bool(rows) and list(totals.values()) == rows[-1]
    return {
        "report_time": report_time.isoformat() if report_time else None,
        "districts": [{"district": k, **v} for k, v in districts.items()] if ok else [],
        "totals": totals if ok else None,
        "parsed_ok": ok,
    }


# ---------------------------------------------------------------------------
# NBRO landslide early warning
# ---------------------------------------------------------------------------

LEVELS = {1: "Level 1 (Yellow)", 2: "Level 2 (Amber)", 3: "Level 3 (Red)"}
_BOILERPLATE = re.compile(r"Divisional Secretariat|Division\(s\)|surrounding areas", re.I)


def _when(d, mo, y, h, mi) -> datetime:
    return datetime(int(y), int(mo), int(d), int(h), int(mi), tzinfo=COLOMBO)


def parse_landslide(text: str, fragments: list[list]) -> dict:
    """Level comes from the column a DS cell sits in: each fragment takes the nearest header
    (District / Level 1 / Level 2 / Level 3) by x. Districts are matched by name in the first
    column; DS cells follow their district in content order (also across pages)."""
    valid = re.search(r"From\s+(\d{1,2})[:.](\d{2})\s*hrs\s+on\s+(\d{1,2})\.(\d{1,2})\.(\d{4})\s+To\s+"
                      r"(\d{1,2})[:.](\d{2})\s*hrs\s+on\s+(\d{1,2})\.(\d{1,2})\.(\d{4})", text, re.I)
    issued = re.search(r"(\d{1,2})-(\d{1,2})-(\d{4}),\s*(\d{1,2})[:.](\d{2})\s*hrs", text)
    msg = re.search(r"Message ID:\s*(LEWM-[\w-]+)", text)
    valid_from = valid_until = issued_at = None
    if valid:
        g = valid.groups()
        valid_from, valid_until = _when(g[2], g[3], g[4], g[0], g[1]), _when(g[7], g[8], g[9], g[5], g[6])
    if issued:
        g = issued.groups()
        issued_at = _when(g[0], g[1], g[2], g[3], g[4])
    issued_at = issued_at or valid_from

    cols: dict[int, float] = {}
    warnings, current = [], None
    for x, t in fragments:
        if len(cols) < 4:
            if t.startswith("District") and "Level" not in t:
                cols[0] = x
            for lv in (1, 2, 3):
                if t.startswith(f"Level {lv}"):
                    cols[lv] = x
            if re.match(r"District\s+Level 1", t):  # whole header row in one fragment: can't place columns
                break
            continue
        if t.startswith("Note:"):
            break
        col = min(cols, key=lambda c: abs(cols[c] - x))
        if col == 0:
            current = district_name(t) or current
            continue
        if not current or _BOILERPLATE.search(t):
            continue
        for name in re.split(r",|\band\b", t):
            name = re.sub(r"^[\s*↑↓]+|[\s*↑↓]+$", "", name).strip()
            if re.search(r"[A-Za-z]", name):
                warnings.append({"district": current, "ds_division": name, "level": col, "level_label": LEVELS[col]})
    ok = len(cols) == 4 and issued_at is not None
    return {
        "message_id": msg.group(1) if msg else None,
        "issued_at": issued_at.isoformat() if issued_at else None,
        "valid_from": valid_from.isoformat() if valid_from else None,
        "valid_until": valid_until.isoformat() if valid_until else None,
        "warnings": warnings if ok else [],
        "parsed_ok": ok,
    }


def landslide_active(b: dict, now: Optional[datetime] = None) -> bool:
    now = now or datetime.now(timezone.utc)
    if b.get("valid_until"):
        return now < datetime.fromisoformat(b["valid_until"])
    start = b.get("issued_at") or b.get("listed_at")
    return bool(start) and now - datetime.fromisoformat(start) < NO_VALIDITY_MAX_AGE


def landslide_view(b: Optional[dict], now: Optional[datetime] = None) -> dict:
    """What the API serves: expired warnings are never presented as active."""
    if not b:
        return {"issued_at": None, "valid_until": None, "report_url": None, "warnings": [], "parsed_ok": False, "active": False}
    active = landslide_active(b, now)
    return {**b, "active": active, "warnings": b["warnings"] if active else []}


# ---------------------------------------------------------------------------
# Met Department advisories (from the news snapshot)
# ---------------------------------------------------------------------------

ADVISORY_TYPE = {"land_pdf": "land", "sea_pdf": "sea", "lighting_pdf": "lightning", "tsunami_pdf": "tsunami", "heat_pdf": "heat"}


def met_advisories() -> dict:
    items = news_feed.items_by_source.get("SL Met", [])
    out = []
    for key, kind in ADVISORY_TYPE.items():
        for i in items:
            if i["id"].startswith(f"slmet-{key}-"):
                out.append({"type": kind, "title": ADVISORIES[key][0], "url": i["url"], "issued_at": i["publishedAt"]})
    status = news_feed.status.get("SL Met", {})
    return {"advisories": out, "checked_at": status.get("lastChecked"), "source_status": status.get("status")}


# ---------------------------------------------------------------------------
# Fetch + cache
# ---------------------------------------------------------------------------

class DmcBulletins:
    def __init__(self):
        self.data: dict = {"sitrep": None, "landslide": None}
        try:
            if CACHE_FILE.exists():
                self.data.update(json.loads(CACHE_FILE.read_text()))
        except Exception as e:
            logger.warning(f"DMC bulletin cache unreadable, starting empty: {e}")

    def _save(self):
        try:
            CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            CACHE_FILE.write_text(json.dumps(self.data))
        except Exception as e:
            logger.warning(f"Could not write DMC bulletin cache: {e}")

    async def _latest(self, client: httpx.AsyncClient, list_url: str, want) -> Optional[dict]:
        r = await client.get(list_url, headers=UA)
        r.raise_for_status()
        return next((row for row in parse_listing(r.text) if want(row["title"])), None)

    async def refresh_sitrep(self, client: httpx.AsyncClient):
        row = await self._latest(client, SITREP_LIST, lambda t: t.lower().startswith("situation report"))
        if not row:
            raise ValueError("no Situation Report row on the DMC listing (layout changed?)")
        old = self.data.get("sitrep")
        if old and old.get("report_url") == row["url"]:
            return
        base = {"report_url": row["url"], "listed_at": row["published"].isoformat() if row["published"] else None}
        try:
            pdf = await client.get(row["url"], headers=UA)
            pdf.raise_for_status()
            parsed = parse_sitrep(pdf_text(pdf.content))
        except Exception as e:
            logger.warning(f"DMC situation report parse failed for {row['url']}: {e}")
            parsed = {"report_time": None, "districts": [], "totals": None, "parsed_ok": False}
        rt = parsed["report_time"] or base["listed_at"]
        self.data["sitrep"] = {**base, **parsed, "report_time": rt, "report_date": rt[:10] if rt else None}

    async def refresh_landslide(self, client: httpx.AsyncClient):
        row = await self._latest(client, LANDSLIDE_LIST, lambda t: "landslide" in t.lower())
        if not row:
            raise ValueError("no landslide warning row on the DMC listing (layout changed?)")
        old = self.data.get("landslide")
        if old and old.get("report_url") == row["url"]:
            return
        base = {"report_url": row["url"], "listed_at": row["published"].isoformat() if row["published"] else None}
        try:
            pdf = await client.get(row["url"], headers=UA)
            pdf.raise_for_status()
            parsed = parse_landslide(pdf_text(pdf.content), pdf_fragments(pdf.content))
        except Exception as e:
            logger.warning(f"Landslide warning parse failed for {row['url']}: {e}")
            parsed = {"message_id": None, "issued_at": None, "valid_from": None, "valid_until": None,
                      "warnings": [], "parsed_ok": False}
        self.data["landslide"] = {**base, **parsed, "issued_at": parsed["issued_at"] or base["listed_at"]}

    async def refresh(self):
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            for name, fn in (("situation report", self.refresh_sitrep), ("landslide warning", self.refresh_landslide)):
                try:
                    await fn(client)
                except Exception as e:  # keep the last good bulletin
                    logger.warning(f"DMC {name} refresh failed: {e}")
        self.data["checked_at"] = datetime.now(timezone.utc).isoformat()
        self._save()

    def sitrep(self) -> dict:
        s = self.data.get("sitrep")
        if not s:
            return {"report_date": None, "report_url": None, "districts": [], "totals": None, "parsed_ok": False}
        return s


dmc_bulletins = DmcBulletins()
