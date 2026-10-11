# FloodWatch LK on the TekLab (Tencent) VM — Runbook

Host: Ubuntu 24.04, shared with Synapses. FloodWatch is compose project `floodwatch`
(`name:` in `docker-compose.prod.yml`), publishes **no host ports**, and is reached by
`synapses-app-caddy-1` over the external docker network `edge`.

| Item | Location |
|---|---|
| Code | `/opt/floodwatch` (git clone, branch `teklab-hosting` / `main`) |
| Non-secret config | `/opt/floodwatch/.env` (from `.env.production.example`) |
| Encrypted secrets | `/etc/floodwatch/secrets/db_password.age`, optional `owm_api_key.age` |
| age identity | `/etc/age/tencent.key` (root, 0400) |
| Decrypted (tmpfs) | `/run/floodwatch/db_password` — dir 0700 root, file 0440 root:1000 |
| DB volume | `floodwatch_postgres_data` |
| Basemap tiles | `/opt/floodwatch-data/tiles/{lka,region,context}.pmtiles` (~175 + 10 + 9 MB, never in git) |

All commands below run from `/opt/floodwatch` as root (or sudo) and use
`dc() { docker compose -f docker-compose.prod.yml "$@"; }`.

## 1. First deploy

```bash
# 1. Code + config
git clone https://github.com/thaaaru/floodwatch-damage-assessment-v2.git /opt/floodwatch
cd /opt/floodwatch && git checkout teklab-hosting
cp .env.production.example .env && chmod 600 .env   # all optional; see comments inside

# 2. DB password secret (generate on the server; never echo it)
install -d -m 0700 /etc/floodwatch/secrets
AGE_RECIPIENT=$(age-keygen -y /etc/age/tencent.key)
openssl rand -hex 32 | age -r "$AGE_RECIPIENT" -o /etc/floodwatch/secrets/db_password.age
# Optional OpenWeatherMap One Call key (file secret only, never in .env).
# Without it the script creates an empty /run/floodwatch/owm_api_key and early warning returns 503.
read -rs OWM_KEY && printf '%s' "$OWM_KEY" | age -r "$AGE_RECIPIENT" \
  -o /etc/floodwatch/secrets/owm_api_key.age && unset OWM_KEY

# 3. Decrypt-at-boot unit
install -m 0755 deploy/teklab/floodwatch-secrets.sh /usr/local/sbin/floodwatch-secrets
install -m 0644 deploy/teklab/floodwatch-secrets.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now floodwatch-secrets.service
ls -la /run/floodwatch            # expect: drwx------ root root; -r--r----- root 1000 db_password

# 4. Shared network; attach Synapses' Caddy
docker network inspect edge >/dev/null 2>&1 || docker network create edge
docker network connect edge synapses-app-caddy-1
#    Make it permanent in the Synapses compose file (caddy service:
#    `networks: [default, edge]` + top-level `edge: {external: true}`),
#    otherwise the attachment is lost when that container is recreated.

# 5. Caddy site block: append deploy/teklab/Caddyfile.snippet to the Synapses
#    Caddyfile, then validate + reload (zero downtime):
docker exec synapses-app-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec synapses-app-caddy-1 caddy reload   --config /etc/caddy/Caddyfile

# 6. DNS: A record floodwatch.teklab.dev -> VM public IP (Caddy obtains the cert).

# 6b. Self-hosted basemap, three Protomaps extracts (~195 MB; needs ~2x free disk while building):
#     lka.pmtiles     Sri Lanka 79.4,5.8,82.1,10.0 to z15 (detail)
#     region.pmtiles  South Asia 65,0,95,25 to z8 (drawn under lka: no edge at low zoom)
#     context.pmtiles Indian Ocean rim 30,-25,140,40 to z6 (under region: wind map z4-5)
scripts/build_basemap.sh /opt/floodwatch-data/tiles 15
#    Without it the tiles service returns 404 and every map falls back to
#    tile.openstreetmap.org raster tiles (console warning), so this is not a blocker.

# 7. Start
dc up -d --build
dc ps                                   # all healthy
docker exec synapses-app-caddy-1 wget -qO- http://floodwatch-backend:8000/api/health
curl -sI https://floodwatch.teklab.dev | head -1
```

Arch note: the backend pins `rasterio==1.3.10` (x86_64 wheels only); on an ARM VM the
build fails (source build needs a yanked numpy). Confirm `uname -m` = `x86_64`.

Build note: 2 vCPU / 7.5 GB — the frontend `next build` and backend GDAL wheel builds are
the peak; build when Synapses is quiet, or build images elsewhere and push.

## 2. Update

```bash
cd /opt/floodwatch
git rev-parse HEAD > .last-good          # remember the rollback point
git pull
dc up -d --build                         # recreates only changed services
dc ps && dc logs --tail=50 floodwatch-backend
```

## 3. Rotate the DB password

Postgres only reads `POSTGRES_PASSWORD_FILE` on first init, so the live role must be
changed in the DB too.

```bash
NEW=$(openssl rand -hex 32)
# via stdin (printf is a builtin), so the value never appears in `ps` output
printf "ALTER ROLE floodwatch PASSWORD '%s';\n" "$NEW" | \
  dc exec -T db psql -U floodwatch -d floodwatch -v ON_ERROR_STOP=1
printf '%s' "$NEW" | age -r "$(age-keygen -y /etc/age/tencent.key)" \
  -o /etc/floodwatch/secrets/db_password.age
unset NEW
systemctl restart floodwatch-secrets.service
# The secret is a bind mount of the old inode; recreate to pick up the new file.
dc up -d --force-recreate db floodwatch-backend
```

