# SPDX-License-Identifier: Apache-2.0

"""
Rivers API Router
Provides river and station data with current water levels
Uses provider pattern for multi-region support
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import River, Station, WaterReading
from ..schemas import RiverWithStations
from ..services.river_service import get_river_data_service
from ..services.river_provider import BoundingBox

router = APIRouter(prefix="/api", tags=["rivers"])


@router.get("/rivers", response_model=list[RiverWithStations])
async def get_all_rivers(
    db: Session = Depends(get_db),
    region: str = Query("srilanka", description="Region ID (srilanka, south_india)")
):
    """
    Get all rivers with their stations and current water levels.
    Now supports multi-region queries using provider pattern.

    Parameters:
    - region: Which region to fetch rivers for (default: srilanka)
    """
    rivers = db.query(River).options(
        joinedload(River.stations).joinedload(Station.current_reading)
    ).all()

    # Get the latest reading for each station manually since viewonly relationships
    # don't always work as expected
    for river in rivers:
        for station in river.stations:
            latest_reading = db.query(WaterReading).filter(
                WaterReading.station_id == station.id
            ).order_by(WaterReading.recorded_at.desc()).first()
            station.current_reading = latest_reading

    return rivers


@router.get("/rivers/by-region/{region_id}")
async def get_rivers_by_region(region_id: str):
    """
    Get river stations for a specific region using provider pattern.
    Returns live data from regional data sources.

    Parameters:
    - region_id: Region identifier (srilanka, south_india, etc.)

    Returns:
    - List of stations with current water levels
    """
    service = get_river_data_service()

    # Check if region is valid
    if not await service.validate_region(region_id):
        return {
            "error": f"Region '{region_id}' not found or no providers available",
            "status": "error",
            "stations": []
        }

    # Fetch stations from providers
    stations = await service.fetch_stations_by_region(region_id)

    return {
        "region": region_id,
        "total_stations": len(stations),
        "stations": [
            {
                "station_id": s.station_id,
                "river_name": s.river_name,
                "river_code": s.river_code,
                "station_name": s.station_name,
                "latitude": s.latitude,
                "longitude": s.longitude,
                "water_level_m": s.water_level_m,
                "water_level_previous_m": s.water_level_previous_m,
                "rainfall_24h_mm": s.rainfall_24h_mm,
                "status": s.status,
                "last_updated": s.last_updated.isoformat(),
                "catchment_area_km2": s.catchment_area_km2,
            }
            for s in stations
        ],
        "status": "success"
    }


@router.get("/rivers/by-bounds")
async def get_rivers_by_bounds(
    min_lat: float = Query(..., description="Minimum latitude"),
    max_lat: float = Query(..., description="Maximum latitude"),
    min_lon: float = Query(..., description="Minimum longitude"),
    max_lon: float = Query(..., description="Maximum longitude"),
):
    """
    Get river stations within a geographic bounding box.
    Automatically selects appropriate providers based on region coverage.

    Parameters:
    - min_lat, max_lat, min_lon, max_lon: Bounding box coordinates

    Returns:
    - List of stations within the bounds
    """
    service = get_river_data_service()

    bounds = BoundingBox(
        min_lat=min_lat,
        max_lat=max_lat,
        min_lon=min_lon,
        max_lon=max_lon
    )

    stations = await service.fetch_stations_by_bounds(bounds)

    return {
        "bounds": {
            "min_lat": min_lat,
            "max_lat": max_lat,
            "min_lon": min_lon,
            "max_lon": max_lon,
        },
        "total_stations": len(stations),
        "stations": [
            {
                "station_id": s.station_id,
                "river_name": s.river_name,
                "station_name": s.station_name,
                "latitude": s.latitude,
                "longitude": s.longitude,
                "water_level_m": s.water_level_m,
                "status": s.status,
                "region": s.region_id,
                "last_updated": s.last_updated.isoformat(),
            }
            for s in stations
        ],
        "status": "success"
    }


@router.get("/rivers/providers/status")
async def get_provider_status():
    """
    Get health status of all river data providers.
    Useful for monitoring and debugging.

    Returns:
    - Status of each provider (connected/disconnected)
    """
    from ..services.river_provider_factory import get_river_provider_factory

    factory = get_river_provider_factory()
    provider_status = await factory.test_all_providers()

    return {
        "providers": provider_status,
        "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
        "available_providers": factory.list_providers(),
    }


@router.get("/rivers/region-status/{region_id}")
async def get_region_provider_status(region_id: str):
    """
    Get detailed provider status for a specific region.

    Parameters:
    - region_id: Region identifier (srilanka, south_india, etc.)

    Returns:
    - Status of each provider in the region
    """
    service = get_river_data_service()
    status = await service.get_region_status(region_id)

    return {
        "region": region_id,
        "provider_status": status,
        "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
    }
