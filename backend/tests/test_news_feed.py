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


def test_newsfirst_keeps_only_sri_lanka_items():
    nepal = ("Flash Floods Sweep Away Several Houses in Nepal's Gorkha",
             "A flash flood in the Budhi Gandaki River in Gorkha District of Nepal; the Department of "
             "Hydrology and Meteorology said...")
    assert not nf.about_sri_lanka(*nepal)
    # The Colombo dateline alone is not enough
    assert not nf.about_sri_lanka("Floods in India", "COLOMBO (News 1st): Heavy rain in Kerala displaced thousands.")
    assert nf.about_sri_lanka("Two Spill Gates of Deduru Oya Opened", "COLOMBO (News 1st): The reservoir...")
    assert nf.about_sri_lanka("Landslide alerts", "COLOMBO (News 1st): The NBRO has issued warnings for Kegalle.")
    assert nf.about_sri_lanka("Heavy showers expected", "Thundershowers in the Sabaragamuwa and Western provinces.")
    assert nf.about_sri_lanka("3,495 People Affected by Heavy Rains Across 15 Districts",
                              "COLOMBO (News 1st) - The National Disaster Relief Services Centre says...")
    assert nf.about_sri_lanka("Amber advisory", "The Department of Meteorology has issued an advisory.")


def test_imd_cyclone_advisory_while_storm_active():
    page = ('<img src="images/warning.png"><a href="uploads/x.pdf" target="_blank"> Severe Cyclonic Storm “Arnab”  over'
            ' Westcentral Bay of Bengal</a><h3>Cyclone Warnings/Advisory</h3><ul class="menu">'
            '<li><a href="uploads/archive/1/1_ad3cac_25._National_Bulletin_No_25-28Oct2026_0830IST.pdf">National Bulletin</a></li>'
            '<li><a href="uploads/archive/2/2_2c1273_Tropical_cyclone_advisory__No.18_based_on_0300_UTC_of_28.10.2026.pdf">'
            'RSMC Bulletin</a></li></ul>')
    [i] = nf.parse_imd(page)
    assert i["publishedAt"] == "2026-10-28T03:00:00+00:00" and i["severity"] == "warning"
    assert i["title"].startswith("IMD Tropical Cyclone Advisory") and "Arnab” over Westcentral" in i["summary"]


def test_expiry_fleet_valid_period_and_weakened_imd_storm():
    fleet = "Valid period: 2026.10.30/0600UTC to 2026.10.30/1400UTC\r\nIssued at 0000UTC on 2026.10.30"
    assert nf.parse_valid_until(fleet) == datetime(2026, 10, 30, 14, 0, tzinfo=timezone.utc)
    assert nf.parse_valid_until("no validity line") is None
    # Storm weakened to a well marked low: the advisory PDF is still the newest link, but it is no longer a warning.
    page = ('<img src="images/warning.png"><a href="uploads/x.pdf"> WML over south Chhattisgarh</a>'
            '<h3>Cyclone Warnings/Advisory</h3><ul class="menu">'
            '<li><a href="uploads/archive/1/1_45207b_34._National_Bulletin_No_34-29Oct2026_1730IST.pdf">National Bulletin</a></li>'
            '<li><a href="uploads/archive/2/2_51b887_Tropical_cyclone_advisory__No.26_based_on_0600_UTC_of_29.10.2026.pdf">'
            'RSMC Bulletin</a></li></ul>')
    [i] = nf.parse_imd(page)
    assert i["kind"] == "Forecast" and i["expiresAt"] is None
    live = nf.parse_imd(page.replace("WML over south Chhattisgarh", "Deep Depression over Westcentral Bay of Bengal"))[0]
    assert live["kind"] == "Warning" and live["expiresAt"] == "2026-10-30T06:00:00+00:00"


def test_gdacs_uses_latest_episode_level_and_flags_only_sri_lanka_storms():
    def tc(lon, lat, country, overall="Red", episode="Orange"):
        return {"geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {"eventtype": "TC", "eventid": 1, "episodeid": 10, "name": "Tropical Cyclone X",
                               "alertlevel": overall, "episodealertlevel": episode, "iscurrent": "true",
                               "country": country, "todate": "2026-10-28T06:00:00"}}
    [india] = nf.parse_gdacs([tc(83.7, 18.1, "India")])
    assert india["title"] == "Orange alert: Tropical Cyclone X"   # not the lifetime Red
    assert india["kind"] is None and india["severity"] == "info"  # stays as news
    [ours] = nf.parse_gdacs([tc(82.5, 8.0, "")])
    assert ours["kind"] == "Warning" and ours["severity"] == "warning"
    [named] = nf.parse_gdacs([tc(88.0, 16.0, "India, Sri Lanka", episode="Red")])
    assert named["kind"] == "Warning" and named["severity"] == "critical"
