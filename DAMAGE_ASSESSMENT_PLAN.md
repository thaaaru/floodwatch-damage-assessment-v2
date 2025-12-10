# Damage Assessment Feature - Implementation Plan

**Branch:** `feature/damage-assessment`
**Reference:** https://visualizers.aiforgood.ai/damage-assessment/srilanka_cyclone_ditwah_11_30_2025.html

---

## Executive Summary

Implement satellite-based damage assessment and flood visualization similar to Microsoft AI for Good's Cyclone Ditwah damage assessment tool. This will enable FloodWatch LK to provide visual before/after comparisons, AI-predicted damage overlays, and flood extent mapping.

---

## Key Features to Implement

### 1. **Side-by-Side Imagery Comparison**
- Pre-disaster vs. post-disaster satellite imagery
- Draggable divider for visual comparison
- Keyboard shortcuts (A/D/S for left/right/split)

### 2. **Multi-Layer Damage Visualization**
- Building damage assessment layer
- Flood extent prediction layer
- Toggleable overlays with opacity controls

### 3. **Interactive Map Controls**
- Geocoding/search functionality
- Zoom controls (levels 10-17)
- Layer switcher for different base maps
- Opacity slider for imagery transparency

### 4. **Data Integration**
- GeoJSON boundary/validity masks
- Tile-based imagery serving
- Pre-computed AI damage predictions

---

## Technical Architecture

### Frontend Stack

```
Technology: Next.js + React + Leaflet
Libraries Required:
- leaflet: ^1.9.4 (core mapping)
- react-leaflet: ^4.2.1 (React integration)
- leaflet-side-by-side: ^2.2.0 (imagery comparison)
- leaflet-slider: ^1.0.0 (opacity controls)
- @turf/turf: ^6.5.0 (GeoJSON processing)
```

### Data Sources

**Satellite Imagery:**
1. **Pre-Disaster Baseline:**
   - Esri World Imagery: `http://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
   - Free to use, no API key required

2. **Post-Disaster Imagery:**
   - Planet PlanetScope (commercial, requires API key)
   - Alternative: Sentinel-2 (free via Copernicus Open Access Hub)
   - Alternative: NASA MODIS/VIIRS (free)

**Damage Assessment:**
- AI for Good tile server pattern: `https://opendata.aiforgood.ai/damage-assessment/tiles/...`
- We can host our own tiles on Vercel/CDN

---

## Implementation Phases

### Phase 1: Core Map Infrastructure (Week 1)
**Goals:**
- Set up Leaflet-based damage assessment page
- Implement side-by-side image comparison
- Add basic layer controls

**Tasks:**
```typescript
// Create /app/damage-assessment/page.tsx
// Install dependencies: leaflet, react-leaflet, leaflet-side-by-side
// Implement map component with Colombo bounds
// Add Esri World Imagery base layer
// Integrate side-by-side comparison plugin
```

**Files to Create:**
- `frontend/src/app/damage-assessment/page.tsx`
- `frontend/src/components/DamageMap.tsx`
- `frontend/src/components/ImageryComparisonSlider.tsx`
- `frontend/src/lib/damage-assessment/config.ts`

---

### Phase 2: Layer Management (Week 2)
**Goals:**
- Add damage and flood overlay layers
- Implement opacity controls
- Create layer toggle UI

**Tasks:**
```typescript
// Create damage assessment tile layer
// Create flood prediction tile layer
// Add opacity slider control
// Implement layer toggle checkboxes
// Add keyboard shortcuts
```

**Files to Create:**
- `frontend/src/components/damage-assessment/LayerControl.tsx`
- `frontend/src/components/damage-assessment/OpacitySlider.tsx`
- `frontend/src/lib/damage-assessment/layers.ts`

---

### Phase 3: Data Integration (Week 3)
**Goals:**
- Set up tile server for damage/flood layers
- Process satellite imagery into tiles
- Create validity mask GeoJSON

**Backend Tasks:**
```python
# backend/app/services/damage_tiles.py
# - Generate damage assessment tiles
# - Process satellite imagery
# - Create validity masks
```

**Data Pipeline:**
1. Acquire post-disaster imagery (Sentinel-2 or Planet)
2. Run change detection analysis (NDWI for floods, building detection)
3. Generate damage classification tiles
4. Host tiles on Vercel/CDN

**Files to Create:**
- `backend/app/services/damage_tiles.py`
- `backend/app/services/satellite_processor.py`
- `scripts/generate_damage_tiles.py`

---

### Phase 4: AI Damage Prediction (Week 4)
**Goals:**
- Integrate AI model for damage assessment
- Generate flood extent predictions
- Create building damage classification

**AI/ML Components:**
```python
Models Required:
1. Flood Detection: U-Net or SegNet for water body segmentation
2. Building Damage: ResNet-based classifier (no damage, moderate, severe)
3. Change Detection: Siamese network for pre/post comparison
```

