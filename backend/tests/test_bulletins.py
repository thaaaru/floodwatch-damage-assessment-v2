# SPDX-License-Identifier: Apache-2.0
"""Official bulletin parsers, on text/fragments extracted (pypdf) from real DMC/NBRO PDFs."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.services import bulletins as b

FIX = Path(__file__).parent / "fixtures" / "bulletins"


def landslide(name: str) -> dict:
    d = json.loads((FIX / name).read_text())
    return b.parse_landslide(d["text"], d["fragments"])


def test_listing_rows_newest_first_with_colombo_time():
    rows = b.parse_listing((FIX / "sitrep_listing.html").read_text())
    assert rows[0]["title"] == "Situation Report"
    assert rows[0]["url"] == "https://www.dmc.gov.lk/images/dmcreports/Situation_Report_on_2026__1792904092.pdf"
    assert rows[0]["published"] == datetime(2026, 10, 25, 4, 30, tzinfo=timezone.utc)
    assert rows[1]["title"].startswith("Drought")  # the refresher skips these


def test_sitrep_district_totals_add_up_to_grand_total():
    s = b.parse_sitrep((FIX / "sitrep_2026-10-25.txt").read_text())
    assert s["parsed_ok"] and s["report_time"] == "2026-10-25T10:00:00+05:30"
    assert len(s["districts"]) == 22
    kandy = next(d for d in s["districts"] if d["district"] == "Kandy")
    assert (kandy["affected_families"], kandy["affected_people"], kandy["injured"], kandy["houses_partially_damaged"],
            kandy["safe_location_people"]) == (533, 2002, 8, 199, 21)
    # PDF spellings map to lib/districts.ts names
    assert {"Ratnapura", "Kilinochchi", "Mullaitivu"} <= {d["district"] for d in s["districts"]}
    assert s["totals"]["affected_people"] == 10311 and s["totals"]["deaths"] == 12


def test_sitrep_that_does_not_add_up_returns_no_figures():
    text = (FIX / "sitrep_2026-10-25.txt").read_text().replace("533 2002 0 8 0 2 199 1 6 1 7 21", "533 2002 0 8 0 2 199 1 6 1 7 2l")
    s = b.parse_sitrep(text)
    assert not s["parsed_ok"] and s["districts"] == [] and s["totals"] is None
    junk = b.parse_sitrep("scanned image, no text")
    assert not junk["parsed_ok"] and junk["districts"] == [] and junk["report_time"] is None


def test_landslide_levels_come_from_columns():
    r = landslide("landslide_2026-10-27.json")
    assert r["parsed_ok"] and r["message_id"] == "LEWM-27-10-2026-1600-34"
    assert r["issued_at"] == "2026-10-27T16:00:00+05:30" and r["valid_until"] == "2026-10-28T16:00:00+05:30"
    by = {(w["district"], w["ds_division"]): w["level"] for w in r["warnings"]}
    assert by[("Colombo", "Seethawaka")] == 1
    assert by[("Gampaha", "Attanagalla")] == 2
    assert by[("Kalutara", "Bulathsinhala")] == 3
    assert by[("Kegalle", "Warakapola")] == 2  # cell continues on the next page
    assert by[("Kurunegala", "Kurunegala")] == 2 and by[("Kurunegala", "Narammala")] == 1
    assert by[("Ratnapura", "Pelmadulla")] == 3 and by[("Nuwara Eliya", "Kothmale West")] == 2
    assert len(r["warnings"]) == 71
    # markers (*, arrows) and "and" are stripped
    assert ("Kalutara", "Millaniya") in by and not any("↑" in n or "*" in n or " and" in n for _, n in by)


def test_expired_warning_is_not_active():
    r = {**landslide("landslide_2026-10-26.json"), "report_url": "u"}
    until = datetime.fromisoformat(r["valid_until"])
    live = b.landslide_view(r, until - timedelta(minutes=1))
    assert live["active"] and len(live["warnings"]) == 71
    gone = b.landslide_view(r, until + timedelta(minutes=1))
    assert not gone["active"] and gone["warnings"] == [] and gone["report_url"] == "u"
    # no validity stated: 36 h from issue
    nv = {**r, "valid_until": None}
    issued = datetime.fromisoformat(r["issued_at"])
    assert b.landslide_view(nv, issued + timedelta(hours=35))["active"]
    assert not b.landslide_view(nv, issued + timedelta(hours=37))["active"]


def test_landslide_parse_failure_keeps_link_only():
    r = b.parse_landslide("Landslide Early Warning letter", [[40, "Dear Sir,"], [40, "Colombo"]])
    assert not r["parsed_ok"] and r["warnings"] == []
    v = b.landslide_view({**r, "report_url": "u", "issued_at": None, "listed_at": None})
    assert v["report_url"] == "u" and not v["active"] and v["warnings"] == []


def test_district_aliases():
    assert b.district_name("Rathnapura") == "Ratnapura"
    assert b.district_name("Nuwara Eliya ") == "Nuwara Eliya"
    assert b.district_name("Divisional Secretariat") is None
