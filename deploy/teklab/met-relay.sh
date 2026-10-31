#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Met Dept relay: meteo.gov.lk only answers Sri Lankan IP addresses, so the FloodWatch server
# (outside Sri Lanka) can't fetch the 3-hourly rainfall bulletin itself. Run this on any
# always-on machine in Sri Lanka, every 15 minutes:
#   */15 * * * * MET_RELAY_TOKEN_FILE=$HOME/.floodwatch-relay-token /path/to/met-relay.sh
# The token file holds the same value as MET_RELAY_TOKEN in the server's .env (mode 600).
set -euo pipefail
TOKEN=$(cat "${MET_RELAY_TOKEN_FILE:?set MET_RELAY_TOKEN_FILE}")
curl -fsS -m 60 "https://meteo.gov.lk/excels/3hourly.xlsx?t=$(date +%s)" |
  curl -fsS -m 60 -X POST -H "X-Relay-Token: $TOKEN" -H "Content-Type: application/octet-stream" \
    --data-binary @- "${FLOODWATCH_URL:-https://floodwatch.teklab.dev}/api/weather/met-stations/upload"
echo
