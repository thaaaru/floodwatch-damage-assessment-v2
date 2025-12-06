#!/usr/bin/env python3
"""
Sri Lanka Flood Map Generator

Generates a flood map visualization similar to:
https://raw.githubusercontent.com/nuuuwan/lk_dmc_vis/refs/heads/main/images/map.png

Data sources:
- Gauging stations: https://raw.githubusercontent.com/nuuuwan/lk_dmc_vis/main/data/static/gauging_stations.json
- Locations: https://raw.githubusercontent.com/nuuuwan/lk_dmc_vis/main/data/static/locations.json
- Rivers: https://raw.githubusercontent.com/nuuuwan/lk_dmc_vis/main/data/static/rivers.json
- Sri Lanka boundary: Natural Earth / custom GeoJSON
"""

import json
import requests
from datetime import datetime
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.lines import Line2D
import numpy as np


# =============================================================================
# CONSTANTS
# =============================================================================

class FloodStatus(Enum):
    MAJOR_FLOOD = "MAJOR_FLOOD"
    MINOR_FLOOD = "MINOR_FLOOD"
    ALERT = "ALERT"
    NORMAL = "NORMAL"
    NO_DATA = "NO_DATA"


# Color mapping for flood statuses
STATUS_COLORS = {
    FloodStatus.MAJOR_FLOOD: "#d62728",  # Red
    FloodStatus.MINOR_FLOOD: "#ff7f0e",  # Orange
    FloodStatus.ALERT: "#bcbd22",        # Yellow-green
    FloodStatus.NORMAL: "#2ca02c",       # Green
    FloodStatus.NO_DATA: "#b5b5b5",      # Light grey
}

# Data URLs
GAUGING_STATIONS_URL = "https://raw.githubusercontent.com/nuuuwan/lk_dmc_vis/main/data/static/gauging_stations.json"
LOCATIONS_URL = "https://raw.githubusercontent.com/nuuuwan/lk_dmc_vis/main/data/static/locations.json"
RIVERS_URL = "https://raw.githubusercontent.com/nuuuwan/lk_dmc_vis/main/data/static/rivers.json"

# Sri Lanka bounding box (approximate)
SL_BOUNDS = {
    "min_lat": 5.85,
    "max_lat": 9.90,
    "min_lon": 79.50,
    "max_lon": 81.95,
}


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class Location:
    name: str
    lat: float
    lon: float


@dataclass
class GaugingStation:
    name: str
    river_name: str
    lat: float
    lon: float
    alert_level: float
    minor_flood_level: float
    major_flood_level: float
    district_id: str
    status: FloodStatus = FloodStatus.NO_DATA


@dataclass
class River:
    name: str
    basin_name: str
    location_names: List[str]


# =============================================================================
# DATA LOADING
# =============================================================================

def fetch_json(url: str) -> dict:
    """Fetch JSON data from URL."""
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return response.json()


def load_locations() -> Dict[str, Location]:
    """Load location data from remote source."""
    data = fetch_json(LOCATIONS_URL)
    locations = {}
    for item in data:
        lat_lng = item["lat_lng"]
        loc = Location(
            name=item["name"],
            lat=lat_lng[0],
            lon=lat_lng[1]
        )
        locations[loc.name] = loc
    return locations


def load_gauging_stations() -> Dict[str, GaugingStation]:
    """Load gauging station data from remote source."""
    data = fetch_json(GAUGING_STATIONS_URL)
    stations = {}
    for item in data:
        lat_lng = item["lat_lng"]
        station = GaugingStation(
            name=item["name"],
            river_name=item["river_name"],
            lat=lat_lng[0],
            lon=lat_lng[1],
            alert_level=item["alert_level"],
            minor_flood_level=item["minor_flood_level"],
            major_flood_level=item["major_flood_level"],
            district_id=item["district_id"]
        )
        stations[station.name] = station
    return stations


