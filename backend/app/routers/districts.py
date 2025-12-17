# SPDX-License-Identifier: Apache-2.0

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime, timedelta
import json
import os
import logging

from ..database import get_db
from ..models import WeatherLog
from ..schemas import DistrictInfo
from ..config import get_settings, get_region_config

router = APIRouter(prefix="/api/districts", tags=["districts"])

settings = get_settings()
region_config = get_region_config()
logger = logging.getLogger(__name__)


def load_districts(region_id: str = "srilanka") -> dict:
    """
    Load district data from JSON file for specified region.

    Args:
        region_id: Region identifier ('srilanka', 'south_india', etc.)

    Returns:
        Dictionary with districts list
    """
    # Map regions to their data files
    region_files = {
        "srilanka": "districts.json",
        "south_india": "south_india_districts.json",
    }

    filename = region_files.get(region_id)
    if not filename:
        logger.warning(f"Unknown region: {region_id}, defaulting to srilanka")
        filename = "districts.json"

    data_path = os.path.join(os.path.dirname(__file__), "..", "data", filename)

    if not os.path.exists(data_path):
        logger.error(f"District data file not found: {data_path}")
        raise HTTPException(status_code=500, detail=f"District data for region {region_id} not found")

    try:
        with open(data_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading district data: {e}")
        raise HTTPException(status_code=500, detail="Error loading district data")


def get_alert_level(rainfall_mm: float, region_id: str = "srilanka") -> str:
    """
    Determine alert level based on rainfall and region-specific thresholds.

    Args:
        rainfall_mm: 24-hour rainfall in millimeters
        region_id: Region identifier for threshold lookup

    Returns:
        Alert level: 'green', 'yellow', 'orange', or 'red'
    """
    alert_level = region_config.get_alert_threshold(region_id, rainfall_mm)

    # Map internal threshold names to alert levels
    level_map = {
        "green": "green",
        "yellow": "yellow",
        "orange": "orange",
        "red": "red",
    }

    return level_map.get(alert_level, "green")


@router.get("", response_model=list[DistrictInfo])
async def get_districts(
    db: Session = Depends(get_db),
    region: str = Query("srilanka", description="Region ID (srilanka, south_india)")
):
    """
    Get list of all monitored districts with their current status.

    Parameters:
    - region: Which region to fetch districts for (default: srilanka)

    Returns:
    - List of districts with current alert levels
    """
    # Validate region
    if not region_config.get_region(region):
        raise HTTPException(status_code=400, detail=f"Invalid region: {region}")

    try:
        district_data = load_districts(region)
    except HTTPException:
        raise

    result = []

    for district in district_data["districts"]:
        # Get latest weather log for this district
        latest_log = db.query(WeatherLog).filter(
            WeatherLog.district == district["name"],
            WeatherLog.recorded_at >= datetime.utcnow() - timedelta(hours=24)
        ).order_by(WeatherLog.recorded_at.desc()).first()

        rainfall = float(latest_log.rainfall_mm) if latest_log and latest_log.rainfall_mm else 0.0

        result.append(DistrictInfo(
            name=district["name"],
            latitude=district["latitude"],
            longitude=district["longitude"],
            current_alert_level=get_alert_level(rainfall, region),
            rainfall_24h_mm=rainfall
        ))

    return result


@router.get("/{district_name}", response_model=DistrictInfo)
async def get_district(
    district_name: str,
    db: Session = Depends(get_db),
    region: str = Query("srilanka", description="Region ID (srilanka, south_india)")
):
    """
    Get information for a specific district.

    Parameters:
    - district_name: Name of the district
    - region: Which region to search in (default: srilanka)
    """
    # Validate region
    if not region_config.get_region(region):
        raise HTTPException(status_code=400, detail=f"Invalid region: {region}")

    try:
        district_data = load_districts(region)
    except HTTPException:
        raise

    district = next(
        (d for d in district_data["districts"] if d["name"].lower() == district_name.lower()),
        None
    )

    if not district:
        raise HTTPException(
            status_code=404,
            detail=f"District '{district_name}' not found in region '{region}'"
        )

    # Get latest weather log
    latest_log = db.query(WeatherLog).filter(
        WeatherLog.district == district["name"],
        WeatherLog.recorded_at >= datetime.utcnow() - timedelta(hours=24)
    ).order_by(WeatherLog.recorded_at.desc()).first()

    rainfall = float(latest_log.rainfall_mm) if latest_log and latest_log.rainfall_mm else 0.0

    return DistrictInfo(
        name=district["name"],
        latitude=district["latitude"],
        longitude=district["longitude"],
        current_alert_level=get_alert_level(rainfall, region),
        rainfall_24h_mm=rainfall
    )