OpenWeatherMap key: re-encrypt `owm_api_key.age` as in §1, then
`systemctl restart floodwatch-secrets.service && dc up -d --force-recreate floodwatch-backend`.

Rotating the age key: re-encrypt every `*.age` to the new recipient, replace
`/etc/age/tencent.key`, `systemctl restart floodwatch-secrets.service`.

## 4. Rollback

```bash
git checkout "$(cat .last-good)"
dc up -d --build
```
Schema changes are created by the app on start (`create_all`, additive only); if an
update ever ships a destructive migration, restore the pre-update backup (§5).

## 5. Backup / restore (floodwatch DB only)

```bash
# Backup (run before every update; cron daily)
install -d -m 0700 /var/backups/floodwatch
dc exec -T db pg_dump -U floodwatch -d floodwatch -Fc \
  > /var/backups/floodwatch/floodwatch-$(date +%F-%H%M).dump
find /var/backups/floodwatch -name '*.dump' -mtime +14 -delete

# Restore
dc stop floodwatch-backend floodwatch-frontend
dc exec -T db pg_restore -U floodwatch -d floodwatch --clean --if-exists \
  < /var/backups/floodwatch/<file>.dump
dc start floodwatch-backend floodwatch-frontend
```

## 5b. Basemap refresh (monthly)

All three extracts come from the latest Protomaps daily planet build in one
`build_basemap.sh` run (about 2-8 min). Each is written to a temp file, verified
and renamed into place atomically, so `floodwatch-tiles` needs no restart.

```bash
# /etc/cron.d/floodwatch-basemap  (03:30 Colombo on the 1st of each month)
CRON_TZ=Asia/Colombo
30 3 1 * * root cd /opt/floodwatch && scripts/build_basemap.sh /opt/floodwatch-data/tiles 15 >> /var/log/floodwatch-basemap.log 2>&1
```
Check: `curl -sI -H 'Range: bytes=0-15' https://floodwatch.teklab.dev/tiles/lka.pmtiles`
must return `206` with `Content-Range: bytes 0-15/<size>` (same for region/context). Browsers revalidate
within a day (`Cache-Control: max-age=86400`, ETag); pmtiles-js refetches its
header if the ETag changes mid-session. If the size grows past ~300 MB, rebuild
with maxzoom 14.

## 6. Removal

```bash
# Caddy: delete the floodwatch.teklab.dev block from the Synapses Caddyfile, then reload.
cd /opt/floodwatch
dc down            # keeps the DB volume; add -v ONLY to destroy floodwatch data
systemctl disable --now floodwatch-secrets.service
rm -f /etc/systemd/system/floodwatch-secrets.service /usr/local/sbin/floodwatch-secrets
systemctl daemon-reload
rm -rf /run/floodwatch /etc/floodwatch /opt/floodwatch-data /etc/cron.d/floodwatch-basemap
# Leave the `edge` network unless nothing else uses it:
docker network inspect edge --format '{{len .Containers}}'
```
Never use `docker system prune` / `docker volume prune` on this shared host.

## Operational notes

- SMS/WhatsApp alerts are off (`ALERTS_ENABLED=false`): `/api/subscribe`,
  `/api/unsubscribe`, `/api/subscribers/*`, `/api/whatsapp/*` return 404 and the alert
  engine records alerts but never sends messages. No Twilio config is deployed.
- SOS feed is off (`SOS_ENABLED=false`): `/api/intel/{priorities,clusters,summary,district,actions,raw-sos}`
  and `POST /api/intel/refresh` return 404 and floodsupport.org is never fetched.
- OpenWeatherMap One Call (only if `/run/floodwatch/owm_api_key` is non-empty): fetched only by the scheduler,
  25 district points x one call every `OWM_REFRESH_MINUTES` (120) = 25 x 12 = 300/day. HTTP endpoints read the cache only. Hard cap 900
  calls per UTC day in table `owm_usage`; check with `curl .../early-warning/status` or
  `dc exec -T db psql -U floodwatch -tAc "select * from owm_usage order by day desc limit 3"`.
- Freshness: the banner reads `/api/weather/cache-status` (`last_update`,
  `last_attempt_ok`) and flags data older than 3 h or a failed latest fetch.
- News (/news): the backend refreshes SL Met, NewsFirst, GDACS (Sri Lanka region),
  IMD RSMC and ReliefWeb every 15 min; pages read `GET /api/news` (snapshot + per-source
  status). ReliefWeb stays "Not configured" until `RELIEFWEB_APPNAME` is set in `.env` to
  an appname approved by ReliefWeb (request form linked at
  https://apidoc.reliefweb.int/parameters#appname), then `dc up -d floodwatch-backend`.
- Basemap: `floodwatch-tiles` (caddy:2-alpine, 64m/0.25 CPU, edge network only) serves
  `/tiles/{lka,region,context}.pmtiles` with HTTP Range; the host Caddy routes `/tiles/*` to it and must
  not re-encode it (see `@compressible` in the snippet). No CORS headers: same-origin only.
  Optional "Satellite (Esri)" overlay appears only if `NEXT_PUBLIC_ARCGIS_API_KEY` is set
  in `.env` at build time (public browser key; restrict it to the site referrer).
- Limits: db 512m/0.5 CPU, backend 768m/1 CPU, frontend 512m/0.5 CPU, tiles 64m/0.25 CPU; logs json-file
  10m x 3. Check with `docker stats --no-stream $(dc ps -q)`.