def load_rivers() -> List[River]:
    """Load river data from remote source."""
    data = fetch_json(RIVERS_URL)
    rivers = []
    for item in data:
        river = River(
            name=item["name"],
            basin_name=item["river_basin_name"],
            location_names=item["location_names"]
        )
        rivers.append(river)
    return rivers


# =============================================================================
# STATUS ASSIGNMENT
# =============================================================================

def apply_flood_statuses(
    stations: Dict[str, GaugingStation],
    status_dict: Dict[str, str]
) -> Dict[str, GaugingStation]:
    """Apply flood statuses to gauging stations."""
    for station_name, status_str in status_dict.items():
        if station_name in stations:
            try:
                stations[station_name].status = FloodStatus(status_str)
            except ValueError:
                print(f"Warning: Unknown status '{status_str}' for station '{station_name}'")
    return stations


def get_segment_status(
    loc1_name: str,
    loc2_name: str,
    stations: Dict[str, GaugingStation]
) -> FloodStatus:
    """
    Get the status for a river segment between two locations.
    Uses the maximum (worst) status of the two connected points.
    """
    status1 = stations.get(loc1_name, GaugingStation("", "", 0, 0, 0, 0, 0, "")).status
    status2 = stations.get(loc2_name, GaugingStation("", "", 0, 0, 0, 0, 0, "")).status

    # Priority order (worst first)
    priority = [
        FloodStatus.MAJOR_FLOOD,
        FloodStatus.MINOR_FLOOD,
        FloodStatus.ALERT,
        FloodStatus.NORMAL,
        FloodStatus.NO_DATA,
    ]

    for status in priority:
        if status1 == status or status2 == status:
            return status

    return FloodStatus.NO_DATA


# =============================================================================
# SRI LANKA BOUNDARY
# =============================================================================

def get_sri_lanka_boundary() -> List[Tuple[float, float]]:
    """
    Return simplified Sri Lanka boundary coordinates.
    This is a simplified polygon outline of Sri Lanka.
    """
    # Simplified Sri Lanka boundary (lon, lat pairs)
    boundary = [
        (79.6951, 9.8217),
        (80.0972, 9.8247),
        (80.2544, 9.7955),
        (80.4244, 9.6388),
        (80.5817, 9.4750),
        (80.7458, 9.2186),
        (80.8500, 9.0294),
        (80.9228, 8.8186),
        (81.0550, 8.5775),
        (81.1769, 8.3472),
        (81.2275, 8.2281),
        (81.3214, 8.0247),
        (81.4017, 7.8400),
        (81.4672, 7.6544),
        (81.5619, 7.4622),
        (81.6328, 7.2956),
        (81.6858, 7.1217),
        (81.7239, 6.9403),
        (81.7289, 6.7553),
        (81.7083, 6.5683),
        (81.6431, 6.4011),
        (81.5500, 6.2283),
        (81.4139, 6.0728),
        (81.2506, 5.9647),
        (81.0594, 5.9383),
        (80.8586, 5.9439),
        (80.6536, 5.9778),
        (80.4586, 6.0356),
        (80.2650, 6.0833),
        (80.0867, 6.1356),
        (79.9339, 6.2169),
        (79.8311, 6.3414),
        (79.7522, 6.5011),
        (79.7028, 6.6800),
        (79.6875, 6.8661),
        (79.6903, 7.0519),
        (79.7067, 7.2422),
        (79.7050, 7.4361),
        (79.6886, 7.6267),
        (79.6975, 7.8192),
        (79.7328, 8.0039),
        (79.7925, 8.1906),
        (79.8308, 8.3767),
        (79.8456, 8.5683),
        (79.8275, 8.7539),
        (79.7847, 8.9356),
        (79.7556, 9.1219),
        (79.7417, 9.3083),
        (79.7175, 9.4906),
        (79.6894, 9.6728),
        (79.6951, 9.8217),  # Close the polygon
    ]
    return boundary


# =============================================================================
# DRAWING FUNCTIONS
# =============================================================================

