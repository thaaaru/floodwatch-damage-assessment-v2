# FloodWatch LK - Damage Assessment Module

**Public repository** (Apache 2.0). Hosted at **https://floodwatch.teklab.dev**.

> **Not an official warning service.** For warnings, follow the Disaster Management
> Centre (DMC) and the Department of Meteorology.

This is a development fork of FloodWatch LK focused on satellite-based damage assessment and flood visualization capabilities. Inspired by Microsoft AI for Good's Cyclone Ditwah damage assessment visualizer.

**Parent Repository:** https://github.com/thaaaru/floodwatch-lk (Public, Apache 2.0)
**Status:** Experimental - Active Development

---

## What's Being Developed

- 🛰️ Satellite imagery-based damage assessment
- 📊 Before/after imagery comparison with side-by-side slider
- 🏗️ AI-powered building damage classification
- 🌊 Flood extent prediction mapping
- 🗺️ Interactive Leaflet-based visualization
- 📍 Geocoding search for rapid location assessment

**Reference:** https://visualizers.aiforgood.ai/damage-assessment/srilanka_cyclone_ditwah_11_30_2025.html

See [DAMAGE_ASSESSMENT_PLAN.md](DAMAGE_ASSESSMENT_PLAN.md) for detailed implementation plan.

---

## Original FloodWatch LK Description

Real-time flood monitoring for Sri Lanka. The original project sent SMS alerts to subscribers;
in this deployment SMS/WhatsApp alerts are **disabled** (`ALERTS_ENABLED=false`) and no phone
numbers are collected.

## Features

- Real-time rainfall monitoring for all 25 districts of Sri Lanka
- Integration with Open-Meteo weather API and GDACS flood alerts
- SMS/WhatsApp alerts via Twilio (disabled by default; `ALERTS_ENABLED=true` to re-enable)
- Interactive map dashboard with color-coded alert levels
- Multi-language support (English, Sinhala, Tamil)

## Tech Stack

- **Backend**: Python FastAPI
- **Frontend**: Next.js 14 with Tailwind CSS
- **Database**: PostgreSQL
- **SMS**: Twilio
- **Maps**: Leaflet.js on a self-hosted Protomaps basemap (OpenStreetMap data, `scripts/build_basemap.sh`,
  served as `/tiles/lka.pmtiles`; OSM raster fallback)

## Quick Start (Local Development)

### Prerequisites
- Docker and Docker Compose
- Node.js 20+ (for frontend development)
- Python 3.11+ (for backend development)

### Using Docker Compose

```bash
# Clone and start all services
cd floodwatch-lk
docker-compose up -d

# Access:
# - Frontend: http://localhost:3000
# - Backend API: http://localhost:8000
# - API Docs: http://localhost:8000/docs
```

### Manual Setup

#### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env file
cp .env.example .env
# Edit .env with your database and Twilio credentials

# Run
uvicorn app.main:app --reload
```

#### Frontend
```bash
cd frontend
npm install

# Create .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

# Run
npm run dev
```

## Alert Thresholds

| Level | Rainfall (24h) | Description |
|-------|---------------|-------------|
| Green | < 50mm | Normal conditions |
| Yellow | 50-100mm | Watch - Monitor conditions |
| Orange | 100-150mm | Warning - Prepare for flooding |
| Red | > 150mm | Emergency - Take immediate action |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/districts` | GET | List all districts |
| `/api/weather/all` | GET | Weather for all districts |
| `/api/weather/{district}` | GET | Detailed weather for district |
| `/api/alerts` | GET | Active alerts |
| `/api/alerts/history` | GET | Historical alerts |
| `/api/weather/cache-status` | GET | Data freshness (last successful fetch) |
| `/api/subscribe`, `/api/unsubscribe` | POST | Only when `ALERTS_ENABLED=true` (404 otherwise) |

## Deployment

Production: `https://floodwatch.teklab.dev` on a shared Tencent VM. `docker-compose.prod.yml`
runs db + backend + frontend with no host ports; the host's existing Caddy reverse-proxies
over the external `edge` network. The DB password is a Docker secret
(`/run/floodwatch/db_password`, decrypted from age at boot).
See [deploy/teklab/RUNBOOK.md](deploy/teklab/RUNBOOK.md).

`deploy/caddy/Caddyfile` is the previous standalone (GCP) config; legacy DigitalOcean/Vercel
artifacts are in `deploy/_archive/`.

## Environment Variables

### Backend
```
DATABASE_URL=postgresql://user:pass@host:5432/floodwatch   # local dev
DB_PASSWORD_FILE=/run/secrets/db_password                  # prod: overrides DATABASE_URL
ALERTS_ENABLED=false                                       # true also needs TWILIO_* vars
FRONTEND_URL=https://your-frontend-domain.com
```

### Frontend
```
NEXT_PUBLIC_API_URL=https://your-api-domain.com
```

## License

This project is licensed under the Apache License, Version 2.0.

```
Copyright 2025 Tharaka Mahabage

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

See the [LICENSE](LICENSE) file for the full license text.
