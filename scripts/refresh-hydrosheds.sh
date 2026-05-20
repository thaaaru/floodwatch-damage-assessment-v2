#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Regenerate frontend/src/app/floods/data/{lk_basins,lk_rivers}.json from
# HydroSHEDS source shapefiles. Run rarely; the data is reference-static
# (basin geometry and river network barely change year over year).
#
# Outputs are clipped to Sri Lanka (bbox 79.5,5.5,82.0,10.0).
#
# Usage:
#   scripts/refresh-hydrosheds.sh
#
# Requirements: python3 with fiona + shapely. Auto-installed into a venv
# under /tmp if missing.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/frontend/src/app/floods/data"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

VENV="$WORK/venv"
python3 -m venv "$VENV"
"$VENV/bin/pip" install --quiet fiona shapely

cd "$WORK"

echo "Downloading HydroBASINS L8 Asia + HydroRIVERS Asia..."
curl -sS -o hybas.zip "https://data.hydrosheds.org/file/HydroBASINS/standard/hybas_as_lev08_v1c.zip" &
curl -sS -o rivers.zip "https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_as_shp.zip" &
wait
unzip -q hybas.zip
unzip -q rivers.zip

"$VENV/bin/python" - "$OUT_DIR" <<'PY'
import json, os, sys
from pathlib import Path
import fiona
from shapely.geometry import shape, mapping, box

out_dir = Path(sys.argv[1])
out_dir.mkdir(parents=True, exist_ok=True)

LK_BBOX = (79.5, 5.5, 82.0, 10.0)
lk_box = box(*LK_BBOX)

def clip(src_path, dst_path, keep_props, *, simplify, filter_fn=None):
    feats = []
    with fiona.open(src_path) as src:
        for feat in src.filter(bbox=LK_BBOX):
            if filter_fn and not filter_fn(feat):
                continue
            geom = shape(feat["geometry"])
            if not geom.is_valid:
                geom = geom.buffer(0)
            clipped = geom.intersection(lk_box)
            if clipped.is_empty:
                continue
            if simplify:
                clipped = clipped.simplify(simplify, preserve_topology=True)
            feats.append({
                "type": "Feature",
                "geometry": mapping(clipped),
                "properties": {k: v for k, v in feat["properties"].items() if k in keep_props},
            })
    with open(dst_path, "w") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f, separators=(",", ":"))
    print(f"  wrote {dst_path} ({len(feats)} features, {os.path.getsize(dst_path):,} bytes)")

print("\nClipping HydroBASINS L8...")
clip(
    "hybas_as_lev08_v1c.shp",
    out_dir / "lk_basins.json",
    {"HYBAS_ID", "NEXT_DOWN", "NEXT_SINK", "MAIN_BAS", "SUB_AREA", "UP_AREA", "ORDER"},
    simplify=0.001,
)

print("\nClipping HydroRIVERS (Strahler order >= 3 only)...")
clip(
    "HydroRIVERS_v10_as_shp/HydroRIVERS_v10_as.shp",
    out_dir / "lk_rivers.json",
    {"HYRIV_ID", "MAIN_RIV", "ORD_STRA", "ORD_FLOW", "DIS_AV_CMS", "LENGTH_KM"},
    simplify=0.0005,
    filter_fn=lambda f: (f["properties"].get("ORD_STRA") or 0) >= 3,
)
PY

echo "Done."