def draw_sri_lanka_boundary(ax: plt.Axes):
    """Draw the Sri Lanka boundary polygon."""
    boundary = get_sri_lanka_boundary()
    lons = [p[0] for p in boundary]
    lats = [p[1] for p in boundary]

    # Fill
    ax.fill(lons, lats, color="#e8e8e8", zorder=1)
    # Border
    ax.plot(lons, lats, color="#606060", linewidth=0.8, zorder=2)


def draw_rivers(
    ax: plt.Axes,
    rivers: List[River],
    locations: Dict[str, Location],
    stations: Dict[str, GaugingStation]
):
    """Draw river segments connecting locations."""
    for river in rivers:
        loc_names = river.location_names

        for i in range(len(loc_names) - 1):
            loc1_name = loc_names[i]
            loc2_name = loc_names[i + 1]

            # Get coordinates - check both locations and stations
            loc1 = locations.get(loc1_name) or (
                Location(loc1_name, stations[loc1_name].lat, stations[loc1_name].lon)
                if loc1_name in stations else None
            )
            loc2 = locations.get(loc2_name) or (
                Location(loc2_name, stations[loc2_name].lat, stations[loc2_name].lon)
                if loc2_name in stations else None
            )

            if not loc1 or not loc2:
                continue

            # Get segment status
            status = get_segment_status(loc1_name, loc2_name, stations)
            color = STATUS_COLORS[status]

            # Line width based on status
            linewidth = 3 if status in [FloodStatus.MAJOR_FLOOD, FloodStatus.MINOR_FLOOD, FloodStatus.ALERT] else 1.5

            # Draw the segment
            ax.plot(
                [loc1.lon, loc2.lon],
                [loc1.lat, loc2.lat],
                color=color,
                linewidth=linewidth,
                solid_capstyle='round',
                zorder=3
            )


def draw_stations(
    ax: plt.Axes,
    stations: Dict[str, GaugingStation],
    show_labels: bool = True
):
    """Draw gauging station markers and labels."""
    for name, station in stations.items():
        color = STATUS_COLORS[station.status]

        # Draw circle marker
        ax.scatter(
            station.lon,
            station.lat,
            s=50,
            c=color,
            edgecolors='white',
            linewidths=1.5,
            zorder=5
        )

        # Add label
        if show_labels:
            # Offset label slightly to avoid overlap with marker
            ax.annotate(
                name,
                (station.lon, station.lat),
                xytext=(5, 5),
                textcoords='offset points',
                fontsize=6,
                color='#333333',
                zorder=6
            )


def add_legend(ax: plt.Axes):
    """Add legend showing flood status colors."""
    legend_elements = [
        mpatches.Patch(facecolor=STATUS_COLORS[FloodStatus.MAJOR_FLOOD],
                       edgecolor='white', label='Major Flood'),
        mpatches.Patch(facecolor=STATUS_COLORS[FloodStatus.MINOR_FLOOD],
                       edgecolor='white', label='Minor Flood'),
        mpatches.Patch(facecolor=STATUS_COLORS[FloodStatus.ALERT],
                       edgecolor='white', label='Alert'),
        mpatches.Patch(facecolor=STATUS_COLORS[FloodStatus.NORMAL],
                       edgecolor='white', label='Normal'),
        mpatches.Patch(facecolor=STATUS_COLORS[FloodStatus.NO_DATA],
                       edgecolor='white', label='No Data'),
    ]

    ax.legend(
        handles=legend_elements,
        loc='lower left',
        framealpha=0.9,
        fontsize=8,
        title='Status',
        title_fontsize=9
    )


def add_title_and_timestamp(ax: plt.Axes, timestamp: datetime):
    """Add title and timestamp to the map."""
    ax.set_title(
        "Sri Lanka - Flood Map",
        fontsize=16,
        fontweight='bold',
        pad=20
    )

    # Add timestamp as subtitle
    timestamp_str = timestamp.strftime("%Y-%m-%d %H:%M:%S")
    ax.text(
        0.5, 1.02,
        f"As of {timestamp_str}",
        transform=ax.transAxes,
        ha='center',
        fontsize=10,
        color='#666666'
    )


# =============================================================================
# MAIN MAP GENERATION
# =============================================================================

