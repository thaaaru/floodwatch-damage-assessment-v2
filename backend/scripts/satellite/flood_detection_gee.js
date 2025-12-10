// SPDX-License-Identifier: Apache-2.0

/**
 * Google Earth Engine Script for Flood Detection
 *
 * This script detects flood-affected areas from Nov 28, 2024 rainfall in Sri Lanka
 *
 * To use:
 * 1. Go to https://code.earthengine.google.com/
 * 2. Sign up for free (research/education use)
 * 3. Copy-paste this code
 * 4. Click "Run"
 */

// ============================================
// 1. DEFINE AREA OF INTEREST
// ============================================

// Sri Lanka bounding box
var sriLanka = ee.Geometry.Rectangle([79.5, 5.9, 81.9, 9.9]);

// Or focus on specific district (e.g., Colombo)
var colombo = ee.Geometry.Rectangle([79.7, 6.8, 80.0, 7.0]);

// Choose your area
var aoi = colombo; // Change to sriLanka for full country

Map.centerObject(aoi, 10);

// ============================================
// 2. LOAD SENTINEL-2 IMAGERY
// ============================================

/**
 * Load cloud-free Sentinel-2 imagery for a date range
 */
function loadSentinel2(startDate, endDate, aoi) {
  var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30)); // Increased to 30% for more coverage

  // Check if collection is empty
  var count = collection.size();
  print('Found', count, 'scenes for', startDate, 'to', endDate);

  return collection.median(); // Take median to reduce noise
}

// BEFORE: Use wider date range to ensure coverage
// October-November (before the floods)
var beforeImage = loadSentinel2('2024-10-01', '2024-11-27', aoi);

// AFTER: November 29 - December 31, 2024 (after the floods)
var afterImage = loadSentinel2('2024-11-29', '2024-12-31', aoi);

// ============================================
// 3. CALCULATE NDWI (Water Index)
// ============================================

/**
 * Calculate Normalized Difference Water Index
 * NDWI = (Green - NIR) / (Green + NIR)
 * Values > 0.3 typically indicate water
 */
function calculateNDWI(image) {
  var ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI');
  return ndwi;
}

var ndwiBefore = calculateNDWI(beforeImage);
var ndwiAfter = calculateNDWI(afterImage);

// ============================================
// 4. DETECT WATER BODIES
// ============================================

// Define water threshold (NDWI > 0.3 = water)
var waterThreshold = 0.3;

var waterBefore = ndwiBefore.gt(waterThreshold).selfMask();
var waterAfter = ndwiAfter.gt(waterThreshold).selfMask();

// ============================================
// 5. DETECT NEW FLOODED AREAS
// ============================================

// New flooded areas = water in "after" that wasn't in "before"
var newFlood = waterAfter.subtract(waterBefore).gt(0).selfMask();

// ============================================
// 6. VISUALIZE RESULTS
// ============================================

// RGB visualization
var rgbVis = {
  bands: ['B4', 'B3', 'B2'],
  min: 0,
  max: 3000,
  gamma: 1.4
};

// Add layers to map
Map.addLayer(beforeImage, rgbVis, 'Before (Nov 1-27, 2024)');
Map.addLayer(afterImage, rgbVis, 'After (Nov 29-Dec 10, 2024)');
Map.addLayer(waterBefore, {palette: ['blue']}, 'Water Before', false);
Map.addLayer(waterAfter, {palette: ['cyan']}, 'Water After', false);
Map.addLayer(newFlood, {palette: ['red']}, 'New Flooded Areas');

// ============================================
// 7. CALCULATE FLOOD STATISTICS
// ============================================

// Calculate flooded area in square kilometers
var floodArea = newFlood.multiply(ee.Image.pixelArea()).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: aoi,
  scale: 10,
  maxPixels: 1e9
});

print('Flood Statistics:');
print('New flooded area (sq meters):', floodArea.get('NDWI'));
print('New flooded area (sq km):', ee.Number(floodArea.get('NDWI')).divide(1e6));

// ============================================
// 8. EXPORT RESULTS
// ============================================

/**
 * Export flood map as GeoTIFF
 * Downloads to your Google Drive
 */
Export.image.toDrive({
  image: newFlood,
  description: 'sri_lanka_flood_nov28_2024',
  scale: 10,
  region: aoi,
  fileFormat: 'GeoTIFF',
  maxPixels: 1e9
});

/**
 * Export as map tiles for web visualization
 * (Run this separately after the GeoTIFF export completes)
 */
// Export.image.toAsset({
//   image: newFlood,
//   description: 'flood_tiles',
//   scale: 10,
//   region: aoi,
//   maxPixels: 1e9
// });

// ============================================
// 9. LEGEND
// ============================================

// Create legend
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 15px'
  }
});

var legendTitle = ui.Label({
  value: 'Flood Detection Legend',
  style: {
    fontWeight: 'bold',
    fontSize: '14px',
    margin: '0 0 4px 0',
    padding: '0'
  }
});

legend.add(legendTitle);

var makeRow = function(color, name) {
  var colorBox = ui.Label({
    style: {
      backgroundColor: color,
      padding: '8px',
      margin: '0 0 4px 0'
    }
  });
  var description = ui.Label({
    value: name,
    style: {margin: '0 0 4px 6px'}
  });
  return ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
};

legend.add(makeRow('red', 'New Flooded Areas (Nov 28+)'));
legend.add(makeRow('cyan', 'Water After'));
legend.add(makeRow('blue', 'Water Before'));

Map.add(legend);

// ============================================
// USAGE NOTES
// ============================================

print('===========================================');
print('FLOOD DETECTION COMPLETE');
print('===========================================');
print('');
print('How to use these results:');
print('1. View "New Flooded Areas" layer (red)');
print('2. Check flood statistics in Console');
print('3. Click "Tasks" tab → Run export to download');
print('4. Use exported GeoTIFF in QGIS or upload as tiles');
print('');
print('Next steps:');
print('- Adjust waterThreshold if needed (default: 0.3)');
print('- Change date ranges for different events');
print('- Export tiles for web map integration');
