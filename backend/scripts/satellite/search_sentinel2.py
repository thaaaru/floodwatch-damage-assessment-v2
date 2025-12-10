# SPDX-License-Identifier: Apache-2.0

"""
Sentinel-2 Imagery Search and Download Script
Uses Microsoft Planetary Computer STAC API to find and download satellite imagery
"""

import sys
from datetime import datetime
from pathlib import Path
from pystac_client import Client
import planetary_computer
import rasterio
from rasterio.merge import merge
from rasterio.warp import calculate_default_transform, reproject, Resampling
import numpy as np
from PIL import Image

# Sri Lanka bounding box (approx)
SRI_LANKA_BBOX = [79.5, 5.9, 81.9, 9.9]  # [min_lon, min_lat, max_lon, max_lat]

# Colombo area (for focused testing)
COLOMBO_BBOX = [79.7, 6.8, 80.0, 7.0]


def search_sentinel2_imagery(
    bbox=COLOMBO_BBOX,
    date_range="2024-01-01/2024-12-31",
    max_cloud_cover=20,
    limit=10
):
    """
    Search for Sentinel-2 imagery using Microsoft Planetary Computer

    Args:
        bbox: Bounding box [min_lon, min_lat, max_lon, max_lat]
        date_range: Date range in format "YYYY-MM-DD/YYYY-MM-DD"
        max_cloud_cover: Maximum cloud cover percentage (0-100)
        limit: Maximum number of items to return

    Returns:
        List of STAC items
    """
    print(f"🔍 Searching for Sentinel-2 imagery...")
    print(f"   Area: {bbox}")
    print(f"   Date range: {date_range}")
    print(f"   Max cloud cover: {max_cloud_cover}%")

    # Connect to Planetary Computer STAC API
    catalog = Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=planetary_computer.sign_inplace,
    )

    # Search for Sentinel-2 L2A (atmospherically corrected) imagery
    search = catalog.search(
        collections=["sentinel-2-l2a"],
        bbox=bbox,
        datetime=date_range,
        query={"eo:cloud_cover": {"lt": max_cloud_cover}},
        limit=limit,
    )

    items = list(search.items())

    print(f"✅ Found {len(items)} Sentinel-2 scenes")

    for i, item in enumerate(items[:5], 1):  # Show first 5
        cloud_cover = item.properties.get("eo:cloud_cover", "N/A")
        date = item.properties.get("datetime", "N/A")
        print(f"   {i}. Date: {date} | Cloud cover: {cloud_cover}%")

    return items


def download_rgb_preview(item, output_path, bbox=None):
    """
    Download RGB preview from a Sentinel-2 item

    Args:
        item: STAC item
        output_path: Path to save the preview image
        bbox: Optional bounding box to crop [min_lon, min_lat, max_lon, max_lat]
    """
    print(f"📥 Downloading RGB preview...")

    try:
        # Get RGB bands (B04=Red, B03=Green, B02=Blue)
        red_href = item.assets["B04"].href
        green_href = item.assets["B03"].href
        blue_href = item.assets["B02"].href

        # Read the bands
        with rasterio.open(red_href) as red_src:
            if bbox:
                # Calculate window for bbox crop
                from rasterio.windows import from_bounds
                window = from_bounds(*bbox, transform=red_src.transform)
                red = red_src.read(1, window=window)
                profile = red_src.profile
                profile.update({
                    'height': window.height,
                    'width': window.width,
                    'transform': red_src.window_transform(window)
                })
            else:
                red = red_src.read(1)
                profile = red_src.profile

        with rasterio.open(green_href) as green_src:
            if bbox:
                window = from_bounds(*bbox, transform=green_src.transform)
                green = green_src.read(1, window=window)
            else:
                green = green_src.read(1)

        with rasterio.open(blue_href) as blue_src:
            if bbox:
                window = from_bounds(*bbox, transform=blue_src.transform)
                blue = blue_src.read(1, window=window)
            else:
                blue = blue_src.read(1)

        # Normalize to 0-255 range for visualization
        def normalize_band(band):
            # Apply percentile stretch for better visualization
            p2, p98 = np.percentile(band[band > 0], (2, 98))
            band_stretched = np.clip((band - p2) / (p98 - p2) * 255, 0, 255)
            return band_stretched.astype(np.uint8)

        red_norm = normalize_band(red)
        green_norm = normalize_band(green)
        blue_norm = normalize_band(blue)

        # Create RGB image
        rgb = np.dstack((red_norm, green_norm, blue_norm))

        # Save as PNG
        img = Image.fromarray(rgb)
        img.save(output_path)

        print(f"✅ Saved RGB preview to: {output_path}")
        print(f"   Size: {img.size}")

        return output_path

    except Exception as e:
        print(f"❌ Error downloading RGB preview: {e}")
        return None


def main():
    """Main function to search and download Sentinel-2 imagery"""

    print("\n" + "="*60)
    print("  Sentinel-2 Imagery Search (Microsoft Planetary Computer)")
    print("="*60 + "\n")

    # Create output directory
    output_dir = Path("../../data/satellite/raw")
    output_dir.mkdir(parents=True, exist_ok=True)

    # Search for recent imagery with low cloud cover
    items = search_sentinel2_imagery(
        bbox=COLOMBO_BBOX,
        date_range="2024-01-01/2024-12-31",
        max_cloud_cover=10,
        limit=5
    )

    if not items:
        print("\n❌ No imagery found. Try adjusting parameters.")
        return

    # Download the best (lowest cloud cover) item
    print(f"\n📥 Downloading best scene (lowest cloud cover)...")
    best_item = min(items, key=lambda x: x.properties.get("eo:cloud_cover", 100))

    date_str = best_item.properties.get("datetime", "unknown")[:10]
    cloud_cover = best_item.properties.get("eo:cloud_cover", "N/A")

    print(f"   Selected: {date_str} (Cloud cover: {cloud_cover}%)")

    output_file = output_dir / f"colombo_sentinel2_{date_str}.png"
    download_rgb_preview(best_item, output_file, bbox=COLOMBO_BBOX)

    print(f"\n✅ Download complete!")
    print(f"   Saved to: {output_file}")
    print("\n" + "="*60 + "\n")


if __name__ == "__main__":
    main()
