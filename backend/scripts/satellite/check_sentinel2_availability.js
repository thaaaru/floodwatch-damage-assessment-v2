// SPDX-License-Identifier: Apache-2.0

/**
 * Check Sentinel-2 Imagery Availability
 *
 * Run this first to find dates with good imagery coverage
 * Then use those dates in the flood detection script
 */

// Define area of interest
var colombo = ee.Geometry.Rectangle([79.7, 6.8, 80.0, 7.0]);
var aoi = colombo;

Map.centerObject(aoi, 10);
Map.addLayer(aoi, {color: 'red'}, 'Area of Interest');

// Search for available Sentinel-2 imagery
function checkAvailability(startDate, endDate, maxCloudCover) {
  var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', maxCloudCover))
    .sort('CLOUDY_PIXEL_PERCENTAGE');

  var count = collection.size().getInfo();

  print('================================================');
  print('Period:', startDate, 'to', endDate);
  print('Max cloud cover:', maxCloudCover + '%');
  print('Found:', count, 'scenes');

  if (count > 0) {
    // Get details of best scenes
    var list = collection.limit(5).toList(5);

    for (var i = 0; i < Math.min(5, count); i++) {
      var image = ee.Image(list.get(i));
      var date = ee.Date(image.get('system:time_start')).format('YYYY-MM-dd').getInfo();
      var cloud = image.get('CLOUDY_PIXEL_PERCENTAGE').getInfo();
      print('  Scene', (i+1) + ':', date, '- Cloud:', cloud.toFixed(1) + '%');
    }

    // Show the best scene on map
    var bestImage = ee.Image(list.get(0));
    var rgbVis = {
      bands: ['B4', 'B3', 'B2'],
      min: 0,
      max: 3000,
      gamma: 1.4
    };

    var layerName = 'Best: ' + startDate + ' to ' + endDate;
    Map.addLayer(bestImage, rgbVis, layerName, false);
  } else {
    print('  ⚠️ NO SCENES FOUND - Try wider date range or higher cloud threshold');
  }

  print('');
  return count;
}

// ============================================
// CHECK DIFFERENT TIME PERIODS
// ============================================

print('\n🔍 CHECKING SENTINEL-2 AVAILABILITY FOR SRI LANKA');
print('================================================\n');

// Before the Nov 28 floods
print('BEFORE FLOODS:');
checkAvailability('2024-11-01', '2024-11-27', 30);
checkAvailability('2024-10-01', '2024-10-31', 30);
checkAvailability('2024-09-01', '2024-09-30', 30);

// After the Nov 28 floods
print('\nAFTER FLOODS:');
checkAvailability('2024-11-29', '2024-12-10', 30);
checkAvailability('2024-11-29', '2024-12-31', 30);

// Wider ranges with higher cloud tolerance
print('\nWIDER RANGES (40% cloud tolerance):');
checkAvailability('2024-10-01', '2024-11-27', 40);
checkAvailability('2024-11-29', '2024-12-31', 40);

print('\n================================================');
print('✓ AVAILABILITY CHECK COMPLETE');
print('================================================');
print('\nNext steps:');
print('1. Review the console output above');
print('2. Check the map layers to see available imagery');
print('3. Use the date ranges with most scenes in flood_detection_gee.js');
print('4. If no scenes found, try:');
print('   - Expand date ranges');
print('   - Increase cloud cover threshold');
print('   - Check different months');
