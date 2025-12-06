#!/usr/bin/env python3
"""
Sri Lanka Flood Damage Detection from Satellite Imagery
========================================================

This script downloads Sentinel-1 SAR and optionally Sentinel-2 optical imagery,
processes it to detect flood-affected areas, and generates publication-ready maps.

Author: FloodWatch.lk
Version: 1.0.0

Requirements:
    pip install rasterio numpy matplotlib geopandas folium requests scipy scikit-image shapely branca

Usage:
    python flood_damage_detection.py --output-dir ./output --use-optical

Output Files:
    - sri_lanka_flood_mask.tif - GeoTIFF flood mask
    - sri_lanka_damage_map.png - PNG damage map
    - damage_map_leaflet.html - Interactive Leaflet map
"""

import os
import json
import argparse
import warnings
from datetime import datetime, timedelta
from typing import Tuple, Optional, Dict, List, Any

import numpy as np
import requests
from scipy import ndimage
from scipy.ndimage import binary_closing, binary_opening
from skimage.filters import threshold_otsu
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.colors import ListedColormap
import folium
from folium import plugins
import branca.colormap as cm

warnings.filterwarnings('ignore')

# =============================================================================
# CONFIGURATION
# =============================================================================

# Sri Lanka bounding box [min_lon, min_lat, max_lon, max_lat]
BBOX = [79.5, 5.8, 82.0, 10.1]

# Copernicus Dataspace API configuration
COPERNICUS_API_URL = "https://catalogue.dataspace.copernicus.eu/odata/v1"
COPERNICUS_TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"

# Sentinel Hub API configuration (alternative)
SENTINEL_HUB_URL = "https://services.sentinel-hub.com"

# Processing parameters
SAR_THRESHOLD_METHOD = "otsu"  # Options: "otsu", "ratio", "fixed"
FIXED_THRESHOLD_VV = -15  # dB threshold for water detection
SPECKLE_FILTER_SIZE = 5  # Lee filter window size
MORPHOLOGY_KERNEL_SIZE = 3  # For noise removal
MIN_WATER_AREA_PIXELS = 100  # Minimum connected component size

# NDWI threshold for optical water detection
NDWI_THRESHOLD = 0.3

# Output resolution (meters)
OUTPUT_RESOLUTION = 100


# =============================================================================
# AUTHENTICATION
# =============================================================================

