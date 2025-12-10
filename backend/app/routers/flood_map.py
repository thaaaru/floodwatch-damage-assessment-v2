# SPDX-License-Identifier: Apache-2.0

"""
Flood Map API Router
Generates and serves flood map images
"""
from fastapi import APIRouter, Query, Response
from fastapi.responses import StreamingResponse
from typing import Optional
import io
import logging

from ..services.flood_map_generator import flood_map_generator
from ..services.irrigation_fetcher import irrigation_fetcher

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/flood-map", tags=["flood-map"])


@router.get("/image")
async def get_flood_map_image(
    show_labels: bool = Query(True, description="Show station labels"),
    dpi: int = Query(150, ge=72, le=300, description="Image DPI (72-300)"),
    use_live_data: bool = Query(True, description="Use live irrigation data"),
):
    """
    Generate and return a flood map image.

    Returns a PNG image of Sri Lanka with flood status visualization.
    Uses live data from the Irrigation Department when available.
    """
    try:
        # Get live flood statuses from irrigation data
        flood_statuses = {}

        if use_live_data:
            try:
                irrigation_data = await irrigation_fetcher.fetch_data()
                if irrigation_data and "stations" in irrigation_data:
                    for station in irrigation_data["stations"]:
                        station_name = station.get("station", "")
                        status = station.get("status", "normal")
                        if station_name:
                            flood_statuses[station_name] = status
                    logger.info(f"Loaded {len(flood_statuses)} station statuses from irrigation data")
            except Exception as e:
                logger.warning(f"Failed to load live irrigation data: {e}")

        # Generate the map
        image_bytes = flood_map_generator.generate_map(
            flood_statuses=flood_statuses,
            show_labels=show_labels,
            dpi=dpi
        )

        return Response(
            content=image_bytes,
            media_type="image/png",
            headers={
                "Cache-Control": "public, max-age=300",  # Cache for 5 minutes
                "Content-Disposition": "inline; filename=flood_map.png"
            }
        )

    except Exception as e:
        logger.error(f"Failed to generate flood map: {e}")
        raise


@router.get("/data")
async def get_flood_map_data():
    """
    Get the raw data used for the flood map.

    Returns station locations, statuses, and river connections.
    Useful for client-side rendering.
    """
    try:
        # Load static data
        from ..services.flood_map_generator import (
            load_locations, load_gauging_stations, load_rivers
        )

        locations = load_locations()
        stations = load_gauging_stations()
        rivers = load_rivers()

        # Get live statuses
        flood_statuses = {}
        try:
            irrigation_data = await irrigation_fetcher.fetch_data()
            if irrigation_data and "stations" in irrigation_data:
                for station in irrigation_data["stations"]:
                    station_name = station.get("station", "")
                    status = station.get("status", "normal")
                    water_level = station.get("water_level_m", 0)
                    major_flood_level = station.get("major_flood_level_m", 0)
                    pct_to_flood = station.get("pct_to_major_flood", 0)

                    if station_name:
                        flood_statuses[station_name] = {
                            "status": status,
                            "water_level_m": water_level,
                            "major_flood_level_m": major_flood_level,
                            "pct_to_major_flood": pct_to_flood,
                        }
        except Exception as e:
            logger.warning(f"Failed to load live irrigation data: {e}")

        return {
            "locations": [
                {"name": loc.name, "lat": loc.lat, "lon": loc.lon}
                for loc in locations.values()
            ],
            "stations": [
                {
                    "name": s.name,
                    "river_name": s.river_name,
                    "lat": s.lat,
                    "lon": s.lon,
                    "alert_level": s.alert_level,
                    "minor_flood_level": s.minor_flood_level,
                    "major_flood_level": s.major_flood_level,
                    "district_id": s.district_id,
                    "live_data": flood_statuses.get(s.name),
                }
                for s in stations.values()
            ],
            "rivers": [
                {
                    "name": r.name,
                    "basin_name": r.basin_name,
                    "location_names": r.location_names,
                }
                for r in rivers
            ],
            "flood_statuses": flood_statuses,
        }

    except Exception as e:
        logger.error(f"Failed to get flood map data: {e}")
        raise
