#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Extract the basemap from the latest Protomaps daily planet build:
#   lka.pmtiles     Sri Lanka, full detail (maxzoom MAXZOOM, default 15)
#   region.pmtiles  South Asia (65,0,95,25), maxzoom 8, drawn under lka so low
#                   zooms show no edge where the Sri Lanka extract ends
#   context.pmtiles Indian Ocean rim (30,-25,140,40), maxzoom 6, under region,
#                   for the wind map's zoom 4-5 view (~9 MB)
# Re-run monthly (see deploy/teklab/RUNBOOK.md). The .pmtiles file is data,
# never committed: it lives on the server at /opt/floodwatch-data/tiles.
#
#   scripts/build_basemap.sh [OUT_DIR] [MAXZOOM]
#
# Needs docker (go-pmtiles image) and python3. Each file is written via an
# atomic rename, so the tiles service never serves a half-written file.
set -eu

OUT_DIR=${1:-/opt/floodwatch-data/tiles}
MAXZOOM=${2:-15}
LKA_BBOX=79.4,5.8,82.1,10.0
REGION_BBOX=65,0,95,25
REGION_MAXZOOM=8
CONTEXT_BBOX=30,-25,140,40
CONTEXT_MAXZOOM=6
IMAGE=protomaps/go-pmtiles:v1.31.2

BUILD=$(curl -fsS https://build-metadata.protomaps.dev/builds.json |
	python3 -c 'import json,sys; print(json.load(sys.stdin)[-1]["key"])')
echo "Protomaps build: $BUILD"

mkdir -p "$OUT_DIR"
OUT_DIR=$(cd "$OUT_DIR" && pwd)

extract() { # name bbox maxzoom
	echo "== $1.pmtiles: bbox $2, maxzoom $3"
	docker run --rm -v "$OUT_DIR:/out" "$IMAGE" extract \
		"https://build.protomaps.com/$BUILD" "/out/.$1.pmtiles.tmp" \
		--bbox="$2" --maxzoom="$3"
	docker run --rm -v "$OUT_DIR:/out" "$IMAGE" verify "/out/.$1.pmtiles.tmp"
	chmod 0644 "$OUT_DIR/.$1.pmtiles.tmp"
	mv -f "$OUT_DIR/.$1.pmtiles.tmp" "$OUT_DIR/$1.pmtiles"
}

extract context "$CONTEXT_BBOX" "$CONTEXT_MAXZOOM"
extract region "$REGION_BBOX" "$REGION_MAXZOOM"
extract lka "$LKA_BBOX" "$MAXZOOM"
ls -lh "$OUT_DIR"/*.pmtiles