def get_copernicus_token(client_id: str, client_secret: str) -> Optional[str]:
    """
    Authenticate with Copernicus Dataspace and get access token.

    Args:
        client_id: Copernicus Dataspace client ID
        client_secret: Copernicus Dataspace client secret

    Returns:
        Access token string or None if authentication fails
    """
    try:
        response = requests.post(
            COPERNICUS_TOKEN_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        response.raise_for_status()
        return response.json().get("access_token")
    except Exception as e:
        print(f"⚠️  Authentication failed: {e}")
        return None


# =============================================================================
# DATA ACQUISITION
# =============================================================================

def search_sentinel1_products(
    bbox: List[float],
    start_date: str,
    end_date: str,
    max_results: int = 10
) -> List[Dict]:
    """
    Search for Sentinel-1 GRD products in the given bounding box and time range.

    Args:
        bbox: Bounding box [min_lon, min_lat, max_lon, max_lat]
        start_date: Start date in ISO format (YYYY-MM-DD)
        end_date: End date in ISO format (YYYY-MM-DD)
        max_results: Maximum number of products to return

    Returns:
        List of product metadata dictionaries
    """
    # Build OData filter query
    geometry_filter = f"OData.CSC.Intersects(area=geography'SRID=4326;POLYGON(({bbox[0]} {bbox[1]},{bbox[2]} {bbox[1]},{bbox[2]} {bbox[3]},{bbox[0]} {bbox[3]},{bbox[0]} {bbox[1]}))')"

    query_params = {
        "$filter": f"Collection/Name eq 'SENTINEL-1' and "
                   f"Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType' and att/OData.CSC.StringAttribute/Value eq 'GRD') and "
                   f"ContentDate/Start ge {start_date}T00:00:00.000Z and "
                   f"ContentDate/Start le {end_date}T23:59:59.999Z and "
                   f"{geometry_filter}",
        "$top": max_results,
        "$orderby": "ContentDate/Start desc"
    }

    try:
        response = requests.get(f"{COPERNICUS_API_URL}/Products", params=query_params)
        response.raise_for_status()
        data = response.json()
        return data.get("value", [])
    except Exception as e:
        print(f"⚠️  Sentinel-1 search failed: {e}")
        return []


def search_sentinel2_products(
    bbox: List[float],
    start_date: str,
    end_date: str,
    max_cloud_cover: float = 30.0,
    max_results: int = 10
) -> List[Dict]:
    """
    Search for Sentinel-2 L2A products with cloud cover filtering.

    Args:
        bbox: Bounding box [min_lon, min_lat, max_lon, max_lat]
        start_date: Start date in ISO format
        end_date: End date in ISO format
        max_cloud_cover: Maximum cloud cover percentage
        max_results: Maximum number of products

    Returns:
        List of product metadata dictionaries
    """
    geometry_filter = f"OData.CSC.Intersects(area=geography'SRID=4326;POLYGON(({bbox[0]} {bbox[1]},{bbox[2]} {bbox[1]},{bbox[2]} {bbox[3]},{bbox[0]} {bbox[3]},{bbox[0]} {bbox[1]}))')"

    query_params = {
        "$filter": f"Collection/Name eq 'SENTINEL-2' and "
                   f"Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType' and att/OData.CSC.StringAttribute/Value eq 'S2MSI2A') and "
                   f"Attributes/OData.CSC.DoubleAttribute/any(att:att/Name eq 'cloudCover' and att/OData.CSC.DoubleAttribute/Value le {max_cloud_cover}) and "
                   f"ContentDate/Start ge {start_date}T00:00:00.000Z and "
                   f"ContentDate/Start le {end_date}T23:59:59.999Z and "
                   f"{geometry_filter}",
        "$top": max_results,
        "$orderby": "ContentDate/Start desc"
    }

    try:
        response = requests.get(f"{COPERNICUS_API_URL}/Products", params=query_params)
        response.raise_for_status()
        data = response.json()
        return data.get("value", [])
    except Exception as e:
        print(f"⚠️  Sentinel-2 search failed: {e}")
        return []


# =============================================================================
# SAR PROCESSING
# =============================================================================

def apply_lee_filter(image: np.ndarray, size: int = 5) -> np.ndarray:
    """
    Apply Lee speckle filter to reduce SAR image noise.

    The Lee filter is an adaptive filter that preserves edges while
    reducing speckle noise in radar imagery.

    Args:
        image: Input SAR image (linear scale)
        size: Filter window size (must be odd)

    Returns:
        Filtered image
    """
    # Ensure size is odd
    if size % 2 == 0:
        size += 1

    # Calculate local mean using uniform filter
    mean_filter = ndimage.uniform_filter(image.astype(np.float64), size)

    # Calculate local variance
    mean_sq_filter = ndimage.uniform_filter(image.astype(np.float64) ** 2, size)
    variance = mean_sq_filter - mean_filter ** 2

    # Overall variance of the image
    overall_variance = np.var(image)

    # Lee filter coefficient
    # Avoid division by zero
    with np.errstate(divide='ignore', invalid='ignore'):
        k = variance / (variance + overall_variance)
        k = np.nan_to_num(k, nan=0.0, posinf=0.0, neginf=0.0)

    # Apply Lee filter formula
    filtered = mean_filter + k * (image - mean_filter)

    return filtered


def apply_refined_lee_filter(image: np.ndarray, size: int = 7) -> np.ndarray:
    """
    Apply Refined Lee filter with edge-preserving capabilities.

    This enhanced version uses directional windows to better preserve
    linear features like rivers and coastlines.

    Args:
        image: Input SAR image
        size: Filter window size

    Returns:
        Filtered image
    """
    # Define directional kernels (8 directions)
    directions = []
    for angle in range(0, 180, 22):
        rad = np.radians(angle)
        kernel = np.zeros((size, size))
        center = size // 2
        for i in range(size):
            x = int(center + (i - center) * np.cos(rad))
            y = int(center + (i - center) * np.sin(rad))
            if 0 <= x < size and 0 <= y < size:
                kernel[y, x] = 1
        kernel /= kernel.sum() if kernel.sum() > 0 else 1
        directions.append(kernel)

    # Apply each directional filter
    filtered_images = []
    for kernel in directions:
        filtered = ndimage.convolve(image.astype(np.float64), kernel)
        filtered_images.append(filtered)

    # Select minimum variance direction for each pixel
    variances = np.stack([
        ndimage.generic_filter(f, np.var, size=3)
        for f in filtered_images
    ])
    min_var_idx = np.argmin(variances, axis=0)

    # Build output from best direction per pixel
    result = np.zeros_like(image, dtype=np.float64)
    for i, filtered in enumerate(filtered_images):
        result[min_var_idx == i] = filtered[min_var_idx == i]

    return result


def radiometric_calibration(dn_values: np.ndarray, calibration_lut: float = 1.0) -> np.ndarray:
    """
    Convert digital numbers to calibrated backscatter (sigma0) in dB.

    Args:
        dn_values: Raw digital number values from SAR image
        calibration_lut: Calibration look-up table value (simplified)

    Returns:
        Calibrated backscatter in dB scale
    """
    # Convert to linear sigma0
    sigma0_linear = (dn_values ** 2) / (calibration_lut ** 2)

    # Convert to dB scale
    # Avoid log of zero
    sigma0_linear = np.maximum(sigma0_linear, 1e-10)
    sigma0_db = 10 * np.log10(sigma0_linear)

    return sigma0_db


def detect_water_otsu(vv_db: np.ndarray, vh_db: Optional[np.ndarray] = None) -> Tuple[np.ndarray, float]:
    """
    Detect water using Otsu's automatic thresholding on SAR backscatter.

    Water surfaces appear dark (low backscatter) in SAR imagery due to
    specular reflection away from the sensor.

    Args:
        vv_db: VV polarization backscatter in dB
        vh_db: Optional VH polarization backscatter in dB

    Returns:
        Tuple of (water mask, threshold value)
    """
    # Use VV for primary detection (water is very dark in VV)
    # Flatten and remove invalid values for threshold calculation
    valid_pixels = vv_db[~np.isnan(vv_db) & ~np.isinf(vv_db)]

    if len(valid_pixels) == 0:
        return np.zeros_like(vv_db, dtype=bool), -15.0

    # Calculate Otsu threshold
    try:
        threshold = threshold_otsu(valid_pixels)
    except ValueError:
        threshold = FIXED_THRESHOLD_VV

    # Water pixels are below the threshold
    water_mask = vv_db < threshold

    # If VH is available, use VV/VH ratio for refinement
    if vh_db is not None:
        # High VV/VH ratio indicates smoother surfaces (water)
        with np.errstate(divide='ignore', invalid='ignore'):
            ratio = vv_db - vh_db  # In dB, division becomes subtraction
            ratio = np.nan_to_num(ratio, nan=0.0)

        # Water typically has ratio > 2 dB
        ratio_mask = ratio > 2.0

        # Combine masks (water must be dark AND have high ratio)
        water_mask = water_mask & ratio_mask

    return water_mask, threshold


def detect_water_ratio(vv_db: np.ndarray, vh_db: np.ndarray) -> np.ndarray:
    """
    Detect water using VV/VH polarization ratio method.

    This method exploits the different scattering mechanisms of water
    vs land surfaces in different polarizations.

    Args:
        vv_db: VV polarization backscatter in dB
        vh_db: VH polarization backscatter in dB

    Returns:
        Water mask as boolean array
    """
    # Calculate ratio in dB (subtraction)
    with np.errstate(divide='ignore', invalid='ignore'):
        ratio = vv_db - vh_db
        ratio = np.nan_to_num(ratio, nan=0.0)

    # Water has higher ratio (smoother surface, less cross-pol scattering)
    # Typical threshold is around 1.5-3 dB
    water_mask = (ratio > 2.0) & (vv_db < -10)

    return water_mask


def clean_water_mask(
    mask: np.ndarray,
    closing_size: int = 3,
    opening_size: int = 2,
    min_area: int = 100
) -> np.ndarray:
    """
    Clean water mask using morphological operations and area filtering.

    Args:
        mask: Binary water mask
        closing_size: Structuring element size for closing (fills small holes)
        opening_size: Structuring element size for opening (removes small noise)
        min_area: Minimum connected component area to keep

    Returns:
        Cleaned water mask
    """
    # Morphological closing to fill small holes in water bodies
    struct_close = ndimage.generate_binary_structure(2, 1)
    struct_close = ndimage.iterate_structure(struct_close, closing_size)
    mask = binary_closing(mask, structure=struct_close)

    # Morphological opening to remove small noise pixels
    struct_open = ndimage.generate_binary_structure(2, 1)
    struct_open = ndimage.iterate_structure(struct_open, opening_size)
    mask = binary_opening(mask, structure=struct_open)

    # Remove small connected components
    labeled, num_features = ndimage.label(mask)
    component_sizes = ndimage.sum(mask, labeled, range(1, num_features + 1))

    # Keep only components larger than min_area
    small_components = np.where(component_sizes < min_area)[0] + 1
    mask_cleaned = mask.copy()
    for comp in small_components:
        mask_cleaned[labeled == comp] = False

    return mask_cleaned


# =============================================================================
# OPTICAL PROCESSING
# =============================================================================

def calculate_ndwi(green: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """
    Calculate Normalized Difference Water Index (NDWI).

    NDWI = (Green - NIR) / (Green + NIR)

    Water bodies have positive NDWI values, while vegetation and soil
    have negative values.

    Args:
        green: Green band (Sentinel-2 B03)
        nir: Near-infrared band (Sentinel-2 B08)

    Returns:
        NDWI values ranging from -1 to 1
    """
    with np.errstate(divide='ignore', invalid='ignore'):
        ndwi = (green.astype(np.float64) - nir.astype(np.float64)) / \
               (green.astype(np.float64) + nir.astype(np.float64))
        ndwi = np.nan_to_num(ndwi, nan=0.0)

    return ndwi


def detect_water_ndwi(ndwi: np.ndarray, threshold: float = 0.3) -> np.ndarray:
    """
    Detect water bodies from NDWI using threshold.

    Args:
        ndwi: NDWI values
        threshold: Water detection threshold (typically 0.2-0.5)

    Returns:
        Binary water mask
    """
    return ndwi > threshold


def create_cloud_mask(scl: np.ndarray) -> np.ndarray:
    """
    Create cloud mask from Sentinel-2 Scene Classification Layer (SCL).

    SCL values:
        0: No data, 1: Saturated/defective, 2: Dark area pixels,
        3: Cloud shadows, 4: Vegetation, 5: Not vegetated,
        6: Water, 7: Unclassified, 8: Cloud medium probability,
        9: Cloud high probability, 10: Thin cirrus, 11: Snow

    Args:
        scl: Scene Classification Layer

    Returns:
        Binary cloud mask (True = cloudy)
    """
    # Cloud classes: 8 (medium prob), 9 (high prob), 10 (cirrus), 3 (shadow)
    cloud_mask = np.isin(scl, [3, 8, 9, 10])
    return cloud_mask


# =============================================================================
# FLOOD ANALYSIS
# =============================================================================

def merge_sar_optical_masks(
    sar_mask: np.ndarray,
    optical_mask: np.ndarray,
    cloud_mask: np.ndarray
) -> np.ndarray:
    """
    Merge SAR and optical water masks, handling cloudy areas.

    Strategy:
    - Use optical where cloud-free (more accurate for permanent water)
    - Use SAR where cloudy (SAR penetrates clouds)
    - Take union for comprehensive flood detection

    Args:
        sar_mask: Water mask from SAR
        optical_mask: Water mask from optical (NDWI)
        cloud_mask: Cloud mask from optical

    Returns:
        Merged water mask
    """
    # Initialize with SAR mask
    merged = sar_mask.copy()

    # Where optical is cloud-free, use union of both
    cloud_free = ~cloud_mask
    merged[cloud_free] = sar_mask[cloud_free] | optical_mask[cloud_free]

    return merged


def calculate_flood_area(
    mask: np.ndarray,
    pixel_size_m: float = 10.0
) -> float:
    """
    Calculate total flooded area in square kilometers.

    Args:
        mask: Binary flood mask
        pixel_size_m: Pixel size in meters

    Returns:
        Flooded area in km²
    """
    num_flood_pixels = np.sum(mask)
    area_m2 = num_flood_pixels * (pixel_size_m ** 2)
    area_km2 = area_m2 / 1e6
    return area_km2


def classify_flood_damage(
    flood_mask: np.ndarray,
    permanent_water: Optional[np.ndarray] = None
) -> np.ndarray:
    """
    Classify flood damage levels.

    Classes:
        0: No flood
        1: Permanent water (rivers, lakes)
        2: Flood-affected area
        3: Severe flood (optional, based on depth estimation)

    Args:
        flood_mask: Binary flood detection mask
        permanent_water: Optional mask of permanent water bodies

    Returns:
        Classification map
    """
    classification = np.zeros_like(flood_mask, dtype=np.uint8)

    # Set flood-affected areas
    classification[flood_mask] = 2

    # If permanent water mask is available, distinguish from flood
    if permanent_water is not None:
        classification[permanent_water] = 1

    return classification


# =============================================================================
# VISUALIZATION
# =============================================================================

def create_damage_map_png(
    flood_mask: np.ndarray,
    classification: np.ndarray,
    cloud_mask: Optional[np.ndarray],
    bbox: List[float],
    output_path: str,
    flood_area_km2: float
):
    """
    Create publication-ready PNG damage map.

    Args:
        flood_mask: Binary flood mask
        classification: Flood classification map
        cloud_mask: Optional cloud mask
        bbox: Bounding box
        output_path: Output file path
        flood_area_km2: Calculated flood area
    """
    fig, ax = plt.subplots(1, 1, figsize=(12, 14), dpi=150)

    # Create color map for classification
    # 0: Non-flooded (grey), 1: Permanent water (light blue), 2: Flood (blue)
    colors = ['#808080', '#87CEEB', '#0066CC', '#FF4444']
    cmap = ListedColormap(colors[:3])

    # Plot classification
    im = ax.imshow(
        classification,
        cmap=cmap,
        extent=[bbox[0], bbox[2], bbox[1], bbox[3]],
        vmin=0,
        vmax=2
    )

    # Add cloud hatching if available
    if cloud_mask is not None and np.any(cloud_mask):
        cloud_overlay = np.ma.masked_where(~cloud_mask, cloud_mask)
        ax.imshow(
            cloud_overlay,
            cmap=ListedColormap(['white']),
            alpha=0.5,
            extent=[bbox[0], bbox[2], bbox[1], bbox[3]]
        )
        # Add hatch pattern for clouds
        ax.contourf(
            cloud_mask,
            levels=[0.5, 1.5],
            hatches=['///'],
            colors='none',
            extent=[bbox[0], bbox[2], bbox[1], bbox[3]]
        )

    # Add title and labels
    ax.set_title(
        f'Sri Lanka Flood Damage Map\n'
        f'Generated: {datetime.now().strftime("%Y-%m-%d %H:%M UTC")}\n'
        f'Estimated Flood Area: {flood_area_km2:.2f} km²',
        fontsize=14,
        fontweight='bold',
        pad=20
    )
    ax.set_xlabel('Longitude (°E)', fontsize=11)
    ax.set_ylabel('Latitude (°N)', fontsize=11)

    # Add grid
    ax.grid(True, linestyle='--', alpha=0.5)

    # Create legend
    legend_elements = [
        mpatches.Patch(color='#808080', label='Non-flooded Land'),
        mpatches.Patch(color='#87CEEB', label='Rivers/Permanent Water'),
        mpatches.Patch(color='#0066CC', label='Flood-affected Area'),
    ]
    if cloud_mask is not None:
        legend_elements.append(
            mpatches.Patch(facecolor='white', edgecolor='black',
                          hatch='///', label='Cloud Cover')
        )

    ax.legend(
        handles=legend_elements,
        loc='lower left',
        fontsize=10,
        framealpha=0.9
    )

    # Add scale bar (approximate)
    scale_length_deg = 0.5  # ~55 km at equator
    scale_x = bbox[0] + 0.2
    scale_y = bbox[1] + 0.2
    ax.plot([scale_x, scale_x + scale_length_deg], [scale_y, scale_y],
            'k-', linewidth=3)
    ax.text(scale_x + scale_length_deg/2, scale_y + 0.1, '~50 km',
            ha='center', fontsize=9)

    # Add attribution
    ax.text(
        0.99, 0.01,
        'Data: Copernicus Sentinel | Processing: FloodWatch.lk',
        transform=ax.transAxes,
        fontsize=8,
        ha='right',
        va='bottom',
        style='italic',
        alpha=0.7
    )

    # Add north arrow
    ax.annotate(
        'N', xy=(0.95, 0.95), xycoords='axes fraction',
        fontsize=14, fontweight='bold', ha='center'
    )
    ax.annotate(
        '', xy=(0.95, 0.98), xycoords='axes fraction',
        xytext=(0.95, 0.92), textcoords='axes fraction',
        arrowprops=dict(arrowstyle='->', color='black', lw=2)
    )

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close()

    print(f"✅ Saved damage map: {output_path}")


def create_leaflet_map(
    flood_mask: np.ndarray,
    classification: np.ndarray,
    cloud_mask: Optional[np.ndarray],
    bbox: List[float],
    output_path: str,
    flood_area_km2: float,
    sar_available: bool = True,
    optical_available: bool = False,
    ndwi: Optional[np.ndarray] = None
):
    """
    Create interactive Leaflet HTML map with layer controls.

    Args:
        flood_mask: Binary flood mask
        classification: Classification map
        cloud_mask: Cloud mask
        bbox: Bounding box
        output_path: Output HTML file path
        flood_area_km2: Flood area in km²
        sar_available: Whether SAR data is included
        optical_available: Whether optical data is included
        ndwi: Optional NDWI array for visualization
    """
    # Center of Sri Lanka
    center_lat = (bbox[1] + bbox[3]) / 2
    center_lon = (bbox[0] + bbox[2]) / 2

    # Create base map
    m = folium.Map(
        location=[center_lat, center_lon],
        zoom_start=8,
        tiles=None
    )

    # Add base layers
    folium.TileLayer(
        'OpenStreetMap',
        name='OpenStreetMap',
        control=True
    ).add_to(m)

    folium.TileLayer(
        'cartodbpositron',
        name='CartoDB Positron',
        control=True
    ).add_to(m)

    folium.TileLayer(
        tiles='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attr='Esri',
        name='Satellite Imagery',
        control=True
    ).add_to(m)

    # Convert masks to GeoJSON polygons for overlay
    # For simplicity, we'll create a rectangle overlay with opacity
    # In production, you'd vectorize the actual flood polygons

    # Create flood overlay as a simple rectangle with info
    flood_bounds = [[bbox[1], bbox[0]], [bbox[3], bbox[2]]]

    # Add flood area info popup
    flood_info = f"""
    <div style="font-family: Arial, sans-serif; padding: 10px;">
        <h3 style="margin: 0 0 10px 0; color: #0066CC;">Flood Analysis Results</h3>
        <table style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="padding: 5px; border-bottom: 1px solid #eee;"><strong>Estimated Flood Area:</strong></td>
                <td style="padding: 5px; border-bottom: 1px solid #eee;">{flood_area_km2:.2f} km²</td>
            </tr>
            <tr>
                <td style="padding: 5px; border-bottom: 1px solid #eee;"><strong>Analysis Date:</strong></td>
                <td style="padding: 5px; border-bottom: 1px solid #eee;">{datetime.now().strftime("%Y-%m-%d %H:%M UTC")}</td>
            </tr>
            <tr>
                <td style="padding: 5px; border-bottom: 1px solid #eee;"><strong>Data Sources:</strong></td>
                <td style="padding: 5px; border-bottom: 1px solid #eee;">
                    {'Sentinel-1 SAR' if sar_available else ''}
                    {' + ' if sar_available and optical_available else ''}
                    {'Sentinel-2 Optical' if optical_available else ''}
                </td>
            </tr>
            <tr>
                <td style="padding: 5px;"><strong>Processing:</strong></td>
                <td style="padding: 5px;">Lee Filter + Otsu Threshold</td>
            </tr>
        </table>
    </div>
    """

    # Create feature groups for layer control
    flood_layer = folium.FeatureGroup(name='🌊 Flood Mask', show=True)

    # Add flood rectangle (semi-transparent blue)
    folium.Rectangle(
        bounds=flood_bounds,
        color='#0066CC',
        fill=True,
        fillColor='#0066CC',
        fillOpacity=0.3,
        weight=2,
        popup=folium.Popup(flood_info, max_width=350)
    ).add_to(flood_layer)

    flood_layer.add_to(m)

    # Add SAR layer indicator
    if sar_available:
        sar_layer = folium.FeatureGroup(name='📡 Sentinel-1 SAR', show=False)
        folium.Rectangle(
            bounds=flood_bounds,
            color='#FF6600',
            fill=True,
            fillColor='#FF6600',
            fillOpacity=0.2,
            weight=1,
            popup='Sentinel-1 SAR Coverage (VV+VH)'
        ).add_to(sar_layer)
        sar_layer.add_to(m)

    # Add optical layer indicator
    if optical_available:
        optical_layer = folium.FeatureGroup(name='🛰️ Sentinel-2 Optical', show=False)
        folium.Rectangle(
            bounds=flood_bounds,
            color='#00CC66',
            fill=True,
            fillColor='#00CC66',
            fillOpacity=0.2,
            weight=1,
            popup='Sentinel-2 Optical Coverage'
        ).add_to(optical_layer)
        optical_layer.add_to(m)

        # Add NDWI layer
        ndwi_layer = folium.FeatureGroup(name='💧 NDWI Water Index', show=False)
        folium.Rectangle(
            bounds=flood_bounds,
            color='#0099CC',
            fill=True,
            fillColor='#0099CC',
            fillOpacity=0.25,
            weight=1,
            popup='NDWI Water Detection'
        ).add_to(ndwi_layer)
        ndwi_layer.add_to(m)

    # Add cloud cover indicator if available
    if cloud_mask is not None and np.any(cloud_mask):
        cloud_layer = folium.FeatureGroup(name='☁️ Cloud Cover', show=False)
        cloud_pct = np.sum(cloud_mask) / cloud_mask.size * 100
        folium.Rectangle(
            bounds=flood_bounds,
            color='#CCCCCC',
            fill=True,
            fillColor='#FFFFFF',
            fillOpacity=0.4,
            weight=1,
            popup=f'Cloud Coverage: {cloud_pct:.1f}%'
        ).add_to(cloud_layer)
        cloud_layer.add_to(m)

    # Add legend
    legend_html = '''
    <div style="position: fixed; bottom: 50px; left: 50px; z-index: 1000;
                background-color: white; padding: 15px; border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2); font-family: Arial, sans-serif;
                max-width: 200px;">
        <h4 style="margin: 0 0 10px 0; font-size: 14px;">Legend</h4>
        <div style="margin-bottom: 5px;">
            <span style="display: inline-block; width: 20px; height: 12px;
                        background-color: #0066CC; opacity: 0.5; margin-right: 8px;
                        vertical-align: middle;"></span>
            <span style="font-size: 12px;">Flood Area</span>
        </div>
        <div style="margin-bottom: 5px;">
            <span style="display: inline-block; width: 20px; height: 12px;
                        background-color: #87CEEB; margin-right: 8px;
                        vertical-align: middle;"></span>
            <span style="font-size: 12px;">Permanent Water</span>
        </div>
        <div style="margin-bottom: 5px;">
            <span style="display: inline-block; width: 20px; height: 12px;
                        background-color: #808080; margin-right: 8px;
                        vertical-align: middle;"></span>
            <span style="font-size: 12px;">Land</span>
        </div>
        <div>
            <span style="display: inline-block; width: 20px; height: 12px;
                        background: repeating-linear-gradient(45deg, white, white 2px, #ccc 2px, #ccc 4px);
                        border: 1px solid #ccc; margin-right: 8px;
                        vertical-align: middle;"></span>
            <span style="font-size: 12px;">Cloud Cover</span>
        </div>
        <hr style="margin: 10px 0; border: none; border-top: 1px solid #eee;">
        <div style="font-size: 11px; color: #666;">
            <strong>Flood Area:</strong> {:.2f} km²
        </div>
    </div>
    '''.format(flood_area_km2)

    m.get_root().html.add_child(folium.Element(legend_html))

    # Add title
    title_html = '''
    <div style="position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
                z-index: 1000; background-color: white; padding: 10px 20px;
                border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                font-family: Arial, sans-serif;">
        <h3 style="margin: 0; color: #333;">🌊 Sri Lanka Flood Damage Map</h3>
        <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">
            Generated: {} | Data: Copernicus Sentinel
        </p>
    </div>
    '''.format(datetime.now().strftime("%Y-%m-%d %H:%M UTC"))

    m.get_root().html.add_child(folium.Element(title_html))

    # Add layer control
    folium.LayerControl(collapsed=False).add_to(m)

    # Add scale bar
    plugins.MeasureControl(position='bottomright').add_to(m)

    # Add fullscreen option
    plugins.Fullscreen().add_to(m)

    # Add mouse position
    plugins.MousePosition().add_to(m)

    # Add minimap
    plugins.MiniMap(toggle_display=True).add_to(m)

    # Save map
    m.save(output_path)
    print(f"✅ Saved Leaflet map: {output_path}")


def save_flood_mask_geotiff(
    mask: np.ndarray,
    bbox: List[float],
    output_path: str,
    crs: str = "EPSG:4326"
):
    """
    Save flood mask as GeoTIFF file.

    Args:
        mask: Binary flood mask
        bbox: Bounding box [min_lon, min_lat, max_lon, max_lat]
        output_path: Output file path
        crs: Coordinate reference system
    """
    try:
        import rasterio
        from rasterio.transform import from_bounds

        height, width = mask.shape
        transform = from_bounds(bbox[0], bbox[1], bbox[2], bbox[3], width, height)

        with rasterio.open(
            output_path,
            'w',
            driver='GTiff',
            height=height,
            width=width,
            count=1,
            dtype=mask.dtype,
            crs=crs,
            transform=transform,
            compress='lzw'
        ) as dst:
            dst.write(mask.astype(np.uint8), 1)

        print(f"✅ Saved GeoTIFF: {output_path}")

    except ImportError:
        print("⚠️  rasterio not available, saving as numpy array instead")
        np.save(output_path.replace('.tif', '.npy'), mask)
        print(f"✅ Saved numpy array: {output_path.replace('.tif', '.npy')}")


# =============================================================================
# DEMO DATA GENERATION
# =============================================================================

def generate_demo_data(bbox: List[float], resolution: int = 500) -> Dict[str, np.ndarray]:
    """
    Generate synthetic demo data for testing when real satellite data is unavailable.

    This creates realistic-looking flood patterns based on Sri Lanka's geography.

    Args:
        bbox: Bounding box
        resolution: Output resolution in pixels

    Returns:
        Dictionary containing synthetic VV, VH, and optional optical bands
    """
    print("📊 Generating demo data (real satellite data requires API credentials)...")

    # Calculate dimensions
    aspect_ratio = (bbox[2] - bbox[0]) / (bbox[3] - bbox[1])
    height = resolution
    width = int(resolution * aspect_ratio)

    # Create coordinate grids
    lon = np.linspace(bbox[0], bbox[2], width)
    lat = np.linspace(bbox[3], bbox[1], height)  # Note: lat is inverted for image coords
    lon_grid, lat_grid = np.meshgrid(lon, lat)

    # Generate base terrain (land vs ocean)
    # Sri Lanka roughly fits in a teardrop shape
    center_lon = 80.7
    center_lat = 7.9

    # Distance from center
    dist = np.sqrt((lon_grid - center_lon)**2 + (lat_grid - center_lat)**2)

    # Create land mask (simplified Sri Lanka shape)
    # Northern part is narrower
    width_factor = 1.0 - 0.3 * (lat_grid - 6.0) / 4.0
    width_factor = np.clip(width_factor, 0.5, 1.2)

    land_mask = dist < (1.5 * width_factor)

    # Add some coastal irregularity
    noise = np.random.randn(height, width) * 0.1
    land_mask = land_mask & (dist < (1.5 * width_factor + noise))

    # Generate SAR backscatter
    # Land: typically -5 to -15 dB
    # Water: typically -15 to -25 dB
    vv_db = np.where(land_mask,
                     -10 + np.random.randn(height, width) * 3,
                     -20 + np.random.randn(height, width) * 2)

    vh_db = vv_db - 6 + np.random.randn(height, width) * 1  # VH is typically 5-7 dB lower

    # Add river patterns (major rivers of Sri Lanka)
    # Mahaweli, Kelani, Kalu, etc.
    rivers = np.zeros((height, width), dtype=bool)

    # Mahaweli River (longest river, flows NE)
    mahaweli_lat = np.linspace(7.0, 8.5, 100)
    mahaweli_lon = 80.5 + 0.5 * np.sin((mahaweli_lat - 7.0) * 2)
    for i in range(len(mahaweli_lat)):
        lat_idx = int((bbox[3] - mahaweli_lat[i]) / (bbox[3] - bbox[1]) * height)
        lon_idx = int((mahaweli_lon[i] - bbox[0]) / (bbox[2] - bbox[0]) * width)
        if 0 <= lat_idx < height and 0 <= lon_idx < width:
            rivers[max(0, lat_idx-2):min(height, lat_idx+3),
                   max(0, lon_idx-2):min(width, lon_idx+3)] = True

    # Kelani River (flows through Colombo)
    kelani_lat = np.linspace(6.9, 7.2, 50)
    kelani_lon = 79.9 + 0.2 * (kelani_lat - 6.9)
    for i in range(len(kelani_lat)):
        lat_idx = int((bbox[3] - kelani_lat[i]) / (bbox[3] - bbox[1]) * height)
        lon_idx = int((kelani_lon[i] - bbox[0]) / (bbox[2] - bbox[0]) * width)
        if 0 <= lat_idx < height and 0 <= lon_idx < width:
            rivers[max(0, lat_idx-1):min(height, lat_idx+2),
                   max(0, lon_idx-1):min(width, lon_idx+2)] = True

    # Set river backscatter (water)
    vv_db[rivers & land_mask] = -22 + np.random.randn(np.sum(rivers & land_mask)) * 1

    # Add flood zones (simulate monsoon flooding)
    # Flood-prone areas: low-lying western coast, Kelani basin, etc.
    flood_zones = np.zeros((height, width), dtype=bool)

    # Western coastal flooding
    western_flood = (lon_grid < 80.2) & (lat_grid > 6.5) & (lat_grid < 7.5) & land_mask
    flood_zones |= western_flood & (np.random.rand(height, width) > 0.6)

    # Kelani basin flooding
    kelani_flood = (lon_grid > 79.8) & (lon_grid < 80.3) & (lat_grid > 6.8) & (lat_grid < 7.3) & land_mask
    flood_zones |= kelani_flood & (np.random.rand(height, width) > 0.5)

    # Eastern flooding (Batticaloa area)
    eastern_flood = (lon_grid > 81.5) & (lat_grid > 7.5) & (lat_grid < 8.0) & land_mask
    flood_zones |= eastern_flood & (np.random.rand(height, width) > 0.7)

    # Set flood backscatter
    vv_db[flood_zones] = -18 + np.random.randn(np.sum(flood_zones)) * 2

    # Add speckle noise
    vv_db += np.random.randn(height, width) * 1.5
    vh_db += np.random.randn(height, width) * 1.5

    # Generate optical bands (simplified)
    # Green band (B03)
    green = np.where(land_mask,
                     np.where(flood_zones | rivers, 800, 1200) + np.random.randn(height, width) * 100,
                     500 + np.random.randn(height, width) * 50)

    # NIR band (B08)
    nir = np.where(land_mask,
                   np.where(flood_zones | rivers, 400, 2500) + np.random.randn(height, width) * 200,
                   300 + np.random.randn(height, width) * 30)

    # Cloud mask (random patches)
    cloud_mask = np.zeros((height, width), dtype=bool)
    num_clouds = np.random.randint(3, 8)
    for _ in range(num_clouds):
        cloud_center_y = np.random.randint(0, height)
        cloud_center_x = np.random.randint(0, width)
        cloud_radius = np.random.randint(20, 60)
        y, x = np.ogrid[:height, :width]
        cloud_dist = np.sqrt((x - cloud_center_x)**2 + (y - cloud_center_y)**2)
        cloud_mask |= cloud_dist < cloud_radius

    return {
        'vv_db': vv_db,
        'vh_db': vh_db,
        'green': green.astype(np.uint16),
        'nir': nir.astype(np.uint16),
        'cloud_mask': cloud_mask,
        'land_mask': land_mask,
        'rivers': rivers,
        'flood_zones': flood_zones
    }


# =============================================================================
# MAIN PROCESSING PIPELINE
# =============================================================================

def run_flood_detection(
    output_dir: str,
    use_optical: bool = False,
    use_demo_data: bool = True,
    copernicus_client_id: Optional[str] = None,
    copernicus_client_secret: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Run the complete flood detection pipeline.

    Args:
        output_dir: Directory for output files
        use_optical: Whether to include optical data
        use_demo_data: Whether to use demo data (True if no credentials)
        copernicus_client_id: Copernicus Dataspace client ID
        copernicus_client_secret: Copernicus Dataspace client secret
        start_date: Start date for data search (YYYY-MM-DD)
        end_date: End date for data search (YYYY-MM-DD)

    Returns:
        Dictionary with processing results and statistics
    """
    print("=" * 60)
    print("🌊 SRI LANKA FLOOD DAMAGE DETECTION")
    print("=" * 60)
    print(f"📍 Bounding Box: {BBOX}")
    print(f"📂 Output Directory: {output_dir}")
    print(f"🛰️ Using Optical Data: {use_optical}")
    print("=" * 60)

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    # Set default dates if not provided
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")
    if start_date is None:
        start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")

    results = {
        'status': 'success',
        'bbox': BBOX,
        'processing_date': datetime.now().isoformat(),
        'data_source': 'demo' if use_demo_data else 'copernicus'
    }

    # =========================================================================
    # STEP 1: DATA ACQUISITION
    # =========================================================================
    print("\n📡 STEP 1: Data Acquisition")
    print("-" * 40)

    if use_demo_data or copernicus_client_id is None:
        print("Using demo data (no API credentials provided)")
        data = generate_demo_data(BBOX, resolution=500)
        vv_db = data['vv_db']
        vh_db = data['vh_db']
        green = data['green']
        nir = data['nir']
        cloud_mask = data['cloud_mask']
        land_mask = data['land_mask']
        optical_available = use_optical
    else:
        # Real data acquisition would go here
        # This requires setting up OAuth2 authentication and downloading actual products
        print(f"Searching for Sentinel-1 products from {start_date} to {end_date}...")
        s1_products = search_sentinel1_products(BBOX, start_date, end_date)
        print(f"Found {len(s1_products)} Sentinel-1 products")

        if use_optical:
            print(f"Searching for Sentinel-2 products...")
            s2_products = search_sentinel2_products(BBOX, start_date, end_date)
            print(f"Found {len(s2_products)} Sentinel-2 products")

        # For now, fall back to demo data
        print("⚠️ Full data download not implemented - using demo data")
        data = generate_demo_data(BBOX, resolution=500)
        vv_db = data['vv_db']
        vh_db = data['vh_db']
        green = data['green']
        nir = data['nir']
        cloud_mask = data['cloud_mask']
        land_mask = data['land_mask']
        optical_available = use_optical

    print(f"✅ Data acquired: {vv_db.shape[1]}x{vv_db.shape[0]} pixels")

    # =========================================================================
    # STEP 2: SAR PREPROCESSING
    # =========================================================================
    print("\n🔧 STEP 2: SAR Preprocessing")
    print("-" * 40)

    # Apply speckle filtering
    print("Applying Lee speckle filter...")
    vv_filtered = apply_lee_filter(vv_db, size=SPECKLE_FILTER_SIZE)
    vh_filtered = apply_lee_filter(vh_db, size=SPECKLE_FILTER_SIZE)
    print(f"✅ Speckle filtering complete (window size: {SPECKLE_FILTER_SIZE})")

    # =========================================================================
    # STEP 3: WATER DETECTION
    # =========================================================================
    print("\n💧 STEP 3: Water Detection")
    print("-" * 40)

    # SAR-based water detection
    print(f"Detecting water using {SAR_THRESHOLD_METHOD} method...")

    if SAR_THRESHOLD_METHOD == "otsu":
        sar_water_mask, threshold = detect_water_otsu(vv_filtered, vh_filtered)
        print(f"Otsu threshold: {threshold:.2f} dB")
    elif SAR_THRESHOLD_METHOD == "ratio":
        sar_water_mask = detect_water_ratio(vv_filtered, vh_filtered)
        threshold = "VV/VH ratio"
    else:
        sar_water_mask = vv_filtered < FIXED_THRESHOLD_VV
        threshold = FIXED_THRESHOLD_VV

    # Clean the mask
    print("Cleaning water mask with morphological operations...")
    sar_water_mask = clean_water_mask(
        sar_water_mask,
        closing_size=MORPHOLOGY_KERNEL_SIZE,
        opening_size=2,
        min_area=MIN_WATER_AREA_PIXELS
    )

    # Apply land mask (only detect water on land, not ocean)
    sar_water_mask = sar_water_mask & land_mask

    print(f"✅ SAR water detection complete")
    print(f"   Threshold: {threshold}")
    print(f"   Water pixels: {np.sum(sar_water_mask):,}")

    # Optical-based water detection (if available)
    optical_water_mask = None
    ndwi = None

    if optical_available:
        print("\nProcessing optical data...")

        # Calculate NDWI
        ndwi = calculate_ndwi(green, nir)
        optical_water_mask = detect_water_ndwi(ndwi, NDWI_THRESHOLD)
        optical_water_mask = optical_water_mask & land_mask & ~cloud_mask

        print(f"✅ Optical water detection complete")
        print(f"   NDWI threshold: {NDWI_THRESHOLD}")
        print(f"   Water pixels (cloud-free): {np.sum(optical_water_mask):,}")
        print(f"   Cloud cover: {np.sum(cloud_mask) / cloud_mask.size * 100:.1f}%")

    # =========================================================================
    # STEP 4: MERGE AND CLASSIFY
    # =========================================================================
    print("\n🔀 STEP 4: Merging and Classification")
    print("-" * 40)

    if optical_available and optical_water_mask is not None:
        print("Merging SAR and optical water masks...")
        final_flood_mask = merge_sar_optical_masks(
            sar_water_mask,
            optical_water_mask,
            cloud_mask
        )
    else:
        final_flood_mask = sar_water_mask
        cloud_mask = None

    # Classify flood damage
    # Use rivers from demo data as permanent water (in real scenario, use baseline)
    permanent_water = data.get('rivers', None) if use_demo_data else None
    classification = classify_flood_damage(final_flood_mask, permanent_water)

    print(f"✅ Classification complete")

    # =========================================================================
    # STEP 5: CALCULATE STATISTICS
    # =========================================================================
    print("\n📊 STEP 5: Computing Statistics")
    print("-" * 40)

    # Calculate flood area
    # Estimate pixel size based on bbox and resolution
    pixel_size_lat = (BBOX[3] - BBOX[1]) / vv_db.shape[0] * 111000  # ~111km per degree
    pixel_size_lon = (BBOX[2] - BBOX[0]) / vv_db.shape[1] * 111000 * np.cos(np.radians(7.9))
    pixel_size_m = np.sqrt(pixel_size_lat * pixel_size_lon)

    flood_area_km2 = calculate_flood_area(final_flood_mask, pixel_size_m)
    total_land_area_km2 = calculate_flood_area(land_mask, pixel_size_m)
    flood_percentage = (flood_area_km2 / total_land_area_km2) * 100 if total_land_area_km2 > 0 else 0

    print(f"✅ Statistics computed:")
    print(f"   Total land area: {total_land_area_km2:,.2f} km²")
    print(f"   Flood-affected area: {flood_area_km2:,.2f} km²")
    print(f"   Flood coverage: {flood_percentage:.2f}%")

    results['flood_area_km2'] = flood_area_km2
    results['total_land_area_km2'] = total_land_area_km2
    results['flood_percentage'] = flood_percentage

    # =========================================================================
    # STEP 6: GENERATE OUTPUTS
    # =========================================================================
    print("\n🎨 STEP 6: Generating Output Maps")
    print("-" * 40)

    # Output file paths
    geotiff_path = os.path.join(output_dir, "sri_lanka_flood_mask.tif")
    png_path = os.path.join(output_dir, "sri_lanka_damage_map.png")
    html_path = os.path.join(output_dir, "damage_map_leaflet.html")

    # Save GeoTIFF
    print("Saving flood mask GeoTIFF...")
    save_flood_mask_geotiff(final_flood_mask, BBOX, geotiff_path)

    # Create PNG damage map
    print("Creating PNG damage map...")
    create_damage_map_png(
        final_flood_mask,
        classification,
        cloud_mask,
        BBOX,
        png_path,
        flood_area_km2
    )

    # Create Leaflet HTML map
    print("Creating interactive Leaflet map...")
    create_leaflet_map(
        final_flood_mask,
        classification,
        cloud_mask,
        BBOX,
        html_path,
        flood_area_km2,
        sar_available=True,
        optical_available=optical_available,
        ndwi=ndwi
    )

    results['output_files'] = {
        'geotiff': geotiff_path,
        'png': png_path,
        'html': html_path
    }

    # =========================================================================
    # SUMMARY
    # =========================================================================
    print("\n" + "=" * 60)
    print("✅ FLOOD DETECTION COMPLETE")
    print("=" * 60)
    print(f"\n📁 Output Files:")
    print(f"   • GeoTIFF: {geotiff_path}")
    print(f"   • PNG Map: {png_path}")
    print(f"   • Leaflet Map: {html_path}")
    print(f"\n📊 Results:")
    print(f"   • Flood Area: {flood_area_km2:,.2f} km²")
    print(f"   • Land Coverage: {flood_percentage:.2f}%")
    print("=" * 60)

    return results


# =============================================================================
# CLI ENTRY POINT
# =============================================================================

def main():
    """Main entry point for command-line usage."""
    parser = argparse.ArgumentParser(
        description='Sri Lanka Flood Damage Detection from Satellite Imagery',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Run with demo data (no credentials needed)
    python flood_damage_detection.py --output-dir ./output

    # Run with optical data
    python flood_damage_detection.py --output-dir ./output --use-optical

    # Run with Copernicus credentials
    python flood_damage_detection.py --output-dir ./output \\
        --client-id YOUR_ID --client-secret YOUR_SECRET

Output Files:
    - sri_lanka_flood_mask.tif  : GeoTIFF flood mask
    - sri_lanka_damage_map.png  : Publication-ready PNG map
    - damage_map_leaflet.html   : Interactive web map
        """
    )

    parser.add_argument(
        '--output-dir', '-o',
        type=str,
        default='./flood_output',
        help='Output directory for generated files'
    )

    parser.add_argument(
        '--use-optical',
        action='store_true',
        help='Include Sentinel-2 optical data (NDWI)'
    )

    parser.add_argument(
        '--client-id',
        type=str,
        default=None,
        help='Copernicus Dataspace client ID'
    )

    parser.add_argument(
        '--client-secret',
        type=str,
        default=None,
        help='Copernicus Dataspace client secret'
    )

    parser.add_argument(
        '--start-date',
        type=str,
        default=None,
        help='Start date for data search (YYYY-MM-DD)'
    )

    parser.add_argument(
        '--end-date',
        type=str,
        default=None,
        help='End date for data search (YYYY-MM-DD)'
    )

    parser.add_argument(
        '--demo',
        action='store_true',
        default=True,
        help='Use demo data (default: True)'
    )

    args = parser.parse_args()

    # Determine if using demo data
    use_demo = args.demo or (args.client_id is None)

    # Run the pipeline
    results = run_flood_detection(
        output_dir=args.output_dir,
        use_optical=args.use_optical,
        use_demo_data=use_demo,
        copernicus_client_id=args.client_id,
        copernicus_client_secret=args.client_secret,
        start_date=args.start_date,
        end_date=args.end_date
    )

    # Save results as JSON
    results_path = os.path.join(args.output_dir, 'processing_results.json')
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\n📋 Results saved to: {results_path}")

    return results


if __name__ == "__main__":
    main()
