# Earth Engine Flood Detection Troubleshooting

## Issue: "Shows old 2024 data" or "Old layers"

This means the base imagery layers (RGB satellite photos) are displaying, but the **flood detection overlay** (red areas) is not visible or is showing wrong data.

---

## Quick Fix Checklist

### 1. ✅ Check Layer Visibility

**In Earth Engine Code Editor:**

1. Look at the **Layers panel** (top right of map)
2. Find the layer called **"🚨 NEW FLOODED AREAS (Nov 28)"**
3. Make sure the **checkbox is CHECKED** ✅
4. If it's unchecked, click it to turn on the flood overlay

**Expected result:** Red areas should appear on the map showing flooded regions.

---

### 2. 🔍 Check Console Output

**In Earth Engine Code Editor:**

1. Look at the **Console panel** (right side)
2. Scroll to find these sections:

```
BEFORE period (2024-10-01 to 2024-11-27):
  Found X scenes

AFTER period (2024-11-28 to 2024-12-31):
  Found X scenes
```

**Diagnosis:**

- **If X = 0 for either period:** Not enough imagery available
  - **Fix:** Increase `CLOUD_THRESHOLD` to 70 or 80
  - **Fix:** Widen date ranges (e.g., Sept 1 - Nov 27 for before)

- **If X > 0 for both:** Imagery loaded successfully
  - Continue to next check

---

### 3. 📊 Check Flood Statistics

**In Console, find:**

```
📊 FLOOD DETECTION RESULTS:
Newly flooded area: X.XX km²
```

**Diagnosis:**

- **If X.XX = 0.00:** No flooding detected
  - **Reason 1:** Cloud cover hiding flooded areas
  - **Reason 2:** Flood waters receded before satellite captured image
  - **Reason 3:** Flooding was very localized (small area)
  - **Reason 4:** Water threshold too high

  **Fixes to try:**
  ```javascript
  // In the script, change this line:
  var WATER_THRESHOLD = 0.3;
  // To:
  var WATER_THRESHOLD = 0.2;  // Lower = more sensitive
  ```

- **If X.XX > 0:** Flooding detected successfully!
  - The red overlay should be visible on map
  - If not visible, toggle layers off/on

---

### 4. 🗺️ Toggle Base Layers OFF

**Problem:** RGB imagery layers may be covering the flood overlay

**Solution:**

1. In Layers panel, **uncheck** these layers:
   - "📅 BEFORE (Oct-Nov 2024)"
   - "📅 AFTER (Nov 28-Dec 2024)"

2. **Keep checked:**
   - "🚨 NEW FLOODED AREAS (Nov 28)"
   - "📍 Analysis area"

**Expected result:** You should see red flood areas on a gray basemap.

---

### 5. 🎯 Zoom to Affected Area

The flood may be in a specific district that's not centered in your view.

**Districts most affected by Nov 28 floods:**

- Colombo
- Gampaha
- Kalutara
- Galle
- Ratnapura

**Try this:**

1. Manually pan/zoom to these districts
2. Look for red areas (flooded zones)
3. The current script focuses on Colombo - you may need to change AOI:

```javascript
// Change this line in the script:
var colombo = ee.Geometry.Rectangle([79.7, 6.8, 80.0, 7.0]);

// To other districts:

// Gampaha
var gampaha = ee.Geometry.Rectangle([79.9, 7.0, 80.3, 7.3]);

// Kalutara
var kalutara = ee.Geometry.Rectangle([79.9, 6.5, 80.2, 6.7]);

// Ratnapura
var ratnapura = ee.Geometry.Rectangle([80.3, 6.6, 80.5, 6.8]);

// Then change:
var aoi = colombo;
// To:
var aoi = gampaha; // or kalutara, ratnapura, etc.
```

---

## Common Misunderstandings

### "I see satellite imagery but no red areas"

**This is expected!** The satellite imagery layers (BEFORE/AFTER) show the actual photos from space. The **red overlay** is a separate layer that shows the flood detection results.