**Potential Services:**
- Microsoft Planetary Computer (free tier)
- Google Earth Engine (requires approval)
- Custom TensorFlow/PyTorch models

**Files to Create:**
- `backend/app/ml/flood_detector.py`
- `backend/app/ml/building_damage_classifier.py`
- `backend/app/ml/change_detector.py`

---

### Phase 5: User Features (Week 5)
**Goals:**
- Add geocoding search
- Implement download/export functionality
- Create damage statistics dashboard

**Features:**
- Location search (integrate Nominatim or Mapbox Geocoding)
- Export damage report as PDF
- Statistics: % buildings damaged, flood extent area
- Time-series comparison (multiple disaster events)

**Files to Create:**
- `frontend/src/components/damage-assessment/Search.tsx`
- `frontend/src/components/damage-assessment/StatsPanel.tsx`
- `frontend/src/lib/damage-assessment/geocoder.ts`

---

## Data Requirements

### Satellite Imagery Sources

**Option 1: Sentinel-2 (FREE)**
- Pros: Free, 10m resolution, global coverage, updated every 5 days
- Cons: Lower resolution than commercial, cloud coverage issues
- Access: Copernicus Open Access Hub API
- Resolution: 10m multispectral

**Option 2: Planet PlanetScope (PAID)**
- Pros: Daily imagery, 3-5m resolution, used in reference tool
- Cons: Requires subscription ($100-500/month)
- Access: Planet API
- Resolution: 3-5m RGB

**Option 3: NASA MODIS/VIIRS (FREE)**
- Pros: Free, daily, global coverage
- Cons: Very low resolution (250-500m), only suitable for large-scale floods
- Access: NASA EARTHDATA API
- Resolution: 250-500m

**Recommendation:** Start with Sentinel-2 for proof of concept, upgrade to Planet if budget allows.

### Damage Assessment Data

**Flood Extent:**
- Use NDWI (Normalized Difference Water Index) from satellite bands
- Formula: NDWI = (Green - NIR) / (Green + NIR)
- Threshold: NDWI > 0.3 indicates water

**Building Damage:**
- Pre-trained models: Microsoft Building Footprints + damage classification
- Alternative: xView2 dataset trained models (disaster damage assessment)
- Manual labeling for Sri Lanka-specific training data

---

## API Integration Plan

### Required APIs

1. **Satellite Imagery API:**
```bash
# Sentinel-2 via Copernicus
curl "https://scihub.copernicus.eu/dhus/search?q=*&rows=100&start=0"

# Planet API (if using)
curl -L -H "Authorization: api-key YOUR_API_KEY" \
  "https://api.planet.com/data/v1/quick-search" \
  -d '{"item_types":["PSScene"], "filter":{...}}'
```

2. **Geocoding API:**
```bash
# Nominatim (free)
curl "https://nominatim.openstreetmap.org/search?q=colombo&format=json"

# Mapbox (better quality, paid)
curl "https://api.mapbox.com/geocoding/v5/mapbox.places/colombo.json?access_token=YOUR_TOKEN"
```

3. **Tile Serving:**
```javascript
// Self-hosted tiles on Vercel
const tileUrl = `https://weather.hackandbuild.dev/tiles/damage/{z}/{x}/{y}.png`;

// Or use external CDN
const tileUrl = `https://cdn.floodwatch.lk/damage-tiles/{event_id}/{z}/{x}/{y}.png`;
```

---

## File Structure

```
floodwatch-lk/
├── frontend/
│   ├── public/
│   │   └── tiles/                    # Static tile cache (if needed)
│   │       └── damage/
│   │           └── {event_id}/
│   │               └── {z}/{x}/{y}.png
│   ├── src/
│   │   ├── app/
│   │   │   └── damage-assessment/
│   │   │       ├── page.tsx          # Main damage assessment page
│   │   │       └── [event_id]/
│   │   │           └── page.tsx      # Specific event view
│   │   ├── components/
│   │   │   └── damage-assessment/
│   │   │       ├── DamageMap.tsx
│   │   │       ├── ImagerySlider.tsx
│   │   │       ├── LayerControl.tsx
│   │   │       ├── OpacitySlider.tsx
│   │   │       ├── Search.tsx
│   │   │       ├── StatsPanel.tsx
│   │   │       └── Legend.tsx
│   │   └── lib/
│   │       └── damage-assessment/
│   │           ├── config.ts
│   │           ├── layers.ts
│   │           ├── geocoder.ts
│   │           └── utils.ts
│   └── package.json                  # Add leaflet dependencies
│
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   │   └── damage_assessment.py  # API endpoints
│   │   ├── services/
│   │   │   ├── damage_tiles.py       # Tile generation
│   │   │   ├── satellite_processor.py # Imagery processing
│   │   │   └── change_detection.py   # Before/after analysis
│   │   └── ml/
│   │       ├── flood_detector.py     # ML flood detection
│   │       └── damage_classifier.py  # Building damage ML
│   └── data/
│       └── satellite/                # Downloaded imagery cache
│
├── scripts/
│   ├── generate_damage_tiles.py      # Tile generation script
│   ├── download_sentinel.py          # Sentinel-2 downloader
│   └── process_event.py              # Full event processing pipeline
│
└── DAMAGE_ASSESSMENT_PLAN.md        # This file
```

---

## Environment Variables

Add to `.env`:

```bash
# Satellite Imagery
COPERNICUS_USERNAME=your_username
COPERNICUS_PASSWORD=your_password
PLANET_API_KEY=your_planet_key  # Optional, if using Planet

