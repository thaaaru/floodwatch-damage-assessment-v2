#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""
Build frontend/public/data/rivers.geojson from HDX "Waterways of Sri Lanka"
(HOT OSM, ODbL). Stdlib only; the ~12 MB download goes to a temp dir and is
never written into the repo. Re-run any time:

    python3 scripts/build_rivers.py [--tol 0.0005] [--min-unnamed-km 5] [--canals]

- keeps waterway=river (canals only with --canals)
- name = OSM name, else name_en; same-name segments merged into one
  MultiLineString feature (case-insensitive); unnamed rivers shorter than
  --min-unnamed-km are dropped, the rest merged into one unnamed feature
- Douglas-Peucker simplification (--tol degrees), EPSG:4326, 5 decimals
- properties: name, name:si, name:ta, waterway, basin_ids
- basin_ids: ids of gauged basins (frontend/public/data/river_basins.geojson,
  build it first) whose name strictly matches the river name (see
  river_key) AND whose polygon the river line enters. The browser colours a
  river only from these ids; it does no name or geometry matching itself.
"""
import argparse
import io
import json
import math
import re
import tempfile
import urllib.request
import zipfile
from pathlib import Path

PACKAGE = "https://data.humdata.org/api/3/action/package_show?id=hotosm_lka_waterways"
DATA = Path(__file__).resolve().parent.parent / "frontend" / "public" / "data"
OUT = DATA / "rivers.geojson"
BASINS = DATA / "river_basins.geojson"

# Suffix classes. "river" (or no suffix) is a wildcard that matches any class;
# otherwise classes must be equal, so "Gin Oya" != "Gin Ganga" and
# "Gal Aaru" != "Gal Oya", while "Kelani River" == "Kelani Ganga".
SUFFIX = {"ganga": "ganga", "oya": "oya", "aru": "aru", "aaru": "aru", "ela": "ela", "river": None}


def river_key(name):
    """(stem, suffix class) from a Latin-script name, e.g. 'Kaluganga' -> ('kalu', 'ganga')."""
    words = re.findall(r"[a-z]+", (name or "").lower().replace("th", "t"))
    if not words:
        return None
    cls = None
    if words[-1] in SUFFIX:
        cls = SUFFIX[words.pop()]
    elif words[-1].endswith("ganga") and len(words[-1]) > 5:  # "Kaluganga"
        words[-1], cls = words[-1][:-5], "ganga"
    stem = "".join(words)
    return (stem, cls) if stem else None


def names_match(a, b) -> bool:
    ka, kb = river_key(a), river_key(b)
    return bool(ka and kb and ka[0] == kb[0] and (ka[1] is None or kb[1] is None or ka[1] == kb[1]))


def in_ring(x, y, ring) -> bool:
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def polygon_contains(geom, x, y) -> bool:
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    return any(in_ring(x, y, p[0]) and not any(in_ring(x, y, h) for h in p[1:]) for p in polys)


def line_enters(lines, basin_geom) -> bool:
    """True if any river vertex lies inside the basin polygon."""
    return any(polygon_contains(basin_geom, x, y) for line in lines for x, y in line)


def match_basins(river_name, lines, basins) -> list:
    return sorted(b["properties"]["id"] for b in basins
                  if b["properties"]["name"] != "unnamed"
                  and names_match(river_name, b["properties"]["name"])
                  and line_enters(lines, b["geometry"]))


def geojson_url() -> str:
    with urllib.request.urlopen(PACKAGE, timeout=60) as r:
        res = json.load(r)["result"]["resources"]
    return next(x["url"] for x in res if x["format"].lower() == "geojson")


def load_features(tmp: Path) -> list[dict]:
    with urllib.request.urlopen(geojson_url(), timeout=300) as r:
        zipfile.ZipFile(io.BytesIO(r.read())).extractall(tmp)
    src = next(tmp.rglob("*.geojson"))
    return json.loads(src.read_text())["features"]


def simplify(pts, tol):
    """Iterative Douglas-Peucker."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy) or 1e-12
        idx, dmax = None, tol
        for i in range(a + 1, b):
            x0, y0 = pts[i]
            d = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / norm
            if d > dmax:
                idx, dmax = i, d
        if idx is not None:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def length_km(pts) -> float:
    return sum(math.hypot((x2 - x1) * 110.3, (y2 - y1) * 110.6) for (x1, y1), (x2, y2) in zip(pts, pts[1:]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tol", type=float, default=0.0005, help="simplification tolerance, degrees")
    ap.add_argument("--min-unnamed-km", type=float, default=5.0)
    ap.add_argument("--canals", action="store_true")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    kinds = {"river", "canal"} if args.canals else {"river"}
    with tempfile.TemporaryDirectory() as tmp:
        raw = load_features(Path(tmp))

    named: dict[str, dict] = {}
    unnamed = []
    for f in raw:
        p, g = f["properties"], f["geometry"]
        if p.get("waterway") not in kinds or g["type"] != "LineString":
            continue
        pts = simplify([(round(x, 5), round(y, 5)) for x, y in g["coordinates"]], args.tol)
        pts = [pt for i, pt in enumerate(pts) if i == 0 or pt != pts[i - 1]]
        if len(pts) < 2:
            continue
        line = [list(pt) for pt in pts]
        name = (p.get("name") or p.get("name_en") or "").strip()
        if not name:
            if length_km(pts) >= args.min_unnamed_km:
                unnamed.append(line)
            continue
        feat = named.setdefault(name.casefold(), {
            "type": "Feature",
            "properties": {"name": name, "name:si": None, "name:ta": None, "waterway": p["waterway"]},
            "geometry": {"type": "MultiLineString", "coordinates": []},
        })
        feat["properties"]["name:si"] = feat["properties"]["name:si"] or p.get("name_si")
        feat["properties"]["name:ta"] = feat["properties"]["name:ta"] or p.get("name_ta")
        feat["geometry"]["coordinates"].append(line)

    basins = json.loads(BASINS.read_text())["features"]
    by_id = {b["properties"]["id"]: b["properties"]["name"] for b in basins}
    features = sorted(named.values(), key=lambda f: f["properties"]["name"])
    for f in features:
        f["properties"]["basin_ids"] = match_basins(f["properties"]["name"], f["geometry"]["coordinates"], basins)
    if unnamed:
        features.append({"type": "Feature",
                         "properties": {"name": None, "name:si": None, "name:ta": None, "waterway": "river",
                                        "basin_ids": []},
                         "geometry": {"type": "MultiLineString", "coordinates": unnamed}})

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                                   separators=(",", ":"), ensure_ascii=False))
    print(f"{args.out}: {len(features)} features ({len(named)} named rivers, {len(unnamed)} unnamed lines), "
          f"{args.out.stat().st_size / 1024:.0f} KB")
    for f in features:
        if f["properties"]["basin_ids"]:
            print(f"  {f['properties']['name']} -> {', '.join(by_id[i] for i in f['properties']['basin_ids'])}")


if __name__ == "__main__":
    main()