def generate_flood_map(
    flood_statuses: Optional[Dict[str, str]] = None,
    output_path: str = "flood_map.png",
    show_labels: bool = True,
    dpi: int = 300
) -> str:
    """
    Generate the Sri Lanka flood map.

    Args:
        flood_statuses: Dictionary mapping station names to status strings
                       e.g., {"Hanwella": "MAJOR_FLOOD", "Peradeniya": "NORMAL"}
        output_path: Path to save the output image
        show_labels: Whether to show station name labels
        dpi: Output image DPI

    Returns:
        Path to the saved image
    """
    print("Loading data...")

    # Load data
    locations = load_locations()
    stations = load_gauging_stations()
    rivers = load_rivers()

    print(f"Loaded {len(locations)} locations, {len(stations)} stations, {len(rivers)} rivers")

    # Apply flood statuses
    if flood_statuses:
        stations = apply_flood_statuses(stations, flood_statuses)
        print(f"Applied {len(flood_statuses)} flood statuses")

    # Create figure
    fig, ax = plt.subplots(figsize=(10, 16))

    # Set background
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')

    # Draw elements
    print("Drawing map...")
    draw_sri_lanka_boundary(ax)
    draw_rivers(ax, rivers, locations, stations)
    draw_stations(ax, stations, show_labels=show_labels)

    # Add legend
    add_legend(ax)

    # Add title and timestamp
    add_title_and_timestamp(ax, datetime.now())

    # Set map bounds
    ax.set_xlim(SL_BOUNDS["min_lon"] - 0.1, SL_BOUNDS["max_lon"] + 0.1)
    ax.set_ylim(SL_BOUNDS["min_lat"] - 0.1, SL_BOUNDS["max_lat"] + 0.1)

    # Remove axis ticks
    ax.set_xticks([])
    ax.set_yticks([])

    # Remove axis spines
    for spine in ax.spines.values():
        spine.set_visible(False)

    # Adjust layout
    plt.tight_layout()

    # Save
    print(f"Saving to {output_path}...")
    plt.savefig(output_path, dpi=dpi, bbox_inches='tight', facecolor='white')
    plt.close()

    print(f"Map saved to {output_path}")
    return output_path


# =============================================================================
# EXAMPLE USAGE
# =============================================================================

if __name__ == "__main__":
    # Example flood statuses (dummy data for testing)
    example_statuses = {
        # Kelani Ganga
        "Hanwella": "MAJOR_FLOOD",
        "Glencourse": "MINOR_FLOOD",
        "Nagalagam Street": "ALERT",
        "Kithulgala": "NORMAL",

        # Kalu Ganga
        "Ratnapura": "MINOR_FLOOD",
        "Ellagawa": "ALERT",
        "Putupaula": "NORMAL",

        # Mahaweli Ganga
        "Peradeniya": "NORMAL",
        "Nawalapitiya": "NORMAL",

        # Nilwala Ganga
        "Pitabeddara": "ALERT",
        "Thalgahagoda": "NORMAL",

        # Gin Ganga
        "Thawalama": "NORMAL",
        "Agaliya": "NORMAL",

        # Attanagalu Oya
        "Dunamale": "NORMAL",

        # Others - set to NORMAL
        "Norwood": "NORMAL",
        "Holombuwa": "NORMAL",
        "Deraniyagala": "NORMAL",
        "Ruwanwella": "NORMAL",
        "Kalawellawa": "NORMAL",
        "Millakanda": "NORMAL",
        "Magura": "NORMAL",
        "Panadugama": "NORMAL",
        "Baddegama": "NORMAL",
        "Tawalama": "NORMAL",
        "Kudawa": "NORMAL",
        "Moragaswewa": "NORMAL",
        "Thanthirimale": "NORMAL",
        "Manampitiya": "NORMAL",
        "Weraganthota": "NORMAL",
    }

    # Generate the map
    generate_flood_map(
        flood_statuses=example_statuses,
        output_path="flood_map.png",
        show_labels=True,
        dpi=300
    )