# Geocoding
MAPBOX_ACCESS_TOKEN=your_mapbox_token  # Optional, can use Nominatim free

# Tile Storage
TILE_STORAGE_PATH=/path/to/tiles
TILE_CDN_URL=https://cdn.floodwatch.lk

# ML Models
MODEL_PATH=/path/to/ml/models
```

---

## Cost Estimates

### Free Tier (Proof of Concept)
- Sentinel-2 imagery: **FREE**
- Nominatim geocoding: **FREE**
- Vercel hosting (100GB bandwidth): **FREE**
- OpenStreetMap base maps: **FREE**
- **Total: $0/month**

### Production Tier (Recommended)
- Planet PlanetScope imagery: **$100-500/month**
- Mapbox geocoding: **$0.50/1000 requests**
- Vercel Pro (1TB bandwidth): **$20/month**
- CDN for tile hosting: **$10-50/month**
- **Total: $130-$600/month**

### Enterprise Tier (High Volume)
- Planet SkySat (higher res): **$500-2000/month**
- Google Earth Engine: **Custom pricing**
- Dedicated tile server: **$50-200/month**
- **Total: $550-$2200/month**

---

## Success Metrics

1. **Technical Metrics:**
   - Map loads in < 2 seconds
   - Tile rendering at 60fps
   - Support 10,000+ concurrent users
   - 99.9% uptime

2. **Feature Metrics:**
   - Before/after comparison functional
   - Damage layers accurate > 80%
   - Flood detection accuracy > 85%
   - Search results < 1 second

3. **User Metrics:**
   - Damage reports generated
   - Areas searched/analyzed
   - Exported PDFs/screenshots
   - Time spent on damage assessment

---

## Risks & Mitigation

### Risk 1: Satellite Imagery Costs
**Impact:** High monthly costs for Planet imagery
**Mitigation:** Start with free Sentinel-2, upgrade only if needed

### Risk 2: Cloud Cover
**Impact:** Post-disaster imagery obscured by clouds
**Mitigation:** Use SAR imagery (Sentinel-1) which penetrates clouds

### Risk 3: AI Model Accuracy
**Impact:** False damage predictions confuse users
**Mitigation:** Add disclaimer, require ground-truth verification, show confidence scores

### Risk 4: Tile Storage
**Impact:** Large tile datasets (100GB+) storage costs
**Mitigation:** Use on-demand tile generation, cache only recent events

### Risk 5: Processing Time
**Impact:** Slow tile generation (hours to days)
**Mitigation:** Pre-compute tiles for known flood-prone areas, use GPU acceleration

---

## Next Steps

### Immediate (This Week)
1. ✅ Create feature branch: `feature/damage-assessment`
2. [ ] Review this plan with stakeholders
3. [ ] Get approval for satellite imagery access
4. [ ] Set up development environment

### Short-term (Next 2 Weeks)
1. [ ] Install required npm packages (leaflet, react-leaflet)
2. [ ] Create basic damage-assessment page with Leaflet map
3. [ ] Implement side-by-side image comparison
4. [ ] Add layer controls and opacity slider

### Medium-term (Month 1)
1. [ ] Integrate Sentinel-2 API for imagery download
2. [ ] Build tile generation pipeline
3. [ ] Implement NDWI flood detection
4. [ ] Deploy to staging for testing

### Long-term (Month 2-3)
1. [ ] Train/integrate building damage ML model
2. [ ] Add geocoding search
3. [ ] Create damage statistics dashboard
4. [ ] Production deployment
5. [ ] Documentation and training materials

---

## References

- **AI for Good Damage Visualizer:** https://visualizers.aiforgood.ai/damage-assessment/srilanka_cyclone_ditwah_11_30_2025.html
- **Leaflet Documentation:** https://leafletjs.com/reference.html
- **Leaflet Side-by-Side:** https://github.com/digidem/leaflet-side-by-side
- **Sentinel-2 API:** https://scihub.copernicus.eu/
- **Planet API:** https://developers.planet.com/
- **xView2 Dataset:** https://xview2.org/ (building damage training data)
- **Microsoft Planetary Computer:** https://planetarycomputer.microsoft.com/

---

**Status:** Planning Phase
**Priority:** High (disaster response critical feature)
**Estimated Effort:** 4-6 weeks for MVP, 3 months for full production

**Last Updated:** December 10, 2025
