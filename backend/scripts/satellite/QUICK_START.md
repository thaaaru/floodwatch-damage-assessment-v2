# Quick Start: Nov 28, 2024 Flood Detection

## 🎯 Goal
Detect and visualize areas flooded by the November 28, 2024 rainfall event in Sri Lanka.

---

## ⚡ 3-Minute Setup

### Step 1: Open Earth Engine Code Editor
Go to: **https://code.earthengine.google.com/**

### Step 2: Copy the Script
Open this file on your computer:
```
backend/scripts/satellite/flood_detection_gee_improved.js
```

Copy the **entire contents** (Ctrl+A, Ctrl+C or Cmd+A, Cmd+C)

### Step 3: Paste and Run
1. **Delete** any existing code in the Earth Engine editor
2. **Paste** the copied script
3. Click the **"Run"** button (top of editor)
4. **Wait** 30-60 seconds for processing

### Step 4: View Results

#### Check Console (Right Panel)
Look for:
```
📊 FLOOD DETECTION RESULTS:
Newly flooded area: X.XX km²
```

- **If X.XX > 0:** Flooding detected! ✅
- **If X.XX = 0:** No flooding detected (see troubleshooting below)

#### Check Map (Center Panel)
Look for:
- **Red areas** = Newly flooded zones from Nov 28 event
- **Yellow box** = Analysis area boundary

#### Check Layers (Top Right)
Make sure this layer is **checked** ✅:
- **"🚨 NEW FLOODED AREAS (Nov 28)"**

---

## 🔧 If You See No Red Areas

### Quick Fix 1: Toggle the Layer
1. Look at **Layers panel** (top right of map)
2. Find **"🚨 NEW FLOODED AREAS (Nov 28)"**
3. **Uncheck** it, then **check** it again
4. Red areas should appear

### Quick Fix 2: Turn Off Base Layers
1. In Layers panel, **uncheck**:
   - "📅 BEFORE (Oct-Nov 2024)"
   - "📅 AFTER (Nov 28-Dec 2024)"
2. Keep **checked**:
   - "🚨 NEW FLOODED AREAS (Nov 28)"
3. Red areas should be more visible

### Quick Fix 3: Increase Sensitivity
In the script, find this line (around line 20):
```javascript
var WATER_THRESHOLD = 0.3;
```

Change to:
```javascript
var WATER_THRESHOLD = 0.2;  // More sensitive
```

Click **"Run"** again.

---

## 🗺️ Try Different Regions

The default script analyzes **Colombo**. To check other districts:

### Gampaha
Find this line in the script:
```javascript
var aoi = colombo;
```

Change to:
```javascript
// Gampaha
var gampaha = ee.Geometry.Rectangle([79.9, 7.0, 80.3, 7.3]);
var aoi = gampaha;
```

### Kalutara
```javascript
var kalutara = ee.Geometry.Rectangle([79.9, 6.5, 80.2, 6.7]);
var aoi = kalutara;
```

### Ratnapura
```javascript
var ratnapura = ee.Geometry.Rectangle([80.3, 6.6, 80.5, 6.8]);
var aoi = ratnapura;
```

### Full Sri Lanka
```javascript
var sriLanka = ee.Geometry.Rectangle([79.5, 5.9, 81.9, 9.9]);
var aoi = sriLanka;
```

**Click "Run" after each change.**

---

## 💾 Export Flood Map

Once you see red flooded areas:

1. Click **"Tasks"** tab (top right, orange icon)
2. Find: **"sri_lanka_flood_nov28_2024"**
3. Click **"Run"**
4. Choose Google Drive folder
5. Click **"Run"** in the dialog
6. Wait 5-30 minutes for export to complete
7. Download GeoTIFF from **Google Drive → EarthEngine** folder

---

## 📊 What the Results Mean

### Console Output Interpretation

```
Newly flooded area: 2.45 km²
                    245 hectares
                    2450000 m²
```

This means **2.45 square kilometers** were newly flooded by the Nov 28 event.

### Map Interpretation

- **🚨 Red areas** = New flooding from Nov 28 (water that wasn't there before)
- **🌊 Cyan areas** = All water after the flood (rivers, lakes, new flooding)
- **🌊 Blue areas** = Permanent water before the flood (rivers, lakes)
- **📍 Yellow box** = Analysis area boundary

---

## 🆘 Troubleshooting

### "Found 0 scenes" in Console
**Problem:** No satellite imagery available for the date range.

**Solution:**
1. Open: `backend/scripts/satellite/check_sentinel2_availability.js`
2. Run it to see when imagery is available
3. Adjust date ranges in flood detection script

**OR**

Increase cloud tolerance in the script:
```javascript
var CLOUD_THRESHOLD = 70; // Was 50
```

### "Shows old 2024 layers"
**Problem:** You're looking at the base satellite imagery, not the flood overlay.

**Solution:**
1. **Uncheck** RGB layers: "BEFORE" and "AFTER"
2. **Keep checked:** "NEW FLOODED AREAS"
3. Zoom in/out to see red areas better

### Error Messages in Console
**Red text = error**

Common errors:
- `"No band named 'B3'"` → No imagery found, increase cloud threshold
- `"Computation timed out"` → Area too large, use smaller region
- `"User memory limit exceeded"` → Reduce date range or area size

**Full troubleshooting guide:** See `TROUBLESHOOTING.md`

---

## 📖 Understanding NDWI

**NDWI = Normalized Difference Water Index**

Formula: `(Green - NIR) / (Green + NIR)`

- **Green** = Sentinel-2 Band 3 (water reflects green light)
- **NIR** = Sentinel-2 Band 8 (water absorbs near-infrared)

**Result:**
- NDWI > 0.3 = Water detected
- NDWI < 0.3 = Land

**Change Detection:**
- Compare NDWI before flood vs after flood
- New water = Flooded areas 🚨

---

## 🎓 Next Steps

### Validate Results
Cross-reference detected flood areas with:
- **DMC Sri Lanka reports:** https://www.dmc.gov.lk/
- **News reports** from Nov 28-30, 2024
- **Social media** reports from affected areas
- **Your river monitoring data**

### Integrate into Web App
1. Export GeoTIFF from Earth Engine
2. Convert to web tiles using GDAL or MapTiler
3. Upload tiles to Vercel/CDN
4. Add to damage assessment map (already built!)

See: `FLOOD_DETECTION_GUIDE.md` for full integration workflow

---

## 📚 Additional Resources

- **Earth Engine Code Editor:** https://code.earthengine.google.com/
- **Sentinel-2 Dataset:** https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED
- **NDWI Methodology:** https://en.wikipedia.org/wiki/Normalized_difference_water_index
- **DMC Sri Lanka:** https://www.dmc.gov.lk/

---

**Questions?** See `TROUBLESHOOTING.md` for detailed solutions.

**Last Updated:** December 10, 2024
