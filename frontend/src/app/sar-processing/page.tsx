'use client';

import { useState } from 'react';

interface ProcessingConfig {
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  beforeDateStart: string;
  beforeDateEnd: string;
  afterDateStart: string;
  afterDateEnd: string;
  resolution: number;
  workflow: 'snap' | 'gee';
}

const DEFAULT_CONFIG: ProcessingConfig = {
  bbox: { minLon: 79.8, minLat: 6.8, maxLon: 80.2, maxLat: 7.1 }, // Colombo region
  beforeDateStart: '2024-05-01',
  beforeDateEnd: '2024-05-15',
  afterDateStart: '2024-06-01',
  afterDateEnd: '2024-06-15',
  resolution: 10,
  workflow: 'gee',
};

// Sri Lanka preset regions
const PRESET_REGIONS = [
  { name: 'Colombo Metro', bbox: { minLon: 79.8, minLat: 6.85, maxLon: 80.0, maxLat: 7.0 } },
  { name: 'Kelani River Basin', bbox: { minLon: 79.85, minLat: 6.9, maxLon: 80.3, maxLat: 7.2 } },
  { name: 'Ratnapura District', bbox: { minLon: 80.2, minLat: 6.5, maxLon: 80.6, maxLat: 6.8 } },
  { name: 'Kegalle Region', bbox: { minLon: 80.2, minLat: 7.1, maxLon: 80.5, maxLat: 7.4 } },
  { name: 'Galle Coast', bbox: { minLon: 80.1, minLat: 5.95, maxLon: 80.4, maxLat: 6.15 } },
  { name: 'Batticaloa Lagoon', bbox: { minLon: 81.5, minLat: 7.6, maxLon: 81.8, maxLat: 7.9 } },
  { name: 'Full Sri Lanka', bbox: { minLon: 79.5, minLat: 5.8, maxLon: 82.0, maxLat: 10.1 } },
];

