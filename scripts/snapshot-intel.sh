#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Regenerate frontend/src/app/intel/snapshot.json by hitting the live API.
# The /intel page is intentionally static and reads from this file at build
# time. Run this script + redeploy the frontend whenever you want a refresh.
#
# Usage:
#   scripts/snapshot-intel.sh                  # uses https://floodwatch.teklab.dev
#   BASE_URL=http://localhost:8000 scripts/snapshot-intel.sh
set -euo pipefail

BASE_URL="${BASE_URL:-https://floodwatch.teklab.dev}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAPSHOT="$REPO_ROOT/frontend/src/app/intel/snapshot.json"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

# Endpoints the /intel page consumed before it was made static.
# Keys here MUST match the keys read in frontend/src/app/intel/page.tsx.
declare -A endpoints=(
  [summary]="/api/intel/summary"
  [priorities]="/api/intel/priorities?limit=100"
  [clusters]="/api/intel/clusters"
  [actions]="/api/intel/actions"
  [floodThreat]="/api/intel/flood-threat"
  [irrigation]="/api/intel/irrigation"
  [trafficFlow]="/api/intel/traffic-flow"
  [trafficIncidents]="/api/intel/traffic"
  [allFacilities]="/api/intel/facilities"
  [floodPatterns]="/api/intel/flood-patterns?district=Colombo&years=30"
  [environmental]="/api/intel/environmental?start_year=1994&end_year=2024"
  [yesterdayStats]="/api/weather/yesterday/stats"
)

echo "Fetching from $BASE_URL ..."
for key in "${!endpoints[@]}"; do
  url="$BASE_URL${endpoints[$key]}"
  code=$(curl -fsS -o "$TMPDIR/$key.json" -w "%{http_code}" --max-time 60 "$url" || echo "FAIL")
  if [[ "$code" != "200" ]]; then
    echo "  FAIL  $key  HTTP $code  ($url)" >&2
    exit 1
  fi
  printf "  ok    %-20s (%d bytes)\n" "$key" "$(wc -c < "$TMPDIR/$key.json")"
done

python3 - "$TMPDIR" "$SNAPSHOT" <<'PY'
import json, sys
from datetime import datetime, timezone
from pathlib import Path

tmpdir, out_path = Path(sys.argv[1]), Path(sys.argv[2])
raw = {k: json.loads((tmpdir / f"{k}.json").read_text()) for k in [
    "summary", "priorities", "clusters", "actions",
    "floodThreat", "irrigation", "trafficFlow", "trafficIncidents",
    "allFacilities", "floodPatterns", "environmental", "yesterdayStats",
]}

# Flatten responses to match what the page actually destructured.
snapshot = {
    "captured_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "summary": raw["summary"],
    "priorities": raw["priorities"].get("reports", []),
    "clusters": raw["clusters"].get("clusters", []),
    "actions": raw["actions"].get("actions", []),
    "floodThreat": raw["floodThreat"],
    "irrigation": raw["irrigation"],
    "trafficFlow": raw["trafficFlow"],
    "trafficIncidents": raw["trafficIncidents"].get("incidents", []),
    "allFacilities": raw["allFacilities"],
    "floodPatterns": raw["floodPatterns"],
    "environmental": raw["environmental"],
    "yesterdayStats": raw["yesterdayStats"],
}

out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(json.dumps(snapshot, indent=2))
print(f"\nWrote {out_path} ({out_path.stat().st_size} bytes)")
print(f"Captured at: {snapshot['captured_at']}")
PY
