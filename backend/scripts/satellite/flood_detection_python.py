# SPDX-License-Identifier: Apache-2.0

"""
Python-based Flood Detection using Google Earth Engine
Alternative to the JavaScript Code Editor approach
"""

import ee
from datetime import datetime

# ============================================
# AUTHENTICATION
# ============================================

def authenticate_earth_engine():
    """
    Authenticate with Earth Engine
    First time: Run `earthengine authenticate` in terminal
    """
    try:
        ee.Initialize(project='sri-lanka-flood-detection')
        print("✓ Earth Engine authenticated successfully")
        return True
    except Exception as e:
        print(f"✗ Authentication failed: {e}")
        print("\nTo authenticate:")
        print("1. Run: earthengine authenticate")
        print("2. Follow the browser authentication flow")
        print("3. Run this script again")
        return False


# ============================================
# FLOOD DETECTION
# ============================================

def detect_floods(
    aoi_coords,
    before_start='2024-11-01',
    before_end='2024-11-27',
    after_start='2024-11-29',
    after_end='2024-12-10',
    cloud_threshold=20
):
    """
    Detect flooded areas using NDWI change detection

    Args:
        aoi_coords: [min_lon, min_lat, max_lon, max_lat]
        before_start/end: Date range before flood
        after_start/end: Date range after flood
        cloud_threshold: Max cloud cover percentage
    """

    print("\n" + "="*50)
    print("FLOOD DETECTION ANALYSIS")
    print("="*50 + "\n")

    # Define area of interest
    aoi = ee.Geometry.Rectangle(aoi_coords)

    # Load Sentinel-2 imagery
    def load_sentinel2(start, end):
        return (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                .filterBounds(aoi)
                .filterDate(start, end)
                .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloud_threshold))
                .median())

    print(f"Loading imagery...")
    print(f"  Before: {before_start} to {before_end}")
    print(f"  After: {after_start} to {after_end}")

    before_image = load_sentinel2(before_start, before_end)
    after_image = load_sentinel2(after_start, after_end)

    # Calculate NDWI
    def calculate_ndwi(image):
        return image.normalizedDifference(['B3', 'B8']).rename('NDWI')

    ndwi_before = calculate_ndwi(before_image)
    ndwi_after = calculate_ndwi(after_image)

    # Detect water (NDWI > 0.3)
    water_threshold = 0.3
    water_before = ndwi_before.gt(water_threshold)
    water_after = ndwi_after.gt(water_threshold)

    # Detect new flooded areas
    new_flood = water_after.subtract(water_before).gt(0)

    # Calculate flooded area
    flood_area = (new_flood
                  .multiply(ee.Image.pixelArea())
                  .reduceRegion(
                      reducer=ee.Reducer.sum(),
                      geometry=aoi,
                      scale=10,
                      maxPixels=1e9
                  ))

    area_sq_m = flood_area.getInfo().get('NDWI', 0)
    area_sq_km = area_sq_m / 1e6

    print(f"\n{'='*50}")
    print("RESULTS")
    print("="*50)
    print(f"Flooded area: {area_sq_km:.2f} sq km")
    print(f"Flooded area: {area_sq_m:.0f} sq meters")

    return {
        'new_flood': new_flood,
        'water_before': water_before,
        'water_after': water_after,
        'area_sq_km': area_sq_km,
        'area_sq_m': area_sq_m
    }


def export_flood_map(flood_image, aoi_coords, filename='flood_map_nov28'):
    """
    Export flood map to Google Drive

    Args:
        flood_image: Earth Engine Image
        aoi_coords: [min_lon, min_lat, max_lon, max_lat]
        filename: Output filename (without extension)
    """

    aoi = ee.Geometry.Rectangle(aoi_coords)

    task = ee.batch.Export.image.toDrive(
        image=flood_image,
        description=filename,
        folder='EarthEngine',
        fileNamePrefix=filename,
        region=aoi,
        scale=10,
        crs='EPSG:4326',
        maxPixels=1e9
    )

    task.start()

    print(f"\n✓ Export task started: {filename}")
    print(f"  Check progress: https://code.earthengine.google.com/tasks")
    print(f"  File will be saved to Google Drive: EarthEngine/{filename}.tif")

    return task


# ============================================
# MAIN
# ============================================

def main():
    """
    Main flood detection workflow
    """

    # Authenticate
    if not authenticate_earth_engine():
        return

    # Define areas of interest
    areas = {
        'Colombo': [79.7, 6.8, 80.0, 7.0],
        'Sri Lanka': [79.5, 5.9, 81.9, 9.9],
    }

    # Choose area
    area_name = 'Colombo'  # Change to 'Sri Lanka' for full country
    aoi_coords = areas[area_name]

    print(f"\nAnalyzing: {area_name}")
    print(f"Bounds: {aoi_coords}")

    # Run flood detection
    results = detect_floods(
        aoi_coords=aoi_coords,
        before_start='2024-11-01',
        before_end='2024-11-27',
        after_start='2024-11-29',
        after_end='2024-12-10'
    )

    # Export results
    print("\nExporting flood map...")
    export_flood_map(
        flood_image=results['new_flood'],
        aoi_coords=aoi_coords,
        filename=f'flood_nov28_{area_name.lower()}'
    )

    print("\n" + "="*50)
    print("COMPLETE!")
    print("="*50)
    print("\nNext steps:")
    print("1. Check Earth Engine Tasks: https://code.earthengine.google.com/tasks")
    print("2. Download GeoTIFF from Google Drive")
    print("3. Convert to web tiles for map integration")


if __name__ == '__main__':
    main()
