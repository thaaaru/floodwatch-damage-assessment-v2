# Archived deployment artifacts

These configurations target deployment targets that are no longer in active use:

- `digitalocean/` - Original DigitalOcean droplet + App Platform setup.
- `vercel/` - Original Vercel frontend deployment configuration.
- `frontend-deploy.sh` - SSH-based frontend deploy script for the old DO droplet (IP `142.93.218.223`).

**Current production target:** Google Cloud Platform VM running `docker-compose.prod.yml`
behind Caddy (`deploy/caddy/Caddyfile`), serving `https://floodwatch.teklab.dev`.

Kept here for historical reference. Safe to delete once the GCP migration is
fully validated and no rollback path is needed.
