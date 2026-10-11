# SPDX-License-Identifier: Apache-2.0
"""News feed parsing: real dates only, 30-day window, newest first, region filter."""
from datetime import datetime, timedelta, timezone

from app.services import news_feed as nf


def test_slmet_issued_times_are_parsed_not_invented():
    t = nf.parse_issued_local("WEATHER FORECAST FOR 11 OCTOBER 2026\r\nIssued at 05.30 a.m. on 11 October 2026.")
    assert t == datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
    assert nf.parse_issued_local("Issued at 11.30 p.m. on 3 May 2026") == datetime(2026, 5, 3, 18, 0, tzinfo=timezone.utc)
    assert nf.parse_issued_utc("Issued at 0000UTC on 2026.10.11") == datetime(2026, 10, 11, tzinfo=timezone.utc)
    assert nf.parse_issued_local("no issue line here") is None


def test_finalize_drops_old_sorts_newest_first_undated_last():
    now = datetime(2026, 10, 11, tzinfo=timezone.utc)
    mk = lambda i, d: nf.item(i, i, "", "S", "", "", d, "weather")
    out = nf.finalize([mk("old", now - timedelta(days=31)), mk("undated", None),
                       mk("a", now - timedelta(days=2)), mk("b", now - timedelta(hours=1))], now)
    assert [i["id"] for i in out] == ["b", "a", "undated"]


def test_gdacs_region_filter():
    assert nf.in_region(80.7, 7.8)        # Sri Lanka
    assert nf.in_region(83.7, 18.1)       # Bay of Bengal
    assert not nf.in_region(-104.8, 18.2)  # Mexico
    assert not nf.in_region(108.5, 31.3)   # central China


def test_imd_outlook_link_and_date():
    page = ('<h3>Cyclone Warnings/Advisory</h3><ul class="menu">'
            '<li><a href="uploads/No Cyclone.pdf" target="_blank">National Bulletin</a></li>'
            '<li><a href="uploads/archive/2/2_e6b89b_Tropical_Weather_Outlook_based_on_0300_UTC_of_11.10.2026.pdf" '
            'target="_blank">RSMC Bulletin</a></li></ul>')
    [i] = nf.parse_imd(page)
    assert i["publishedAt"] == "2026-10-11T03:00:00+00:00" and i["severity"] == "info"
    assert i["url"].endswith("Tropical_Weather_Outlook_based_on_0300_UTC_of_11.10.2026.pdf")
    active = page.replace("uploads/No Cyclone.pdf", "uploads/archive/1/National_Bulletin_No.3.pdf")
    assert nf.parse_imd(active)[0]["severity"] == "warning"
    assert nf.parse_imd("<html>layout changed</html>") == []


def test_news_endpoint_serves_snapshot_without_fetching(monkeypatch):
    import httpx
    from fastapi.testclient import TestClient
    from app.main import app

    def boom(*a, **k):
        raise AssertionError("page request reached a news source")
    monkeypatch.setattr(httpx.AsyncClient, "send", boom)
    r = TestClient(app).get("/api/news")
    assert r.status_code == 200 and set(r.json()) == {"refreshedAt", "sources", "items"}
