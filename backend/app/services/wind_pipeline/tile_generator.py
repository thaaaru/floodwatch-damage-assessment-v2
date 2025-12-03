"""
Wind Tile Generator
Creates vector tiles and raster tiles for wind visualization.
Supports multiple zoom levels and regions.
"""
import os
import json
import math
import logging
from typing import Dict, List, Tuple, Optional
import numpy as np
from datetime import datetime

logger = logging.getLogger(__name__)

# Tile configuration
TILE_SIZE = 256
MAX_ZOOM = 8
MIN_ZOOM = 2

# Output formats
FORMAT_JSON = "json"
FORMAT_BINARY = "bin"


def lat_lon_to_tile(lat: float, lon: float, zoom: int) -> Tuple[int, int]:
    """Convert lat/lon to tile coordinates at given zoom level."""
    n = 2 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def tile_to_lat_lon(x: int, y: int, zoom: int) -> Tuple[float, float, float, float]:
    """Convert tile coordinates to bounding box (north, south, east, west)."""
    n = 2 ** zoom
    west = x / n * 360.0 - 180.0
    east = (x + 1) / n * 360.0 - 180.0
    north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return north, south, east, west


def interpolate_wind_to_tile(
    wind_data: Dict,
    tile_x: int,
    tile_y: int,
    zoom: int,
    resolution: int = 32
) -> Optional[Dict]:
    """
    Interpolate wind data to a specific tile.

    Args:
        wind_data: Dict with lon, lat, u, v arrays
        tile_x: Tile X coordinate
        tile_y: Tile Y coordinate
        zoom: Zoom level
        resolution: Number of points per tile edge

    Returns:
        Dict with interpolated u, v arrays for the tile
    """
    try:
        # Get tile bounds
        north, south, east, west = tile_to_lat_lon(tile_x, tile_y, zoom)

        # Source grid
        src_lon = np.array(wind_data["lon"])
        src_lat = np.array(wind_data["lat"])
        src_u = np.array(wind_data["u"])
        src_v = np.array(wind_data["v"])

        # Target grid for tile
        tile_lons = np.linspace(west, east, resolution)
        tile_lats = np.linspace(north, south, resolution)

        # Create output arrays
        out_u = np.zeros((resolution, resolution))
        out_v = np.zeros((resolution, resolution))

        # Bilinear interpolation
        for i, lat in enumerate(tile_lats):
            for j, lon in enumerate(tile_lons):
                # Handle longitude wrapping
                query_lon = lon if lon >= 0 else lon + 360

                # Find surrounding grid points
                lon_idx = np.searchsorted(src_lon, query_lon)
                lat_idx = np.searchsorted(src_lat[::-1], lat)
                lat_idx = len(src_lat) - 1 - lat_idx

                # Bounds check
                if lon_idx <= 0 or lon_idx >= len(src_lon):
                    continue
                if lat_idx <= 0 or lat_idx >= len(src_lat):
                    continue

                # Grid cell corners
                x0, x1 = lon_idx - 1, lon_idx
                y0, y1 = lat_idx - 1, lat_idx

                # Interpolation weights
                lon0, lon1 = src_lon[x0], src_lon[x1]
                lat0, lat1 = src_lat[y0], src_lat[y1]

                if lon1 == lon0 or lat1 == lat0:
                    continue

                wx = (query_lon - lon0) / (lon1 - lon0)
                wy = (lat - lat0) / (lat1 - lat0)

                # Bilinear interpolation
                u00 = src_u[y0][x0] if y0 < len(src_u) and x0 < len(src_u[0]) else 0
                u01 = src_u[y0][x1] if y0 < len(src_u) and x1 < len(src_u[0]) else 0
                u10 = src_u[y1][x0] if y1 < len(src_u) and x0 < len(src_u[0]) else 0
                u11 = src_u[y1][x1] if y1 < len(src_u) and x1 < len(src_u[0]) else 0

                v00 = src_v[y0][x0] if y0 < len(src_v) and x0 < len(src_v[0]) else 0
                v01 = src_v[y0][x1] if y0 < len(src_v) and x1 < len(src_v[0]) else 0
                v10 = src_v[y1][x0] if y1 < len(src_v) and x0 < len(src_v[0]) else 0
                v11 = src_v[y1][x1] if y1 < len(src_v) and x1 < len(src_v[0]) else 0

                out_u[i][j] = (
                    u00 * (1 - wx) * (1 - wy) +
                    u01 * wx * (1 - wy) +
                    u10 * (1 - wx) * wy +
                    u11 * wx * wy
                )
                out_v[i][j] = (
                    v00 * (1 - wx) * (1 - wy) +
                    v01 * wx * (1 - wy) +
                    v10 * (1 - wx) * wy +
                    v11 * wx * wy
                )

        # Calculate speed
        speed = np.sqrt(out_u ** 2 + out_v ** 2)

        return {
            "tile": {"x": tile_x, "y": tile_y, "z": zoom},
            "bounds": {"north": north, "south": south, "east": east, "west": west},
            "resolution": resolution,
            "u": out_u.tolist(),
            "v": out_v.tolist(),
            "speed": speed.tolist(),
            "min_speed": float(np.min(speed)),
            "max_speed": float(np.max(speed))
        }

    except Exception as e:
        logger.error(f"Failed to interpolate tile {zoom}/{tile_x}/{tile_y}: {e}")
        return None


