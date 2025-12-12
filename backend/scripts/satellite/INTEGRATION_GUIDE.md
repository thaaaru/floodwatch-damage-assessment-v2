# Integrating Flood Detection into Web Map

## Current Status

✅ **Completed:**
- Damage assessment map with before/after comparison
- Sentinel-2 base imagery (2020/2021 cloudless mosaics)
- UI controls and layer management
- Google Earth Engine flood detection script (working)

❌ **Missing:**
- Actual flood detection overlay on the web map
- Nov 28, 2024 flood extent visualization

---

## The Gap

**Earth Engine** → **Web Map** integration requires these steps:

1. Export flood detection results from Earth Engine as GeoTIFF
2. Convert GeoTIFF to web-compatible format (GeoJSON or map tiles)
3. Add flood layer to the damage assessment map
4. Style and display the flood overlay

---

## Option 1: GeoJSON Overlay (Recommended for Small Areas) ⭐

### Step 1: Export from Earth Engine

In the Earth Engine Code Editor, after running the flood detection script:

1. Click **"Tasks"** tab (orange icon, top right)
2. Find task: **"sri_lanka_flood_nov28_2024"**
3. Click **"Run"**
4. Wait for export to complete (5-30 minutes)
5. Download GeoTIFF from **Google Drive → EarthEngine** folder

### Step 2: Convert GeoTIFF to GeoJSON

Using GDAL (command line):

```bash
# Convert to vector format
gdal_polygonize.py flood_nov28_2024.tif -f "GeoJSON" flood_nov28.geojson

# Simplify geometry (optional, for smaller file size)
ogr2ogr -simplify 0.0001 flood_nov28_simplified.geojson flood_nov28.geojson
```

**OR** use QGIS (GUI):
1. Open GeoTIFF in QGIS
2. Raster → Conversion → Polygonize
3. Export as GeoJSON
4. Right-click layer → Export → Save Features As → GeoJSON

### Step 3: Add to Web Map

Place the GeoJSON file:
```bash
cp flood_nov28.geojson frontend/public/data/flood_nov28.geojson
```

Update `DamageMap.tsx`:

```typescript
import { useEffect, useState } from 'react';

// Inside the component
useEffect(() => {
  if (!map) return;

  // Load flood GeoJSON
  fetch('/data/flood_nov28.geojson')
    .then(res => res.json())
    .then(data => {
      const floodLayer = L.geoJSON(data, {
        style: {
          fillColor: '#ff0000',
          fillOpacity: 0.6,
          color: '#ff0000',
          weight: 1
        }
      });

      if (showFloodLayer) {
        floodLayer.addTo(map);
      }

      // Store reference for toggling
      setFloodLayerRef(floodLayer);
    });
}, [map, showFloodLayer]);
```

---

## Option 2: Map Tiles (Recommended for Large Areas)

### Step 1: Export from Earth Engine

Same as Option 1 - download the GeoTIFF.

### Step 2: Convert to Map Tiles

Using `gdal2tiles` (command line):

```bash
# Generate tiles for zoom levels 10-16
gdal2tiles.py -z 10-16 flood_nov28_2024.tif ./tiles/flood_nov28/
```

**OR** use MapTiler (online):
1. Go to: https://www.maptiler.com/
2. Upload GeoTIFF
3. Configure as overlay layer
4. Download generated tiles

### Step 3: Host Tiles

Upload tiles to Vercel:
```bash
cp -r tiles/flood_nov28 frontend/public/tiles/
```

### Step 4: Add to Web Map

Update `DamageMap.tsx`:

```typescript
// Add flood tile layer
const floodTileLayer = L.tileLayer(
  '/tiles/flood_nov28/{z}/{x}/{y}.png',
  {
    attribution: 'Flood detection from Sentinel-2 (Nov 28, 2024)',
    opacity: 0.7,
    maxZoom: 16,
    tms: false // Set to true if using TMS tile naming
  }
);

if (showFloodLayer) {
  floodTileLayer.addTo(map);
}
```

---

## Option 3: Quick Prototype with Earth Engine Map ID

**Fastest option for testing** - Display Earth Engine results directly:

### Step 1: Get Map ID from Earth Engine

Add this to your Earth Engine script:

```javascript
// After calculating newFlood
var visParams = {palette: ['red']};
var mapId = newFlood.getMapId(visParams);

print('Map ID:', mapId.mapid);
print('Token:', mapId.token);
print('Tile URL:', mapId.urlFormat);
```

### Step 2: Use in Web Map

Copy the tile URL from console and add to `DamageMap.tsx`:

```typescript
const floodEETiles = L.tileLayer(
  'https://earthengine.googleapis.com/v1alpha/{MAPID}/tiles/{z}/{x}/{y}',
  {
    attribution: 'Google Earth Engine',
    opacity: 0.7
  }
);
```

**⚠️ Note:** Map IDs expire after ~24 hours, so this is only for testing!

---

## Option 4: Use Earth Engine Python API to Generate Tiles

Create a Python script to automate the export:

```python
import ee

ee.Initialize(project='sri-lanka-flood-detection')

# Run flood detection
# ... (same as flood_detection_python.py)

# Export as Cloud Optimized GeoTIFF
task = ee.batch.Export.image.toCloudStorage(
    image=new_flood,
    description='flood_nov28_web',
    bucket='your-gcs-bucket',
    fileNamePrefix='floods/nov28',
    scale=10,
    region=aoi,
    fileFormat='GeoTIFF',
    formatOptions={'cloudOptimized': True}
)

task.start()
```

Then serve tiles directly from Google Cloud Storage or convert to tiles.

---

## Recommended Workflow for Your Project

### For Gampaha District (Current Focus):

**Use Option 1 (GeoJSON)** - Area is small enough

1. ✅ Run Earth Engine script (already done - you said it looks good!)
2. ⏳ Export GeoTIFF from Earth Engine Tasks
3. ⏳ Convert to GeoJSON using GDAL or QGIS
4. ⏳ Add to `frontend/public/data/flood_nov28_gampaha.geojson`
5. ⏳ Update `DamageMap.tsx` to load and display GeoJSON

### For Full Sri Lanka:

**Use Option 2 (Map Tiles)** - Area is too large for GeoJSON

---

## Next Steps to Show Flood Areas on Web Map

### Immediate Action Required:

1. **In Earth Engine Code Editor:**
   - Click "Tasks" tab
   - Click "Run" on the export task
   - Wait for it to complete (check Google Drive)

2. **Let me know when the export is complete:**
   - I'll help convert the GeoTIFF to GeoJSON
   - Then integrate it into the web map

**OR**

If you don't have GDAL installed locally, you can:
- Upload the GeoTIFF to a service like MapTiler
- Or share the file and we can find an online converter

---

## Alternative: Use Existing Flood Data Source

While waiting for Earth Engine export, we could integrate:

### DesInventar Flood Data
- Historical flood events with locations
- Available as GeoJSON from their API
- Shows past flood-affected areas

### DMC Sri Lanka Data
- If they publish Nov 28 flood extent
- Usually available as PDF maps (would need digitization)

### Copernicus Emergency Management
- Check if they mapped this event
- Pre-processed flood extents

Would you like to:
1. **Wait for Earth Engine export** and integrate the actual Nov 28 flood detection?
2. **Use placeholder flood data** from DesInventar to show the concept?
3. **Try a different flood event** that already has data available?

---

**The web map UI is ready** - it just needs the actual flood data layer added!