**Solution:** Make sure "🚨 NEW FLOODED AREAS" layer is toggled ON.

---

### "The dates say 2024 - is this old data?"

**No!** The Nov 28, 2024 flood event **is in 2024**. That's correct.

The "old data" issue means you're seeing the wrong type of layer. You should be seeing:

- ❌ NOT: RGB satellite photos (these are just for reference)
- ✅ YES: Red flood overlay showing detected flooding

---

### "Nothing appears after running the script"

**Possible causes:**

1. Script still processing (wait 30-60 seconds)
2. No imagery available for the dates (check Console)
3. Flood area very small (zoom in closer)
4. Layer not toggled on (check Layers panel)

---

## Step-by-Step Re-run Instructions

### Option A: Use Improved Script (Recommended)

1. **Copy the new script:**
   - Open: `backend/scripts/satellite/flood_detection_gee_improved.js`
   - Copy entire contents

2. **Paste in Earth Engine:**
   - Go to: https://code.earthengine.google.com/
   - Clear existing code
   - Paste new script
   - Click **"Run"**

3. **Wait for results:**
   - Watch Console panel (right side)
   - Should see progress messages
   - Wait for "✅ ANALYSIS COMPLETE!"

4. **Check the map:**
   - Look for red areas (flooding)
   - Toggle "🚨 NEW FLOODED AREAS" layer on/off
   - Zoom in/out to explore

### Option B: Modify Existing Script

If you want to keep using the current script, make these changes:

```javascript
// 1. Increase cloud tolerance
var CLOUD_THRESHOLD = 50; // Was 30

// 2. Include Nov 28 in the AFTER period
var AFTER_START = '2024-11-28'; // Was '2024-11-29'

// 3. Add diagnostic logging
var beforeCount = beforeCollection.size();
print('Found BEFORE scenes:', beforeCount.getInfo());

var afterCount = afterCollection.size();
print('Found AFTER scenes:', afterCount.getInfo());

// 4. Make flood layer visible by default
Map.addLayer(newFlood, {palette: ['red']}, 'NEW FLOODED AREAS', true); // true = visible
```

---

## Still Not Working?

### Try the availability checker first:

1. Open: `backend/scripts/satellite/check_sentinel2_availability.js`
2. Copy and paste into Earth Engine
3. Run it
4. Check Console to see which date ranges have imagery
5. Use those dates in the flood detection script

### Alternative: Try a different location

The Nov 28 event may have affected different areas more severely:

```javascript
// Full Sri Lanka (larger area)
var sriLanka = ee.Geometry.Rectangle([79.5, 5.9, 81.9, 9.9]);
var aoi = sriLanka;
```

---

## Understanding What You Should See

### Correct Output:

1. **Console:** "Newly flooded area: 2.45 km²" (or similar non-zero number)
2. **Map:** Red areas overlaid on map showing flooding
3. **Layers panel:** Multiple layers, with "NEW FLOODED AREAS" checked
4. **Legend:** Bottom-left showing color meanings

### Incorrect Output:

1. **Console:** "Newly flooded area: 0.00 km²" → No flooding detected
2. **Map:** Only gray basemap or satellite photos, no red overlay
3. **Layers panel:** Flood layer unchecked or not present
4. **No legend** → Script didn't complete

---

## Export Results (If Successful)

Once you see red flooded areas on the map:

1. Click **"Tasks"** tab (top right, orange icon)
2. Find task: **"sri_lanka_flood_nov28_2024"**
3. Click **"Run"**
4. Confirm export settings
5. Wait for completion (5-30 minutes)
6. Download GeoTIFF from Google Drive → EarthEngine folder

---

## Contact Points

If still having issues after trying these steps:

1. **Check Earth Engine status:** https://status.earthengine.google.com/
2. **Review Console errors:** Copy any red error messages
3. **Verify dates:** Confirm Nov 28, 2024 event details from DMC Sri Lanka

---

**Updated:** December 10, 2024
**Script Version:** flood_detection_gee_improved.js
