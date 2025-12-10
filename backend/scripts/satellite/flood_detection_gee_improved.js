// SPDX-License-Identifier: Apache-2.0

/**
 * IMPROVED Google Earth Engine Script for Flood Detection
 *
 * INSTRUCTIONS:
 * 1. Copy this entire script
 * 2. Go to https://code.earthengine.google.com/
 * 3. Paste and click "Run"
 * 4. Check Console (right side) for diagnostics
 * 5. Toggle layers on/off to see flood detection
 */

// ============================================
// CONFIGURATION
// ============================================

// Area of interest - Choose one region below
var colombo = ee.Geometry.Rectangle([79.7, 6.8, 80.0, 7.0]);
var gampaha = ee.Geometry.Rectangle([79.9, 7.0, 80.3, 7.3]);
var kalutara = ee.Geometry.Rectangle([79.9, 6.5, 80.2, 6.7]);
var kandy = ee.Geometry.Rectangle([80.5, 7.1, 80.8, 7.4]);
var ratnapura = ee.Geometry.Rectangle([80.3, 6.6, 80.5, 6.8]);
var sriLanka = ee.Geometry.Rectangle([79.5, 5.9, 81.9, 9.9]);

// SELECT REGION HERE (change this line to switch regions):
var aoi = gampaha;

// Date ranges - WIDENED for better coverage
var BEFORE_START = '2024-10-01';
var BEFORE_END = '2024-11-27';
var AFTER_START = '2024-11-28';  // Including Nov 28 flood event
var AFTER_END = '2024-12-10';

// Cloud tolerance
var CLOUD_THRESHOLD = 50; // Increased to 50% for better scene availability

// Water detection threshold (lower = more sensitive)
var WATER_THRESHOLD = 0.2; // NDWI > 0.2 = water (increased sensitivity)

print('🌊 FLOOD DETECTION - NOVEMBER 28, 2024 EVENT');
print('================================================\n');

// ============================================
// 1. CENTER MAP ON AOI
// ============================================

Map.centerObject(aoi, 11);
Map.addLayer(aoi, { color: 'yellow', fillColor: '00000000' }, 'Analysis Area', true, 0.8);

// ============================================
// 2. LOAD SENTINEL-2 IMAGERY
// ============================================

print('📡 Loading Sentinel-2 imagery...\n');

// BEFORE flood imagery
var beforeCollection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filterDate(BEFORE_START, BEFORE_END)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', CLOUD_THRESHOLD))
  .select(['B3', 'B4', 'B8']); // Green, Red, NIR

var beforeCount = beforeCollection.size();
print('BEFORE period (' + BEFORE_START + ' to ' + BEFORE_END + '):');
print('  Found', beforeCount.getInfo(), 'scenes');

// AFTER flood imagery
var afterCollection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filterDate(AFTER_START, AFTER_END)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', CLOUD_THRESHOLD))
  .select(['B3', 'B4', 'B8']);

var afterCount = afterCollection.size();
print('AFTER period (' + AFTER_START + ' to ' + AFTER_END + '):');
print('  Found', afterCount.getInfo(), 'scenes\n');

