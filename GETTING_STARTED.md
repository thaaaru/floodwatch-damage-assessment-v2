# Getting Started - Damage Assessment Development

## Quick Reference

**Repository:** https://github.com/thaaaru/floodwatch-damage-assessment (PRIVATE)
**Parent:** https://github.com/thaaaru/floodwatch-lk (PUBLIC)
**Working Directory:** `/Users/tharaka/floodwatch-damage-assessment`

---

## What We're Building

Satellite-based damage assessment tool inspired by:
https://visualizers.aiforgood.ai/damage-assessment/srilanka_cyclone_ditwah_11_30_2025.html

Features:
- Before/after satellite imagery comparison
- AI-powered building damage classification
- Flood extent prediction mapping
- Interactive Leaflet visualization
- Geocoding search

---

## Development Plan

See [DAMAGE_ASSESSMENT_PLAN.md](DAMAGE_ASSESSMENT_PLAN.md) for the full 5-phase implementation plan.

### Phase 1: Core Map Infrastructure (Week 1)
- Set up Leaflet-based map
- Implement side-by-side image comparison
- Add basic layer controls

### Phase 2: Layer Management (Week 2)
- Damage and flood overlay layers
- Opacity controls
- Layer toggle UI

### Phase 3: Data Integration (Week 3)
- Set up tile server
- Process satellite imagery
- Create validity masks

### Phase 4: AI Damage Prediction (Week 4)
- Integrate ML models
- Flood detection
- Building damage classification

### Phase 5: User Features (Week 5)
- Geocoding search
- Export/download functionality
- Statistics dashboard

---

## Working on Features

```bash
# Create new feature branch
git checkout -b feature/your-feature-name

# Make changes, commit frequently
git add .
git commit -m "feat: your feature description"

# Push to private repo
git push origin feature/your-feature-name

# When ready, merge to main
git checkout main
git merge feature/your-feature-name
git push origin main
```

---

## Installing Dependencies

### Frontend (Leaflet for maps)
```bash
cd frontend
npm install leaflet react-leaflet leaflet-side-by-side
```

### Backend (Satellite processing)
```bash
cd backend
pip install rasterio sentinelsat numpy opencv-python
```

---

## Data Sources

**Free Options:**
- Sentinel-2: 10m resolution satellite imagery (ESA Copernicus)
- OpenStreetMap: Base maps
- Nominatim: Geocoding

**Paid Options:**
- Planet PlanetScope: 3-5m resolution daily imagery
- Mapbox: Enhanced geocoding

---

## Important Files

- `DAMAGE_ASSESSMENT_PLAN.md` - Complete implementation plan
- `frontend/src/app/damage-assessment/` - Future home of UI components
- `backend/app/services/damage_tiles.py` - Future tile generation
- `backend/app/ml/` - Future ML models

---

## Privacy Note

This is a **PRIVATE** repository. Do not:
- Share code publicly without permission
- Commit API keys or credentials
- Make repository public

When features are stable, they can be merged back to the public parent repository.

---

## Need Help?

- Review: [DAMAGE_ASSESSMENT_PLAN.md](DAMAGE_ASSESSMENT_PLAN.md)
- Reference: https://visualizers.aiforgood.ai/damage-assessment/srilanka_cyclone_ditwah_11_30_2025.html
- Leaflet Docs: https://leafletjs.com/
- Sentinel-2 API: https://scihub.copernicus.eu/

---

**Last Updated:** December 10, 2025
**Status:** Ready for Phase 1 development
