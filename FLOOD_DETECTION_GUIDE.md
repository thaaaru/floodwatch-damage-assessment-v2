# Flood Detection Guide - November 28, 2024 Sri Lanka Floods

## Objective

Detect and map areas affected by the November 28, 2024 rainfall using Sentinel-2 satellite imagery and change detection techniques.

---

## Method: NDWI-Based Change Detection

### How It Works:

1. **Calculate water index** (NDWI) from satellite imagery
2. **Compare before/after** the flood event
3. **Identify new water bodies** = flooded areas

### NDWI Formula:

```
NDWI = (Green - NIR) / (Green + NIR)
```

- **Green** = Sentinel-2 Band 3 (560nm)
- **NIR** = Sentinel-2 Band 8 (842nm)
- **Water threshold**: NDWI > 0.3 typically indicates water

### Why This Works:

- **Water absorbs NIR** → Low NIR values
- **Water reflects Green** → High Green values
- **Result**: High NDWI values = water bodies

---

## Option 1: Google Earth Engine (Recommended) ⭐

**Best for:** Full analysis, statistics, export

### Setup (5 minutes):

1. **Sign up** (free): https://code.earthengine.google.com/
   - Use Google account
   - Sign up for "Research & Education" use
   - Wait for approval (usually instant)

2. **Open Code Editor**: https://code.earthengine.google.com/

3. **Copy script**: `backend/scripts/satellite/flood_detection_gee.js`

4. **Paste and Run**

### What You Get:

- ✅ Interactive flood map visualization
- ✅ Before/after comparison layers
- ✅ Flood area statistics (sq km)
- ✅ Export as GeoTIFF for further analysis
- ✅ Export as web tiles for your app

### Date Ranges to Use:

```javascript
// BEFORE the floods
var beforeImage = loadSentinel2('2024-11-01', '2024-11-27', aoi);

// AFTER the floods (Nov 28+ event)
var afterImage = loadSentinel2('2024-11-29', '2024-12-10', aoi);
```

### Export Results:

1. Click **"Tasks"** tab in Earth Engine
2. Click **"Run"** next to export task
3. Choose Google Drive destination
4. Download GeoTIFF when complete

---

## Option 2: Microsoft Planetary Computer (Python)

**Best for:** Programmatic access, automation

### Requirements:

```bash
pip install pystac-client planetary-computer rasterio numpy
```

### Python Script:

```python
# Search for specific date imagery
from pystac_client import Client
import planetary_computer

catalog = Client.open(
    "https://planetarycomputer.microsoft.com/api/stac/v1",
    modifier=planetary_computer.sign_inplace
)

# Before flood (Nov 1-27, 2024)
before_search = catalog.search(
    collections=["sentinel-2-l2a"],
    bbox=[79.7, 6.8, 80.0, 7.0],  # Colombo
    datetime="2024-11-01/2024-11-27",
    query={"eo:cloud_cover": {"lt": 20}}
)

# After flood (Nov 29+)
after_search = catalog.search(
    collections=["sentinel-2-l2a"],
    bbox=[79.7, 6.8, 80.0, 7.0],
    datetime="2024-11-29/2024-12-10",
    query={"eo:cloud_cover": {"lt": 20}}
)

# Download and calculate NDWI
# (See backend/scripts/satellite/search_sentinel2.py for full implementation)
```

---

## Option 3: Copernicus Browser (Manual)

**Best for:** Quick visual inspection, no coding

### Steps:

1. Go to: https://dataspace.copernicus.eu/browser/

2. **Search for imagery:**
   - Area: Draw box around Sri Lanka
   - Date: November 1-27, 2024 (BEFORE)
   - Cloud cover: < 20%
   - Product: Sentinel-2 L2A

3. **Download scenes** (Green, NIR bands)

4. **Repeat for AFTER** (Nov 29 - Dec 10, 2024)

5. **Process in QGIS:**
   - Calculate NDWI raster
   - Compare before/after
   - Export flooded areas

---

## Option 4: Pre-computed Flood Maps

**Check existing sources:**

### NASA MODIS Flood Maps:
- https://floodmap.modaps.eosdis.nasa.gov/
- Near real-time, but lower resolution (250m)

### Copernicus Emergency Management Service:
- https://emergency.copernicus.eu/
- Check if Nov 28 event was mapped

### UN OCHA ReliefWeb:
- https://reliefweb.int/
- Search for flood maps from partners

---

## Integration Into Your App

Once you have flood detection results:

### 1. Export as GeoTIFF from Earth Engine

### 2. Convert to Web Tiles:

```bash
# Using gdal2tiles (if you have GDAL)
gdal2tiles.py -z 10-16 flood_nov28.tif ./tiles/flood_nov28/

# Or use online converter:
# https://www.maptiler.com/
```

### 3. Host Tiles:

```bash
# Upload to Vercel public folder or CDN
cp -r tiles/flood_nov28 frontend/public/tiles/
```

### 4. Add to Map:

```typescript
// In DamageMap.tsx
const floodNov28Layer = L.tileLayer(
  '/tiles/flood_nov28/{z}/{x}/{y}.png',
  {
    attribution: 'Flood detection from Sentinel-2',
    opacity: 0.7
  }
);

// Add to layer controls
if (showFloodLayer) {
  floodNov28Layer.addTo(map);
}
```

---

## Expected Results for Nov 28, 2024 Event

Based on news reports, expect flooding in:

- **Colombo District** (urban flooding)
- **Gampaha District** (low-lying areas)
- **Kalutara District** (coastal areas)
- **Ratnapura District** (heavy rainfall areas)

### Validation:

Cross-reference detected flood areas with:
- Sri Lanka DMC reports: https://www.dmc.gov.lk/
- News reports from Nov 28-30
- Social media reports (Twitter/Facebook)
- Your river water level data (if available)

---

## Timeline

| Step | Time | Tool |
|------|------|------|
| **Sign up for Earth Engine** | 5 min | Google |
| **Run flood detection script** | 2 min | Earth Engine |
| **Review results** | 10 min | Visual inspection |
| **Export GeoTIFF** | 5 min | Earth Engine Tasks |
| **Convert to tiles** | 30 min | MapTiler/gdal2tiles |
| **Integrate into app** | 15 min | Code update |
| **Total** | ~1 hour | |

---

## Next Steps

1. ✅ **Sign up** for Google Earth Engine
2. ✅ **Run** the flood detection script
3. ✅ **Export** flood map as GeoTIFF
4. ✅ **Convert** to web tiles
5. ✅ **Display** in damage assessment map
6. ✅ **Validate** with ground truth data

---

## Resources

**Google Earth Engine:**
- Sign up: https://earthengine.google.com/
- Code Editor: https://code.earthengine.google.com/
- Tutorials: https://developers.google.com/earth-engine/tutorials/community/intro-to-python-api

**Flood Detection Papers:**
- DeVries et al. (2020): "Rapid and robust monitoring of flood events using Sentinel-1 and Sentinel-2"
- Clement et al. (2018): "Multi-temporal synthetic aperture radar flood mapping using change detection"

**Validation Data:**
- DMC Sri Lanka: https://www.dmc.gov.lk/
- ReliefWeb: https://reliefweb.int/country/lka
- GDACS: https://www.gdacs.org/

---

**Updated:** December 10, 2025
**Status:** Ready to implement flood detection
**Priority:** High - Real event analysis