// Check if we have enough imagery
if (beforeCount.getInfo() === 0 || afterCount.getInfo() === 0) {
  print('❌ ERROR: Not enough imagery found!');
  print('Try:');
  print('  1. Increase CLOUD_THRESHOLD (currently ' + CLOUD_THRESHOLD + '%)');
  print('  2. Widen date ranges');
  print('  3. Use different area of interest');
} else {

  // Create composite images (median to reduce noise and clouds)
  var beforeImage = beforeCollection.median().clip(aoi);
  var afterImage = afterCollection.median().clip(aoi);

  print('✅ Imagery loaded successfully\n');

  // ============================================
  // 3. CALCULATE NDWI (WATER INDEX)
  // ============================================

  print('💧 Calculating water index (NDWI)...\n');

  // NDWI = (Green - NIR) / (Green + NIR)
  // High values (>0.3) = water
  var ndwiBefore = beforeImage.normalizedDifference(['B3', 'B8']).rename('NDWI');
  var ndwiAfter = afterImage.normalizedDifference(['B3', 'B8']).rename('NDWI');

  // ============================================
  // 4. DETECT WATER BODIES
  // ============================================

  var waterBefore = ndwiBefore.gt(WATER_THRESHOLD);
  var waterAfter = ndwiAfter.gt(WATER_THRESHOLD);

  // ============================================
  // 5. DETECT NEW FLOODED AREAS
  // ============================================

  print('🔍 Detecting new flooded areas...\n');

  // New flood = water in "after" that wasn't in "before"
  var newFlood = waterAfter.subtract(waterBefore).gt(0).selfMask();

  // ============================================
  // 6. CALCULATE STATISTICS
  // ============================================

  // Calculate area of new flooding
  var floodAreaImage = newFlood.multiply(ee.Image.pixelArea());

  var stats = floodAreaImage.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: aoi,
    scale: 10,
    maxPixels: 1e9
  });

  var areaSquareMeters = stats.getInfo().NDWI || 0;
  var areaSquareKm = areaSquareMeters / 1e6;
  var areaHectares = areaSquareMeters / 10000;

  print('📊 FLOOD DETECTION RESULTS:');
  print('================================================');
  print('Newly flooded area: ' + areaSquareKm.toFixed(2) + ' km²');
  print('                    ' + areaHectares.toFixed(1) + ' hectares');
  print('                    ' + areaSquareMeters.toFixed(0) + ' m²');
  print('================================================\n');

  // ============================================
  // 7. VISUALIZE ON MAP
  // ============================================

  print('🗺️  Adding layers to map...\n');

  // RGB visualization parameters
  var rgbVis = {
    bands: ['B4', 'B3', 'B8'],
    min: 0,
    max: 3000,
    gamma: 1.4
  };

  // NDWI visualization
  var ndwiVis = {
    min: -1,
    max: 1,
    palette: ['red', 'white', 'blue']
  };

  // Add layers (all turned OFF by default except flood detection)
  Map.addLayer(beforeImage, rgbVis, '📅 BEFORE (Oct-Nov 2024)', false);
  Map.addLayer(afterImage, rgbVis, '📅 AFTER (Nov 28-Dec 2024)', false);
  Map.addLayer(ndwiBefore, ndwiVis, '💧 NDWI Before', false);
  Map.addLayer(ndwiAfter, ndwiVis, '💧 NDWI After', false);
  Map.addLayer(waterBefore, { palette: ['blue'] }, '🌊 Water Before', false);
  Map.addLayer(waterAfter, { palette: ['cyan'] }, '🌊 Water After', false);

  // NEW FLOODED AREAS - THIS IS THE KEY LAYER
  Map.addLayer(newFlood, { palette: ['red'] }, '🚨 NEW FLOODED AREAS (Nov 28)', true);

  // ============================================
  // 8. CREATE LEGEND
  // ============================================

  var legend = ui.Panel({
    style: {
      position: 'bottom-left',
      padding: '8px 15px',
      backgroundColor: 'white'
    }
  });

  var legendTitle = ui.Label({
    value: '🌊 Flood Detection Legend',
    style: {
      fontWeight: 'bold',
      fontSize: '16px',
      margin: '0 0 8px 0'
    }
  });

  legend.add(legendTitle);

  // Add color entries
  var makeRow = function (color, name) {
    var colorBox = ui.Label({
      style: {
        backgroundColor: color,
        padding: '10px',
        margin: '0 8px 4px 0',
        border: '1px solid black'
      }
    });
    var description = ui.Label({
      value: name,
      style: {
        margin: '2px 0 4px 0',
        fontSize: '13px'
      }
    });
    return ui.Panel({
      widgets: [colorBox, description],
      layout: ui.Panel.Layout.Flow('horizontal')
    });
  };

  legend.add(makeRow('red', '🚨 New flooded areas (Nov 28+)'));
  legend.add(makeRow('cyan', '🌊 All water after flood'));
  legend.add(makeRow('blue', '🌊 Water before flood'));
  legend.add(makeRow('yellow', '📍 Analysis area'));

  Map.add(legend);

  // ============================================
  // 9. EXPORT INSTRUCTIONS
  // ============================================

  print('💾 EXPORT INSTRUCTIONS:');
  print('================================================');
  print('To export the flood map:');
  print('1. Click "Tasks" tab (orange icon, top right)');
  print('2. Click "Run" next to the export task');
  print('3. Choose folder in Google Drive');
  print('4. Download when complete\n');

  // Create export task (you need to manually run it)
  Export.image.toDrive({
    image: newFlood.unmask(0).toByte(),
    description: 'sri_lanka_flood_nov28_2024',
    folder: 'EarthEngine',
    scale: 10,
    region: aoi,
    fileFormat: 'GeoTIFF',
    maxPixels: 1e9
  });

  // ============================================
  // 10. INTERPRETATION GUIDE
  // ============================================

  print('📖 HOW TO INTERPRET RESULTS:');
  print('================================================');
  print('');
  print('🚨 RED areas = Newly flooded (Nov 28 event)');
  print('   Toggle layer on/off to see clearly');
  print('');
  print('If you see NO red areas:');
  print('  • The flood may have been localized');
  print('  • Cloud cover may be hiding flooding');
  print('  • Water receded before satellite pass');
  print('  • Try different area or dates');
  print('');
  print('If you see TOO MUCH red:');
  print('  • Increase WATER_THRESHOLD (currently ' + WATER_THRESHOLD + ')');
  print('  • Check for cloud shadows (toggle RGB layers)');
  print('');
  print('Next steps:');
  print('  1. Toggle layers to verify results');
  print('  2. Zoom in to check specific areas');
  print('  3. Export if results look good');
  print('  4. Try other districts if needed');
  print('');
  print('✅ ANALYSIS COMPLETE!');
  print('================================================');
}