export default function SARProcessingPage() {
  const [config, setConfig] = useState<ProcessingConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<'overview' | 'snap' | 'gee' | 'kmz' | 'instructions'>('overview');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const updateBbox = (preset: typeof PRESET_REGIONS[0]) => {
    setConfig({ ...config, bbox: preset.bbox });
  };

  // Generate SNAP Python code based on config
  const generateSnapCode = () => `#!/usr/bin/env python3
"""
Sentinel-1 SAR Processing with ESA SNAP (snappy)
================================================
Generates BEFORE/AFTER RGB composites and change detection for flood analysis.

Requirements:
    - ESA SNAP Desktop installed (https://step.esa.int/main/download/snap-download/)
    - snappy Python module configured
    - GDAL for GeoTIFF/KMZ conversion

Installation:
    # Configure snappy (run once after SNAP installation)
    cd <snap-install-dir>/bin
    ./snappy-conf <python-executable>

    # Install additional dependencies
    pip install gdal numpy matplotlib simplekml zipfile

Author: FloodWatch.lk SAR Processing Module
"""

import os
import sys
import numpy as np
from datetime import datetime

# SNAP imports (requires snappy configuration)
try:
    from snappy import ProductIO, GPF, HashMap, jpy
    GPF.getDefaultInstance().getOperatorSpiRegistry().loadOperatorSpis()
except ImportError:
    print("ERROR: snappy not configured. Run SNAP's snappy-conf first.")
    sys.exit(1)

# =============================================================================
# CONFIGURATION - MODIFY THESE VALUES
# =============================================================================

CONFIG = {
    # Bounding Box (WGS84)
    'BBOX': {
        'min_lon': ${config.bbox.minLon},
        'min_lat': ${config.bbox.minLat},
        'max_lon': ${config.bbox.maxLon},
        'max_lat': ${config.bbox.maxLat},
    },

    # Date ranges
    'BEFORE_START': '${config.beforeDateStart}',
    'BEFORE_END': '${config.beforeDateEnd}',
    'AFTER_START': '${config.afterDateStart}',
    'AFTER_END': '${config.afterDateEnd}',

    # Processing parameters
    'RESOLUTION': ${config.resolution},  # meters
    'POLARIZATIONS': ['VV', 'VH'],
    'SPECKLE_FILTER': 'Lee',
    'SPECKLE_WINDOW': '3x3',

    # Output
    'OUTPUT_DIR': './sar_output',
    'OUTPUT_CRS': 'EPSG:4326',
}

# =============================================================================
# SNAP PROCESSING FUNCTIONS
# =============================================================================

def get_snap_parameters(operator_name: str) -> HashMap:
    """Create SNAP HashMap for operator parameters."""
    return HashMap()


def apply_orbit_file(product):
    """Apply precise orbit file to Sentinel-1 product."""
    print("  Applying Orbit File...")
    parameters = get_snap_parameters('Apply-Orbit-File')
    parameters.put('orbitType', 'Sentinel Precise (Auto Download)')
    parameters.put('polyDegree', 3)
    parameters.put('continueOnFail', True)
    return GPF.createProduct('Apply-Orbit-File', parameters, product)


def remove_border_noise(product):
    """Remove border noise from Sentinel-1 GRD product."""
    print("  Removing Border Noise...")
    parameters = get_snap_parameters('Remove-GRD-Border-Noise')
    parameters.put('borderLimit', 500)
    parameters.put('trimThreshold', 0.5)
    return GPF.createProduct('Remove-GRD-Border-Noise', parameters, product)


def remove_thermal_noise(product):
    """Remove thermal noise from Sentinel-1 product."""
    print("  Removing Thermal Noise...")
    parameters = get_snap_parameters('ThermalNoiseRemoval')
    parameters.put('removeThermalNoise', True)
    parameters.put('reIntroduceThermalNoise', False)
    return GPF.createProduct('ThermalNoiseRemoval', parameters, product)


def calibrate_to_sigma0(product):
    """Radiometric calibration to Sigma0."""
    print("  Calibrating to Sigma0...")
    parameters = get_snap_parameters('Calibration')
    parameters.put('outputSigmaBand', True)
    parameters.put('outputGammaBand', False)
    parameters.put('outputBetaBand', False)
    parameters.put('selectedPolarisations', ','.join(CONFIG['POLARIZATIONS']))
    return GPF.createProduct('Calibration', parameters, product)


def apply_speckle_filter(product):
    """Apply speckle filter to reduce SAR noise."""
    print(f"  Applying {CONFIG['SPECKLE_FILTER']} Speckle Filter ({CONFIG['SPECKLE_WINDOW']})...")
    parameters = get_snap_parameters('Speckle-Filter')
    parameters.put('filter', CONFIG['SPECKLE_FILTER'])
    parameters.put('filterSizeX', 3)
    parameters.put('filterSizeY', 3)
    parameters.put('dampingFactor', 2)
    parameters.put('estimateENL', True)
    parameters.put('enl', 1.0)
    return GPF.createProduct('Speckle-Filter', parameters, product)


def terrain_correction(product):
    """Apply Range-Doppler terrain correction."""
    print("  Applying Terrain Correction (Range-Doppler)...")
    parameters = get_snap_parameters('Terrain-Correction')
    parameters.put('demName', 'SRTM 1Sec HGT')
    parameters.put('demResamplingMethod', 'BILINEAR_INTERPOLATION')
    parameters.put('imgResamplingMethod', 'BILINEAR_INTERPOLATION')
    parameters.put('pixelSpacingInMeter', float(CONFIG['RESOLUTION']))
    parameters.put('mapProjection', CONFIG['OUTPUT_CRS'])
    parameters.put('nodataValueAtSea', True)
    parameters.put('saveDEM', False)
    parameters.put('saveLatLon', False)
    parameters.put('saveIncidenceAngleFromEllipsoid', False)
    parameters.put('saveProjectedLocalIncidenceAngle', False)
    return GPF.createProduct('Terrain-Correction', parameters, product)


def subset_to_bbox(product):
    """Subset product to bounding box."""
    print("  Subsetting to Region of Interest...")
    bbox = CONFIG['BBOX']
    wkt = f"POLYGON(({bbox['min_lon']} {bbox['min_lat']}, " \\
          f"{bbox['max_lon']} {bbox['min_lat']}, " \\
          f"{bbox['max_lon']} {bbox['max_lat']}, " \\
          f"{bbox['min_lon']} {bbox['max_lat']}, " \\
          f"{bbox['min_lon']} {bbox['min_lat']}))"

    parameters = get_snap_parameters('Subset')
    parameters.put('geoRegion', wkt)
    parameters.put('copyMetadata', True)
    return GPF.createProduct('Subset', parameters, product)


def convert_to_db(product):
    """Convert linear values to dB."""
    print("  Converting to dB...")
    parameters = get_snap_parameters('LinearToFromdB')
    return GPF.createProduct('LinearToFromdB', parameters, product)


def create_rgb_composite(product, output_path: str):
    """
    Create RGB composite:
    R = VV (dB)
    G = VH (dB)
    B = VV - VH (ratio in dB)
    """
    print("  Creating RGB Composite...")

    # Get bands
    vv_band = product.getBand('Sigma0_VV_db')
    vh_band = product.getBand('Sigma0_VH_db')

    if not vv_band or not vh_band:
        # Try alternate naming
        bands = list(product.getBandNames())
        print(f"  Available bands: {bands}")
        vv_band = product.getBand([b for b in bands if 'VV' in b and 'db' in b.lower()][0])
        vh_band = product.getBand([b for b in bands if 'VH' in b and 'db' in b.lower()][0])

    width = product.getSceneRasterWidth()
    height = product.getSceneRasterHeight()

    # Read data
    vv_data = np.zeros((height, width), dtype=np.float32)
    vh_data = np.zeros((height, width), dtype=np.float32)
    vv_band.readPixels(0, 0, width, height, vv_data)
    vh_band.readPixels(0, 0, width, height, vh_data)

    # Calculate ratio (VV - VH in dB space)
    ratio_data = vv_data - vh_data

    # Normalize for visualization
    def normalize(data, min_val, max_val):
        data = np.clip(data, min_val, max_val)
        return ((data - min_val) / (max_val - min_val) * 255).astype(np.uint8)

    r = normalize(vv_data, -20, 0)      # VV: -20 to 0 dB
    g = normalize(vh_data, -25, -5)     # VH: -25 to -5 dB
    b = normalize(ratio_data, -10, 5)   # Ratio: -10 to 5 dB

    # Stack RGB
    rgb = np.stack([r, g, b], axis=2)

    # Get geotransform from product
    geo_coding = product.getSceneGeoCoding()

    # Save using GDAL
    from osgeo import gdal, osr

    driver = gdal.GetDriverByName('GTiff')
    ds = driver.Create(output_path, width, height, 3, gdal.GDT_Byte)

    # Set projection
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(4326)
    ds.SetProjection(srs.ExportToWkt())

    # Set geotransform
    bbox = CONFIG['BBOX']
    pixel_width = (bbox['max_lon'] - bbox['min_lon']) / width
    pixel_height = (bbox['max_lat'] - bbox['min_lat']) / height
    ds.SetGeoTransform([
        bbox['min_lon'],
        pixel_width,
        0,
        bbox['max_lat'],
        0,
        -pixel_height
    ])

    # Write bands
    for i in range(3):
        ds.GetRasterBand(i + 1).WriteArray(rgb[:, :, i])

    ds.FlushCache()
    ds = None

    print(f"  Saved RGB composite: {output_path}")
    return rgb


def process_sentinel1(input_path: str, output_name: str):
    """
    Complete Sentinel-1 processing chain.

    Args:
        input_path: Path to Sentinel-1 .zip or .SAFE directory
        output_name: Base name for output files (e.g., 'before', 'after')

    Returns:
        Path to output GeoTIFF
    """
    print(f"\\n{'='*60}")
    print(f"Processing: {os.path.basename(input_path)}")
    print(f"{'='*60}")

    # Create output directory
    os.makedirs(CONFIG['OUTPUT_DIR'], exist_ok=True)

    # Read product
    print("\\n[1/9] Reading Sentinel-1 product...")
    product = ProductIO.readProduct(input_path)

    # Processing chain
    print("\\n[2/9] Applying Orbit File...")
    product = apply_orbit_file(product)

    print("\\n[3/9] Removing Border Noise...")
    product = remove_border_noise(product)

    print("\\n[4/9] Removing Thermal Noise...")
    product = remove_thermal_noise(product)

    print("\\n[5/9] Calibrating to Sigma0...")
    product = calibrate_to_sigma0(product)

    print("\\n[6/9] Applying Speckle Filter...")
    product = apply_speckle_filter(product)

    print("\\n[7/9] Terrain Correction...")
    product = terrain_correction(product)

    print("\\n[8/9] Subsetting to ROI...")
    product = subset_to_bbox(product)

    print("\\n[9/9] Converting to dB and Creating RGB...")
    product = convert_to_db(product)

    # Create RGB composite
    output_path = os.path.join(CONFIG['OUTPUT_DIR'], f'sri_lanka_{output_name}.tif')
    create_rgb_composite(product, output_path)

    # Dispose product
    product.dispose()

    return output_path


def create_change_detection(before_path: str, after_path: str):
    """
    Create change detection image (AFTER - BEFORE).

    Positive values (red) = increased backscatter (potential flooding)
    Negative values (blue) = decreased backscatter
    """
    from osgeo import gdal
    import numpy as np

    print("\\n" + "="*60)
    print("Creating Change Detection")
    print("="*60)

    # Read before/after images
    before_ds = gdal.Open(before_path)
    after_ds = gdal.Open(after_path)

    before_data = before_ds.ReadAsArray().astype(np.float32)
    after_data = after_ds.ReadAsArray().astype(np.float32)

    # Calculate difference for each band
    diff = after_data - before_data

    # Normalize difference (-128 to 127 -> 0 to 255)
    diff_normalized = np.clip(diff + 128, 0, 255).astype(np.uint8)

    # Create output
    output_path = os.path.join(CONFIG['OUTPUT_DIR'], 'sri_lanka_change.tif')
    driver = gdal.GetDriverByName('GTiff')
    ds = driver.Create(output_path, before_ds.RasterXSize, before_ds.RasterYSize, 3, gdal.GDT_Byte)

    ds.SetProjection(before_ds.GetProjection())
    ds.SetGeoTransform(before_ds.GetGeoTransform())

    for i in range(3):
        ds.GetRasterBand(i + 1).WriteArray(diff_normalized[i])

    ds.FlushCache()
    ds = None
    before_ds = None
    after_ds = None

    print(f"Saved change detection: {output_path}")
    return output_path


# =============================================================================
# KML/KMZ GENERATION
# =============================================================================

def geotiff_to_kmz(tiff_path: str, kmz_path: str, name: str, opacity: float = 0.7):
    """
    Convert GeoTIFF to KMZ for Google Earth overlay.

    Args:
        tiff_path: Input GeoTIFF path
        kmz_path: Output KMZ path
        name: Name for the overlay
        opacity: Overlay opacity (0-1)
    """
    from osgeo import gdal
    import simplekml
    import zipfile
    import shutil

    print(f"\\nConverting {tiff_path} to KMZ...")

    # Read geotransform
    ds = gdal.Open(tiff_path)
    gt = ds.GetGeoTransform()
    width = ds.RasterXSize
    height = ds.RasterYSize

    # Calculate bounds
    min_lon = gt[0]
    max_lon = gt[0] + width * gt[1]
    max_lat = gt[3]
    min_lat = gt[3] + height * gt[5]

    ds = None

    # Convert TIFF to PNG for KMZ
    png_path = tiff_path.replace('.tif', '.png')
    gdal.Translate(png_path, tiff_path, format='PNG')

    # Create KML
    kml = simplekml.Kml(name=name)

    ground = kml.newgroundoverlay(name=name)
    ground.icon.href = os.path.basename(png_path)
    ground.latlonbox.north = max_lat
    ground.latlonbox.south = min_lat
    ground.latlonbox.east = max_lon
    ground.latlonbox.west = min_lon
    ground.color = simplekml.Color.changealphaint(int(opacity * 255), simplekml.Color.white)

    # Save KML
    kml_path = kmz_path.replace('.kmz', '.kml')
    kml.save(kml_path)

    # Create KMZ (ZIP with KML + PNG)
    with zipfile.ZipFile(kmz_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.write(kml_path, os.path.basename(kml_path))
        zf.write(png_path, os.path.basename(png_path))

    # Cleanup temp files
    os.remove(kml_path)
    os.remove(png_path)

    print(f"Saved KMZ: {kmz_path}")
    return kmz_path


# =============================================================================
# MAIN EXECUTION
# =============================================================================

def main():
    """
    Main processing workflow.

    USAGE:
        1. Download Sentinel-1 GRD products from Copernicus Open Access Hub
           https://scihub.copernicus.eu/
        2. Place .zip files in ./input directory
        3. Update CONFIG section above with your parameters
        4. Run: python sar_snap_processing.py
    """

    print("="*60)
    print("SENTINEL-1 SAR PROCESSING FOR FLOOD DETECTION")
    print("FloodWatch.lk - SNAP Workflow")
    print("="*60)

    print(f"\\nConfiguration:")
    print(f"  Region: {CONFIG['BBOX']}")
    print(f"  Before: {CONFIG['BEFORE_START']} to {CONFIG['BEFORE_END']}")
    print(f"  After:  {CONFIG['AFTER_START']} to {CONFIG['AFTER_END']}")
    print(f"  Resolution: {CONFIG['RESOLUTION']}m")

    # Define input files (update these paths)
    before_input = './input/S1A_IW_GRDH_BEFORE.zip'  # Replace with actual file
    after_input = './input/S1A_IW_GRDH_AFTER.zip'    # Replace with actual file

    # Process BEFORE
    before_tiff = process_sentinel1(before_input, 'before')

    # Process AFTER
    after_tiff = process_sentinel1(after_input, 'after')

    # Create change detection
    change_tiff = create_change_detection(before_tiff, after_tiff)

    # Generate KMZ overlays
    print("\\n" + "="*60)
    print("Generating Google Earth Overlays")
    print("="*60)

    geotiff_to_kmz(before_tiff,
                   os.path.join(CONFIG['OUTPUT_DIR'], 'sri_lanka_before.kmz'),
                   'SAR Before - Sri Lanka', opacity=0.7)

    geotiff_to_kmz(after_tiff,
                   os.path.join(CONFIG['OUTPUT_DIR'], 'sri_lanka_after.kmz'),
                   'SAR After - Sri Lanka', opacity=0.7)

    geotiff_to_kmz(change_tiff,
                   os.path.join(CONFIG['OUTPUT_DIR'], 'sri_lanka_change.kmz'),
                   'SAR Change Detection - Sri Lanka', opacity=0.7)

    print("\\n" + "="*60)
    print("PROCESSING COMPLETE!")
    print("="*60)
    print(f"\\nOutput files in: {CONFIG['OUTPUT_DIR']}/")
    print("  - sri_lanka_before.tif")
    print("  - sri_lanka_after.tif")
    print("  - sri_lanka_change.tif")
    print("  - sri_lanka_before.kmz")
    print("  - sri_lanka_after.kmz")
    print("  - sri_lanka_change.kmz")
    print("\\nOpen .kmz files in Google Earth to visualize!")


if __name__ == '__main__':
    main()
`;

  // Generate GEE JavaScript code based on config
  const generateGEECode = () => `/*
 * Sentinel-1 SAR Processing for Flood Detection
 * Google Earth Engine Script
 * =============================================
 *
 * Generates BEFORE/AFTER RGB composites and change detection
 * for flood analysis in Sri Lanka.
 *
 * Author: FloodWatch.lk
 *
 * INSTRUCTIONS:
 * 1. Open Google Earth Engine Code Editor: https://code.earthengine.google.com/
 * 2. Copy this entire script
 * 3. Click "Run" to execute
 * 4. Use the Export tasks to download GeoTIFFs to Google Drive
 */

// =============================================================================
// CONFIGURATION - MODIFY THESE VALUES
// =============================================================================

var CONFIG = {
  // Bounding Box (WGS84)
  bbox: ee.Geometry.Rectangle([${config.bbox.minLon}, ${config.bbox.minLat}, ${config.bbox.maxLon}, ${config.bbox.maxLat}]),

  // Date ranges
  beforeStart: '${config.beforeDateStart}',
  beforeEnd: '${config.beforeDateEnd}',
  afterStart: '${config.afterDateStart}',
  afterEnd: '${config.afterDateEnd}',

  // Processing parameters
  resolution: ${config.resolution},  // meters

  // Visualization parameters
  visParams: {
    vv: { min: -20, max: 0 },
    vh: { min: -25, max: -5 },
    ratio: { min: -10, max: 5 }
  },

  // Export folder in Google Drive
  driveFolder: 'FloodWatch_SAR_Export'
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert linear values to dB
 */
function toDb(image) {
  return ee.Image(10).multiply(image.log10());
}

/**
 * Apply simple speckle filter using focal mean
 * (More robust than refined Lee for GEE)
 */
function speckleFilter(image) {
  // Simple 3x3 focal mean filter for speckle reduction
  var smoothed = image.focal_mean(30, 'circle', 'meters');
  return smoothed;
}

/**
 * Process Sentinel-1 collection for a date range
 */
function processSentinel1(startDate, endDate, region) {
  // Filter Sentinel-1 collection
  var collection = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(region)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.and(
      ee.Filter.eq('instrumentMode', 'IW'),
      ee.Filter.eq('orbitProperties_pass', 'DESCENDING')
    ))
    .select(['VV', 'VH']);

  print('Images found for ' + startDate + ' to ' + endDate + ':', collection.size());

  // Create median composite
  var composite = collection.median().clip(region);

  // Select VV and VH bands
  var vv = composite.select('VV');
  var vh = composite.select('VH');

  // Apply speckle filter
  var filtered = speckleFilter(composite);
  vv = filtered.select('VV');
  vh = filtered.select('VH');

  // Convert to dB
  var vv_db = toDb(vv).rename('VV_db');
  var vh_db = toDb(vh).rename('VH_db');

  // Calculate ratio (VV/VH in linear, or VV-VH in dB)
  var ratio_db = vv_db.subtract(vh_db).rename('ratio_db');

  return ee.Image.cat([vv_db, vh_db, ratio_db]);
}

/**
 * Create RGB composite visualization
 * R = VV (dB)
 * G = VH (dB)
 * B = VV - VH (ratio in dB)
 */
function createRgbComposite(image) {
  var vv = image.select('VV_db');
  var vh = image.select('VH_db');
  var ratio = image.select('ratio_db');

  // Normalize to 0-255 for visualization
  var r = vv.unitScale(CONFIG.visParams.vv.min, CONFIG.visParams.vv.max);
  var g = vh.unitScale(CONFIG.visParams.vh.min, CONFIG.visParams.vh.max);
  var b = ratio.unitScale(CONFIG.visParams.ratio.min, CONFIG.visParams.ratio.max);

  return ee.Image.cat([r, g, b]).rename(['R', 'G', 'B']);
}

// =============================================================================
// MAIN PROCESSING
// =============================================================================

print('========================================');
print('Sentinel-1 SAR Processing - FloodWatch.lk');
print('========================================');
print('Region:', CONFIG.bbox);
print('Before: ' + CONFIG.beforeStart + ' to ' + CONFIG.beforeEnd);
print('After: ' + CONFIG.afterStart + ' to ' + CONFIG.afterEnd);

// Process BEFORE period
print('\\n--- Processing BEFORE period ---');
var before = processSentinel1(CONFIG.beforeStart, CONFIG.beforeEnd, CONFIG.bbox);
var beforeRgb = createRgbComposite(before);

// Process AFTER period
print('\\n--- Processing AFTER period ---');
var after = processSentinel1(CONFIG.afterStart, CONFIG.afterEnd, CONFIG.bbox);
var afterRgb = createRgbComposite(after);

// Calculate change detection
print('\\n--- Creating Change Detection ---');
var change = after.subtract(before);
var changeRgb = createRgbComposite(change.rename(['VV_db', 'VH_db', 'ratio_db']));

// =============================================================================
// VISUALIZATION
// =============================================================================

// Center map on region
Map.centerObject(CONFIG.bbox, 10);

// RGB visualization parameters
var rgbVis = { min: 0, max: 1 };

// Add layers to map
Map.addLayer(beforeRgb, rgbVis, 'BEFORE - RGB Composite');
Map.addLayer(afterRgb, rgbVis, 'AFTER - RGB Composite');

// Change detection visualization (red = increase, blue = decrease)
var changeVis = {
  min: [-0.3, -0.3, -0.3],
  max: [0.3, 0.3, 0.3]
};
Map.addLayer(changeRgb, changeVis, 'CHANGE Detection');

// Add boundary
Map.addLayer(CONFIG.bbox, {color: 'yellow'}, 'Region Boundary');

// =============================================================================
// EXPORT TO GOOGLE DRIVE
// =============================================================================

print('\\n========================================');
print('EXPORT TASKS');
print('========================================');
print('Click "Tasks" tab (top right) and run each export:');

// Export BEFORE
Export.image.toDrive({
  image: beforeRgb.multiply(255).uint8(),
  description: 'sri_lanka_before',
  folder: CONFIG.driveFolder,
  fileNamePrefix: 'sri_lanka_before',
  region: CONFIG.bbox,
  scale: CONFIG.resolution,
  crs: 'EPSG:4326',
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});

// Export AFTER
Export.image.toDrive({
  image: afterRgb.multiply(255).uint8(),
  description: 'sri_lanka_after',
  folder: CONFIG.driveFolder,
  fileNamePrefix: 'sri_lanka_after',
  region: CONFIG.bbox,
  scale: CONFIG.resolution,
  crs: 'EPSG:4326',
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});

// Export CHANGE
Export.image.toDrive({
  image: changeRgb.add(0.5).multiply(255).uint8(),  // Shift to 0-1 range, then 0-255
  description: 'sri_lanka_change',
  folder: CONFIG.driveFolder,
  fileNamePrefix: 'sri_lanka_change',
  region: CONFIG.bbox,
  scale: CONFIG.resolution,
  crs: 'EPSG:4326',
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});

print('\\nExports configured! Go to Tasks tab and click RUN for each.');
print('Files will be saved to Google Drive folder: ' + CONFIG.driveFolder);

// =============================================================================
// FLOOD DETECTION (OPTIONAL)
// =============================================================================

/**
 * Simple flood detection using VV threshold
 * Water appears dark in VV polarization (< -15 dB typically)
 */
function detectFlood(beforeImg, afterImg) {
  var vv_before = beforeImg.select('VV_db');
  var vv_after = afterImg.select('VV_db');

  // Threshold for water detection
  var threshold = -15;  // dB

  // Permanent water (dark in both)
  var permanentWater = vv_before.lt(threshold).and(vv_after.lt(threshold));

  // Flood (dark only in after)
  var flood = vv_before.gte(threshold).and(vv_after.lt(threshold));

  // Combine
  var classified = ee.Image(0)
    .where(permanentWater, 1)
    .where(flood, 2)
    .clip(CONFIG.bbox);

  return classified.rename('flood_class');
}

// Run flood detection
var floodMap = detectFlood(before, after);

// Visualize flood
var floodVis = {
  min: 0,
  max: 2,
  palette: ['#333333', '#0066cc', '#ff3333']  // Background, Permanent Water, Flood
};
Map.addLayer(floodMap, floodVis, 'Flood Detection');

// Export flood map
Export.image.toDrive({
  image: floodMap.uint8(),
  description: 'sri_lanka_flood_detection',
  folder: CONFIG.driveFolder,
  fileNamePrefix: 'sri_lanka_flood_detection',
  region: CONFIG.bbox,
  scale: CONFIG.resolution,
  crs: 'EPSG:4326',
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});

print('\\n--- Flood Detection ---');
print('Classes: 0=Land, 1=Permanent Water, 2=Flood');
`;

  // Generate KMZ conversion CLI code
  const generateKMZCode = () => `#!/bin/bash
#
# GeoTIFF to KMZ Conversion Script
# ================================
# Converts processed SAR GeoTIFFs to Google Earth KMZ overlays.
#
# Requirements:
#   - GDAL (gdal_translate, gdal2tiles.py)
#   - Python with simplekml
#   - zip utility
#
# Installation:
#   # Ubuntu/Debian
#   sudo apt install gdal-bin python3-gdal
#   pip install simplekml
#
#   # macOS
#   brew install gdal
#   pip install simplekml
#
#   # Windows (OSGeo4W)
#   # Download from https://trac.osgeo.org/osgeo4w/

# =============================================================================
# CONFIGURATION
# =============================================================================

INPUT_DIR="./sar_output"
OUTPUT_DIR="./kmz_output"
OPACITY=0.7  # 70% opacity for road visibility

# Create output directory
mkdir -p "$OUTPUT_DIR"

# =============================================================================
# FUNCTION: Convert single GeoTIFF to KMZ
# =============================================================================

convert_to_kmz() {
    local INPUT_TIFF="$1"
    local OUTPUT_NAME="$2"
    local OVERLAY_NAME="$3"

    echo "Converting: $INPUT_TIFF -> $OUTPUT_NAME.kmz"

    # Get bounds from GeoTIFF
    BOUNDS=$(gdalinfo "$INPUT_TIFF" | grep -E "Upper Left|Lower Right" | \\
             awk '{print $4, $5}' | tr -d '(),' | tr '\\n' ' ')

    # Parse bounds
    WEST=$(echo $BOUNDS | awk '{print $1}')
    NORTH=$(echo $BOUNDS | awk '{print $2}')
    EAST=$(echo $BOUNDS | awk '{print $3}')
    SOUTH=$(echo $BOUNDS | awk '{print $4}')

    echo "  Bounds: W=$WEST, S=$SOUTH, E=$EAST, N=$NORTH"

    # Convert to PNG (for KMZ embedding)
    gdal_translate -of PNG -scale \\
        "$INPUT_TIFF" "$OUTPUT_DIR/$OUTPUT_NAME.png"

    # Create KML file
    cat > "$OUTPUT_DIR/$OUTPUT_NAME.kml" << KMLEOF
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>$OVERLAY_NAME</name>
    <description>SAR Composite - FloodWatch.lk</description>
    <GroundOverlay>
      <name>$OVERLAY_NAME</name>
      <color>b3ffffff</color>
      <Icon>
        <href>$OUTPUT_NAME.png</href>
      </Icon>
      <LatLonBox>
        <north>$NORTH</north>
        <south>$SOUTH</south>
        <east>$EAST</east>
        <west>$WEST</west>
      </LatLonBox>
    </GroundOverlay>
  </Document>
</kml>
KMLEOF

    # Create KMZ (ZIP containing KML + PNG)
    cd "$OUTPUT_DIR"
    zip -q "$OUTPUT_NAME.kmz" "$OUTPUT_NAME.kml" "$OUTPUT_NAME.png"

    # Cleanup
    rm "$OUTPUT_NAME.kml" "$OUTPUT_NAME.png"
    cd - > /dev/null

    echo "  Created: $OUTPUT_DIR/$OUTPUT_NAME.kmz"
}

# =============================================================================
# MAIN CONVERSION
# =============================================================================

echo "========================================"
echo "GeoTIFF to KMZ Conversion"
echo "========================================"

# Convert each file
convert_to_kmz "$INPUT_DIR/sri_lanka_before.tif" "sri_lanka_before" "SAR Before - Sri Lanka"
convert_to_kmz "$INPUT_DIR/sri_lanka_after.tif" "sri_lanka_after" "SAR After - Sri Lanka"
convert_to_kmz "$INPUT_DIR/sri_lanka_change.tif" "sri_lanka_change" "SAR Change Detection"

echo ""
echo "========================================"
echo "CONVERSION COMPLETE!"
echo "========================================"
echo ""
echo "Output files:"
ls -la "$OUTPUT_DIR"/*.kmz
echo ""
echo "Open .kmz files in Google Earth to visualize!"
echo ""

# =============================================================================
# ALTERNATIVE: Python KMZ Generator
# =============================================================================

cat > "$OUTPUT_DIR/generate_kmz.py" << 'PYEOF'
#!/usr/bin/env python3
"""
Python alternative for GeoTIFF to KMZ conversion.
More flexible than shell script with better error handling.

Usage:
    python generate_kmz.py input.tif output.kmz "Overlay Name" 0.7
"""

import sys
import os
from osgeo import gdal
import simplekml
import zipfile
import shutil

def geotiff_to_kmz(tiff_path, kmz_path, name, opacity=0.7):
    """Convert GeoTIFF to KMZ with specified opacity."""

    # Read GeoTIFF bounds
    ds = gdal.Open(tiff_path)
    gt = ds.GetGeoTransform()
    width = ds.RasterXSize
    height = ds.RasterYSize

    west = gt[0]
    east = gt[0] + width * gt[1]
    north = gt[3]
    south = gt[3] + height * gt[5]

    print(f"Bounds: W={west:.4f}, S={south:.4f}, E={east:.4f}, N={north:.4f}")

    # Convert to PNG
    png_path = tiff_path.replace('.tif', '_temp.png')
    gdal.Translate(png_path, ds, format='PNG')
    ds = None

    # Create KML
    kml = simplekml.Kml(name=name)
    ground = kml.newgroundoverlay(name=name)
    ground.icon.href = os.path.basename(png_path).replace('_temp', '')
    ground.latlonbox.north = north
    ground.latlonbox.south = south
    ground.latlonbox.east = east
    ground.latlonbox.west = west

    # Set opacity (alpha in AABBGGRR format)
    alpha_hex = format(int(opacity * 255), '02x')
    ground.color = f'{alpha_hex}ffffff'

    # Save KML
    kml_path = tiff_path.replace('.tif', '_temp.kml')
    kml.save(kml_path)

    # Create KMZ
    with zipfile.ZipFile(kmz_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.write(kml_path, os.path.basename(kml_path).replace('_temp', ''))
        zf.write(png_path, os.path.basename(png_path).replace('_temp', ''))

    # Cleanup
    os.remove(kml_path)
    os.remove(png_path)

    print(f"Created: {kmz_path}")

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print("Usage: python generate_kmz.py input.tif output.kmz 'Name' [opacity]")
        sys.exit(1)

    tiff = sys.argv[1]
    kmz = sys.argv[2]
    name = sys.argv[3]
    opacity = float(sys.argv[4]) if len(sys.argv) > 4 else 0.7

    geotiff_to_kmz(tiff, kmz, name, opacity)
PYEOF

chmod +x "$OUTPUT_DIR/generate_kmz.py"
echo "Python script saved: $OUTPUT_DIR/generate_kmz.py"
`;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-sm">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">SAR Processing Toolkit</h1>
                <p className="text-xs text-slate-500">Sentinel-1 Before/After Composites & Google Earth Integration</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a href="/damage-gallery" className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors">
                Damage Gallery
              </a>
              <a href="/" className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
                Dashboard
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview', icon: '📋' },
              { id: 'snap', label: 'SNAP Python', icon: '🐍' },
              { id: 'gee', label: 'Earth Engine', icon: '🌍' },
              { id: 'kmz', label: 'KMZ Export', icon: '🗺️' },
              { id: 'instructions', label: 'Instructions', icon: '📖' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Configuration Panel */}
        <div className="mb-6 bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-orange-100 flex items-center justify-center text-xs">⚙️</span>
            Processing Configuration
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Region Selection */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Preset Region</label>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
                onChange={(e) => {
                  const preset = PRESET_REGIONS.find(p => p.name === e.target.value);
                  if (preset) updateBbox(preset);
                }}
              >
                {PRESET_REGIONS.map((region) => (
                  <option key={region.name} value={region.name}>{region.name}</option>
                ))}
              </select>
            </div>

            {/* Bounding Box Display */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Bounding Box</label>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700">
                [{config.bbox.minLon}, {config.bbox.minLat}, {config.bbox.maxLon}, {config.bbox.maxLat}]
              </div>
            </div>

            {/* Resolution */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Resolution (m)</label>
              <select
                value={config.resolution}
                onChange={(e) => setConfig({ ...config, resolution: parseInt(e.target.value) })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
              >
                <option value={10}>10m (Standard)</option>
                <option value={20}>20m (Faster)</option>
                <option value={30}>30m (Quick preview)</option>
              </select>
            </div>

            {/* Workflow */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Workflow</label>
              <select
                value={config.workflow}
                onChange={(e) => setConfig({ ...config, workflow: e.target.value as 'snap' | 'gee' })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
              >
                <option value="gee">Google Earth Engine (Cloud)</option>
                <option value="snap">SNAP Desktop (Local)</option>
              </select>
            </div>
          </div>

          {/* Date Ranges */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
              <div className="text-xs font-semibold text-emerald-800 mb-2">BEFORE Period</div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={config.beforeDateStart}
                  onChange={(e) => setConfig({ ...config, beforeDateStart: e.target.value })}
                  className="bg-white border border-emerald-200 rounded px-2 py-1.5 text-sm"
                />
                <input
                  type="date"
                  value={config.beforeDateEnd}
                  onChange={(e) => setConfig({ ...config, beforeDateEnd: e.target.value })}
                  className="bg-white border border-emerald-200 rounded px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="bg-red-50 rounded-lg p-3 border border-red-200">
              <div className="text-xs font-semibold text-red-800 mb-2">AFTER Period</div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={config.afterDateStart}
                  onChange={(e) => setConfig({ ...config, afterDateStart: e.target.value })}
                  className="bg-white border border-red-200 rounded px-2 py-1.5 text-sm"
                />
                <input
                  type="date"
                  value={config.afterDateEnd}
                  onChange={(e) => setConfig({ ...config, afterDateEnd: e.target.value })}
                  className="bg-white border border-red-200 rounded px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Workflow Diagram */}
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">SAR Processing Workflow</h3>
              <div className="space-y-3">
                {[
                  { step: 1, name: 'Data Acquisition', desc: 'Download Sentinel-1 IW GRD products', icon: '📡' },
                  { step: 2, name: 'Apply Orbit File', desc: 'Precise orbit ephemeris correction', icon: '🛰️' },
                  { step: 3, name: 'Noise Removal', desc: 'Border noise + thermal noise removal', icon: '🔇' },
                  { step: 4, name: 'Calibration', desc: 'Convert to Sigma0 (VV + VH)', icon: '📊' },
                  { step: 5, name: 'Speckle Filter', desc: 'Lee filter 3x3 for noise reduction', icon: '✨' },
                  { step: 6, name: 'Terrain Correction', desc: 'Range-Doppler with SRTM DEM', icon: '⛰️' },
                  { step: 7, name: 'RGB Composite', desc: 'R=VV, G=VH, B=VV-VH ratio', icon: '🎨' },
                  { step: 8, name: 'Export', desc: 'GeoTIFF + KMZ for Google Earth', icon: '💾' },
                ].map((item) => (
                  <div key={item.step} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
                    <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-700">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-500">{item.desc}</div>
                    </div>
                    <span className="text-xl">{item.icon}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Output Files */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Output Files</h3>
                <div className="space-y-3">
                  {[
                    { name: 'sri_lanka_before.tif', desc: 'RGB GeoTIFF composite (before event)', color: 'emerald' },
                    { name: 'sri_lanka_after.tif', desc: 'RGB GeoTIFF composite (after event)', color: 'red' },
                    { name: 'sri_lanka_change.tif', desc: 'Change detection (AFTER - BEFORE)', color: 'purple' },
                    { name: 'sri_lanka_before.kmz', desc: 'Google Earth overlay (70% opacity)', color: 'blue' },
                    { name: 'sri_lanka_after.kmz', desc: 'Google Earth overlay (70% opacity)', color: 'blue' },
                    { name: 'sri_lanka_change.kmz', desc: 'Change detection overlay', color: 'blue' },
                  ].map((file) => (
                    <div key={file.name} className={`flex items-center gap-3 p-3 rounded-lg bg-${file.color}-50 border border-${file.color}-200`}>
                      <span className="text-xl">📄</span>
                      <div>
                        <div className="text-sm font-mono font-medium text-slate-900">{file.name}</div>
                        <div className="text-xs text-slate-500">{file.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* RGB Composite Explanation */}
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">RGB Composite Bands</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-red-500"></div>
                    <div>
                      <div className="text-sm font-medium">Red = VV (dB)</div>
                      <div className="text-xs text-slate-500">Vertical-Vertical polarization (-20 to 0 dB)</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-green-500"></div>
                    <div>
                      <div className="text-sm font-medium">Green = VH (dB)</div>
                      <div className="text-xs text-slate-500">Vertical-Horizontal polarization (-25 to -5 dB)</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-blue-500"></div>
                    <div>
                      <div className="text-sm font-medium">Blue = VV/VH Ratio (dB)</div>
                      <div className="text-xs text-slate-500">Polarization ratio (-10 to 5 dB)</div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800">
                  <strong>Interpretation:</strong> Water appears dark blue (low backscatter).
                  Urban areas appear bright. Vegetation shows green tones.
                  Flooded areas show distinct color change from before to after.
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'snap' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                <div>
                  <h3 className="font-semibold text-slate-900">SNAP Python Script (snappy)</h3>
                  <p className="text-sm text-slate-500">Complete local processing workflow</p>
                </div>
                <button
                  onClick={() => copyToClipboard(generateSnapCode(), 'snap')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    copiedCode === 'snap'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-orange-100 hover:bg-orange-200 text-orange-700'
                  }`}
                >
                  {copiedCode === 'snap' ? '✓ Copied!' : 'Copy Code'}
                </button>
              </div>
              <div className="p-4 bg-slate-900 overflow-x-auto max-h-[600px] overflow-y-auto">
                <pre className="text-xs text-slate-300 font-mono whitespace-pre">{generateSnapCode()}</pre>
              </div>
            </div>

            {/* SNAP Requirements */}
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
              <h4 className="font-semibold text-amber-800 mb-2">Requirements for SNAP Workflow</h4>
              <div className="text-sm text-amber-700 space-y-1">
                <p>1. Install ESA SNAP Desktop: <a href="https://step.esa.int/main/download/snap-download/" target="_blank" className="underline">step.esa.int</a></p>
                <p>2. Configure snappy: <code className="bg-amber-100 px-1 rounded">cd &lt;snap&gt;/bin && ./snappy-conf python3</code></p>
                <p>3. Install dependencies: <code className="bg-amber-100 px-1 rounded">pip install gdal numpy matplotlib simplekml</code></p>
                <p>4. Download Sentinel-1 data from Copernicus Open Access Hub</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'gee' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                <div>
                  <h3 className="font-semibold text-slate-900">Google Earth Engine Script</h3>
                  <p className="text-sm text-slate-500">Cloud-based processing (no downloads needed)</p>
                </div>
                <div className="flex gap-2">
                  <a
                    href="https://code.earthengine.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm font-medium transition-colors"
                  >
                    Open GEE Editor
                  </a>
                  <button
                    onClick={() => copyToClipboard(generateGEECode(), 'gee')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      copiedCode === 'gee'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-orange-100 hover:bg-orange-200 text-orange-700'
                    }`}
                  >
                    {copiedCode === 'gee' ? '✓ Copied!' : 'Copy Code'}
                  </button>
                </div>
              </div>
              <div className="p-4 bg-slate-900 overflow-x-auto max-h-[600px] overflow-y-auto">
                <pre className="text-xs text-slate-300 font-mono whitespace-pre">{generateGEECode()}</pre>
              </div>
            </div>

            {/* GEE Instructions */}
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
              <h4 className="font-semibold text-emerald-800 mb-2">How to Use Google Earth Engine</h4>
              <ol className="text-sm text-emerald-700 space-y-1 list-decimal list-inside">
                <li>Sign up for GEE at <a href="https://earthengine.google.com/" target="_blank" className="underline">earthengine.google.com</a></li>
                <li>Open Code Editor: <a href="https://code.earthengine.google.com/" target="_blank" className="underline">code.earthengine.google.com</a></li>
                <li>Click "Copy Code" button above</li>
                <li>Paste into GEE Code Editor</li>
                <li>Click "Run" to process</li>
                <li>Go to "Tasks" tab → Click "Run" for each export</li>
                <li>Files will be saved to your Google Drive</li>
              </ol>
            </div>
          </div>
        )}

        {activeTab === 'kmz' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                <div>
                  <h3 className="font-semibold text-slate-900">GeoTIFF to KMZ Conversion</h3>
                  <p className="text-sm text-slate-500">Shell script + Python utility for Google Earth overlays</p>
                </div>
                <button
                  onClick={() => copyToClipboard(generateKMZCode(), 'kmz')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    copiedCode === 'kmz'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-orange-100 hover:bg-orange-200 text-orange-700'
                  }`}
                >
                  {copiedCode === 'kmz' ? '✓ Copied!' : 'Copy Code'}
                </button>
              </div>
              <div className="p-4 bg-slate-900 overflow-x-auto max-h-[600px] overflow-y-auto">
                <pre className="text-xs text-slate-300 font-mono whitespace-pre">{generateKMZCode()}</pre>
              </div>
            </div>

            {/* CLI Quick Reference */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <h4 className="font-semibold text-slate-900 mb-3">Quick CLI Commands</h4>
              <div className="space-y-3 font-mono text-sm">
                <div className="bg-slate-100 p-3 rounded-lg">
                  <div className="text-slate-500 text-xs mb-1"># Convert GeoTIFF to PNG</div>
                  <code className="text-slate-800">gdal_translate -of PNG input.tif output.png</code>
                </div>
                <div className="bg-slate-100 p-3 rounded-lg">
                  <div className="text-slate-500 text-xs mb-1"># Get GeoTIFF bounds</div>
                  <code className="text-slate-800">gdalinfo input.tif | grep -E "Upper Left|Lower Right"</code>
                </div>
                <div className="bg-slate-100 p-3 rounded-lg">
                  <div className="text-slate-500 text-xs mb-1"># Create KMZ from KML + PNG</div>
                  <code className="text-slate-800">zip output.kmz doc.kml overlay.png</code>
                </div>
                <div className="bg-slate-100 p-3 rounded-lg">
                  <div className="text-slate-500 text-xs mb-1"># Python alternative</div>
                  <code className="text-slate-800">python generate_kmz.py input.tif output.kmz "Name" 0.7</code>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'instructions' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Step by Step Guide */}
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Step-by-Step Guide</h3>

              <div className="space-y-4">
                <div className="border-l-4 border-blue-500 pl-4">
                  <h4 className="font-semibold text-slate-900">Option A: Google Earth Engine (Recommended)</h4>
                  <ol className="mt-2 text-sm text-slate-600 space-y-2 list-decimal list-inside">
                    <li>Go to "Earth Engine" tab above</li>
                    <li>Adjust configuration (region, dates)</li>
                    <li>Click "Copy Code"</li>
                    <li>Open <a href="https://code.earthengine.google.com/" target="_blank" className="text-blue-600 underline">GEE Code Editor</a></li>
                    <li>Paste and click "Run"</li>
                    <li>Check map visualization</li>
                    <li>Go to Tasks → Run exports</li>
                    <li>Download from Google Drive</li>
                    <li>Use KMZ script to create overlays</li>
                  </ol>
                </div>

                <div className="border-l-4 border-orange-500 pl-4">
                  <h4 className="font-semibold text-slate-900">Option B: SNAP Desktop (Local)</h4>
                  <ol className="mt-2 text-sm text-slate-600 space-y-2 list-decimal list-inside">
                    <li>Install <a href="https://step.esa.int/main/download/snap-download/" target="_blank" className="text-blue-600 underline">ESA SNAP</a></li>
                    <li>Configure snappy Python module</li>
                    <li>Download Sentinel-1 data from <a href="https://scihub.copernicus.eu/" target="_blank" className="text-blue-600 underline">Copernicus Hub</a></li>
                    <li>Go to "SNAP Python" tab above</li>
                    <li>Copy and save as <code>.py</code> file</li>
                    <li>Update input file paths in script</li>
                    <li>Run: <code>python sar_snap_processing.py</code></li>
                    <li>Open KMZ files in Google Earth</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Validation */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Validation Checklist</h3>
                <div className="space-y-2">
                  {[
                    'GeoTIFF opens correctly in QGIS/ArcGIS',
                    'Bounds match expected region (check with gdalinfo)',
                    'RGB colors show expected patterns (water=dark blue)',
                    'KMZ opens in Google Earth without errors',
                    'Overlay aligns with roads/coastline',
                    'Change detection shows flood-affected areas in distinct color',
                    'Resolution matches configuration (10m pixels)',
                    'No clipping at edges or DEM artifacts',
                  ].map((item, idx) => (
                    <label key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                      <input type="checkbox" className="w-4 h-4 rounded border-slate-300" />
                      <span className="text-sm text-slate-700">{item}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Troubleshooting</h3>
                <div className="space-y-3 text-sm">
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <div className="font-medium text-red-800">No images found in GEE</div>
                    <div className="text-red-600">Try expanding date range or check orbit pass filter</div>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="font-medium text-amber-800">KMZ misaligned in Google Earth</div>
                    <div className="text-amber-600">Check CRS is EPSG:4326 and bounds are correct</div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="font-medium text-blue-800">SNAP snappy import error</div>
                    <div className="text-blue-600">Run snappy-conf again with correct Python path</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-8">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-slate-500">
              Data: <span className="font-medium">Copernicus Sentinel-1 GRD</span> •
              Processing: <span className="font-medium">ESA SNAP / Google Earth Engine</span>
            </div>
            <div className="text-xs text-slate-400">
              Generated code is copy-paste ready • Modify CONFIG section for your region
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
