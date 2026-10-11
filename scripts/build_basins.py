#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""
Build frontend/public/data/river_basins.geojson from the Irrigation Dept
river_basins layer (public ArcGIS, no key). Stdlib only; re-run any time:

    python3 scripts/build_basins.py [--offset 0.003] [--out PATH]

- keeps polygons with Shape__Area > 50 km2 (the rest are slivers)
- simplifies server-side (maxAllowableOffset, degrees) to ~150-250 KB
- EPSG:4326, 5 decimal places
- names each basin from the hydrostations inside it (point-in-polygon on the
  station lat/lon, most common station `basin`), else "unnamed"
- properties: name, area_km2, gauges (station names inside)
"""
import argparse
import json
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

BASE = "https://services3.arcgis.com/J7ZFXmR8rSmQ3FGf/arcgis/rest/services"
MIN_AREA_M2 = 50_000_000
OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "data" / "river_basins.geojson"


def query(layer: str, **params) -> list[dict]:
    params = {"f": "json", **params}
    url = f"{BASE}/{layer}/FeatureServer/0/query?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=120) as r:
        data = json.load(r)
    if "error" in data:
        raise SystemExit(f"ArcGIS error: {data['error']}")
    return data["features"]


def signed_area(ring) -> float:
    return sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:])) / 2


def in_ring(x, y, ring) -> bool:
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def esri_to_geojson(rings):
    """Esri rings (outer clockwise, holes counter-clockwise) -> GeoJSON geometry (RFC 7946 winding)."""
    rings = [[(round(x, 5), round(y, 5)) for x, y in r] for r in rings]
    rings = [r for r in rings if len(r) >= 4 and r[0] == r[-1]]
    outers = [[r] for r in rings if signed_area(r) < 0]
    for hole in (r for r in rings if signed_area(r) > 0):
        owner = next((p for p in outers if in_ring(*hole[0], p[0])), None)
        if owner:
            owner.append(hole)
    polys = [[list(reversed(p[0]))] + p[1:] for p in outers]  # exterior CCW, holes CW
    polys = [[[list(pt) for pt in ring] for ring in poly] for poly in polys]
    if not polys:
        return None
    return {"type": "Polygon", "coordinates": polys[0]} if len(polys) == 1 else \
        {"type": "MultiPolygon", "coordinates": polys}


def contains(geom, x, y) -> bool:
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    return any(in_ring(x, y, poly[0]) and not any(in_ring(x, y, h) for h in poly[1:]) for poly in polys)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offset", type=float, default=0.003, help="simplification tolerance, degrees")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    basins = query("river_basins", where=f"Shape__Area > {MIN_AREA_M2}", outFields="FID,Shape__Area",
                   outSR=4326, geometryPrecision=5, maxAllowableOffset=args.offset)
    stations = [f["attributes"] for f in query("hydrostations", where="1=1", outFields="station,basin,latitude,longitude")]

    features = []
    for f in sorted(basins, key=lambda f: -f["attributes"]["Shape__Area"]):
        geom = esri_to_geojson(f["geometry"]["rings"])
        if not geom:
            continue
        inside = [s for s in stations if s["latitude"] and s["longitude"]
                  and contains(geom, s["longitude"], s["latitude"])]
        names = Counter((s["basin"] or "").strip() for s in inside if (s["basin"] or "").strip())
        features.append({
            "type": "Feature",
            "properties": {
                "name": names.most_common(1)[0][0] if names else "unnamed",
                "area_km2": round(f["attributes"]["Shape__Area"] / 1e6, 1),
                "gauges": sorted(s["station"].strip() for s in inside),
            },
            "geometry": geom,
        })

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))
    named = sum(1 for f in features if f["properties"]["name"] != "unnamed")
    print(f"{args.out}: {len(features)} basins ({named} named), {args.out.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