def generate_tiles_for_region(
    wind_data: Dict,
    bounds: Dict,
    zoom_levels: List[int] = None,
    output_dir: str = None
) -> List[str]:
    """
    Generate all tiles covering a region at specified zoom levels.

    Args:
        wind_data: Source wind data with lon, lat, u, v
        bounds: Region bounds (lat_min, lat_max, lon_min, lon_max)
        zoom_levels: List of zoom levels to generate
        output_dir: Directory to save tiles

    Returns:
        List of generated tile paths
    """
    if zoom_levels is None:
        zoom_levels = [3, 4, 5, 6]

    generated = []

    for zoom in zoom_levels:
        # Find tiles covering the region
        min_tile_x, max_tile_y = lat_lon_to_tile(bounds["lat_min"], bounds["lon_min"], zoom)
        max_tile_x, min_tile_y = lat_lon_to_tile(bounds["lat_max"], bounds["lon_max"], zoom)

        logger.info(f"Generating tiles for zoom {zoom}: x={min_tile_x}-{max_tile_x}, y={min_tile_y}-{max_tile_y}")

        for tile_x in range(min_tile_x, max_tile_x + 1):
            for tile_y in range(min_tile_y, max_tile_y + 1):
                tile_data = interpolate_wind_to_tile(wind_data, tile_x, tile_y, zoom)

                if tile_data and output_dir:
                    # Save tile
                    tile_path = os.path.join(output_dir, str(zoom), str(tile_x))
                    os.makedirs(tile_path, exist_ok=True)
                    tile_file = os.path.join(tile_path, f"{tile_y}.json")

                    with open(tile_file, 'w') as f:
                        json.dump(tile_data, f)

                    generated.append(tile_file)

    return generated


def create_binary_tile(tile_data: Dict) -> bytes:
    """
    Create compact binary format for wind tile.
    Format: [header][u_values][v_values]
    - Header: 16 bytes (4x float32: min_u, max_u, min_v, max_v)
    - U values: resolution^2 * uint8 (normalized 0-255)
    - V values: resolution^2 * uint8 (normalized 0-255)
    """
    u = np.array(tile_data["u"])
    v = np.array(tile_data["v"])

    # Normalize to 0-255
    u_min, u_max = float(np.min(u)), float(np.max(u))
    v_min, v_max = float(np.min(v)), float(np.max(v))

    if u_max > u_min:
        u_norm = ((u - u_min) / (u_max - u_min) * 255).astype(np.uint8)
    else:
        u_norm = np.zeros_like(u, dtype=np.uint8)

    if v_max > v_min:
        v_norm = ((v - v_min) / (v_max - v_min) * 255).astype(np.uint8)
    else:
        v_norm = np.zeros_like(v, dtype=np.uint8)

    # Pack header
    header = np.array([u_min, u_max, v_min, v_max], dtype=np.float32)

    # Combine
    return header.tobytes() + u_norm.tobytes() + v_norm.tobytes()


def parse_binary_tile(data: bytes, resolution: int = 32) -> Dict:
    """Parse binary tile format back to dict."""
    # Read header
    header = np.frombuffer(data[:16], dtype=np.float32)
    u_min, u_max, v_min, v_max = header

    # Read normalized values
    offset = 16
    size = resolution * resolution
    u_norm = np.frombuffer(data[offset:offset + size], dtype=np.uint8).reshape((resolution, resolution))
    v_norm = np.frombuffer(data[offset + size:offset + 2 * size], dtype=np.uint8).reshape((resolution, resolution))

    # Denormalize
    u = u_norm.astype(np.float32) / 255.0 * (u_max - u_min) + u_min
    v = v_norm.astype(np.float32) / 255.0 * (v_max - v_min) + v_min

    return {
        "u": u.tolist(),
        "v": v.tolist(),
        "resolution": resolution
    }


class WindTileCache:
    """In-memory cache for wind tiles with LRU eviction."""

    def __init__(self, max_size: int = 1000):
        self.cache = {}
        self.access_order = []
        self.max_size = max_size

    def _make_key(self, run: str, fhr: int, z: int, x: int, y: int) -> str:
        return f"{run}/{fhr}/{z}/{x}/{y}"

    def get(self, run: str, fhr: int, z: int, x: int, y: int) -> Optional[Dict]:
        key = self._make_key(run, fhr, z, x, y)
        if key in self.cache:
            # Move to end (most recently used)
            self.access_order.remove(key)
            self.access_order.append(key)
            return self.cache[key]
        return None

    def put(self, run: str, fhr: int, z: int, x: int, y: int, data: Dict):
        key = self._make_key(run, fhr, z, x, y)

        # Evict if necessary
        while len(self.cache) >= self.max_size:
            oldest = self.access_order.pop(0)
            del self.cache[oldest]

        self.cache[key] = data
        self.access_order.append(key)

    def clear(self):
        self.cache.clear()
        self.access_order.clear()


# Global tile cache
tile_cache = WindTileCache()
