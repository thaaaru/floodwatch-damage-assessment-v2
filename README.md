# FloodWatch LK - Damage Assessment Module 🔒

**Private Development Repository**

This is a private development fork of FloodWatch LK focused on satellite-based damage assessment and flood visualization capabilities. Inspired by Microsoft AI for Good's Cyclone Ditwah damage assessment visualizer.

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

Real-time flood monitoring and early warning system for Sri Lanka that sends SMS alerts to subscribers when flood conditions are detected.

## Features

- Real-time rainfall monitoring for all 25 districts of Sri Lanka
- Integration with Open-Meteo weather API and GDACS flood alerts
- SMS alerts via Twilio for flood warnings
- Interactive map dashboard with color-coded alert levels
- Multi-language support (English, Sinhala, Tamil)

## Tech Stack

- **Backend**: Python FastAPI
- **Frontend**: Next.js 14 with Tailwind CSS
- **Database**: PostgreSQL
- **SMS**: Twilio
- **Maps**: Leaflet.js with OpenStreetMap

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
| `/api/subscribe` | POST | Subscribe to SMS alerts |
| `/api/unsubscribe` | POST | Unsubscribe from alerts |

## Deployment

### DigitalOcean (Backend)

See `deploy/digitalocean/` for deployment scripts and instructions.

### Vercel (Frontend)

1. Connect your GitHub repository to Vercel
2. Set environment variable: `NEXT_PUBLIC_API_URL=https://your-api-domain.com`
3. Deploy

## Environment Variables

### Backend
```
DATABASE_URL=postgresql://user:pass@host:5432/floodwatch
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890
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
