#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Extract the Sri Lanka basemap from the latest Protomaps daily planet build.
# Re-run monthly (see deploy/teklab/RUNBOOK.md). The .pmtiles file is data,
# never committed: it lives on the server at /opt/floodwatch-data/tiles.
#
#   scripts/build_basemap.sh [OUT_DIR] [MAXZOOM]
#
# Needs docker (go-pmtiles image) and python3. Writes OUT_DIR/lka.pmtiles via
# an atomic rename, so the tiles service never serves a half-written file.
set -eu

OUT_DIR=${1:-/opt/floodwatch-data/tiles}
MAXZOOM=${2:-15}
BBOX=79.4,5.8,82.1,10.0
IMAGE=protomaps/go-pmtiles:v1.31.2

BUILD=$(curl -fsS https://build-metadata.protomaps.dev/builds.json |
	python3 -c 'import json,sys; print(json.load(sys.stdin)[-1]["key"])')
echo "Protomaps build: $BUILD (bbox $BBOX, maxzoom $MAXZOOM)"

mkdir -p "$OUT_DIR"
OUT_DIR=$(cd "$OUT_DIR" && pwd)
docker run --rm -v "$OUT_DIR:/out" "$IMAGE" extract \
	"https://build.protomaps.com/$BUILD" /out/.lka.pmtiles.tmp \
	--bbox="$BBOX" --maxzoom="$MAXZOOM"
docker run --rm -v "$OUT_DIR:/out" "$IMAGE" verify /out/.lka.pmtiles.tmp

chmod 0644 "$OUT_DIR/.lka.pmtiles.tmp"
mv -f "$OUT_DIR/.lka.pmtiles.tmp" "$OUT_DIR/lka.pmtiles"
ls -lh "$OUT_DIR/lka.pmtiles"
