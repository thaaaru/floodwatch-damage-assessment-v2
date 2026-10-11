#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""
Strict river-to-basin matching (scripts/build_rivers.py) and the committed
frontend/public/data/rivers.geojson. Run: python3 scripts/test_build_rivers.py
(or pytest scripts/test_build_rivers.py).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_rivers as br  # noqa: E402

RIVERS = {f["properties"]["name"]: f for f in json.loads(br.OUT.read_text())["features"] if f["properties"]["name"]}
BASIN_ID = {b["properties"]["name"]: b["properties"]["id"]
            for b in json.loads(br.BASINS.read_text())["features"] if b["properties"]["name"] != "unnamed"}


def test_names_must_not_cross_suffix_class():
    assert not br.names_match("Gin Oya", "Gin Ganga")
    assert not br.names_match("Gal Aaru கல்லாறு", "Gal Oya")
    assert not br.names_match("Meemure Oya", "Mee Oya")


def test_aliases_still_match():
    assert br.names_match("Kelani River", "Kelani Ganga")
    assert br.names_match("Kelani Ganga", "Kelani Ganga")
    assert br.names_match("Kaluganga", "Kalu Ganga")
    assert br.names_match("Mahaweli", "Mahaweli Ganga")
    assert br.names_match("Attanagalu Oya", "Aththanagalu Oya")


def test_geometry_gate_rejects_same_name_elsewhere():
    basins = json.loads(br.BASINS.read_text())["features"]
    jaffna_line = [[[80.01, 9.66], [80.03, 9.68]]]
    assert br.match_basins("Kelani Ganga", jaffna_line, basins) == []


def test_committed_file_basin_ids():
    ids = lambda name: RIVERS[name]["properties"]["basin_ids"]
    assert BASIN_ID["Gin Ganga"] not in ids("Gin Oya")
    assert BASIN_ID["Gal Oya"] not in ids("Gal Aaru கல்லாறு")
    assert ids("Kelani River") == [BASIN_ID["Kelani Ganga"]]
    assert ids("Kelani Ganga") == [BASIN_ID["Kelani Ganga"]]
    assert ids("Kaluganga") == [BASIN_ID["Kalu Ganga"]]
    assert ids("Gin Ganga") == [BASIN_ID["Gin Ganga"]]


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"{len(tests)} passed")
