---
title: Weather cache 429 retry storm (Open-Meteo)
author: Tharaka
date: 2026-10-14
branch: teklab-hosting
touches:
  - backend/app/services/weather_cache.py
---

## Decided
- Root cause of "Data delayed" (2026-10-14): Open-Meteo returned 429 for every call from the prod server IP.
- Every /api/weather request on a stale cache started a refresh_cache(), each one a ~100-call sweep, which kept the IP over the rate limit.
- Fix in weather_cache.py:
  - abort the sweep on the first 429
  - FAILURE_BACKOFF_MINUTES=15 for non-forced refreshes after a failure
  - merge partial results instead of replacing the cache
- The forced scheduler refresh still retries.
## Tried and ruled out
- Not an Open-Meteo outage (it was reachable from a dev machine).
## Watch out
- Prod: ssh ubuntu@43.160.235.21 (root is denied).
- Use the container name floodwatch-floodwatch-backend-1. A name=back filter also matches the synapses-* backends, and docker logs then fails silently.
