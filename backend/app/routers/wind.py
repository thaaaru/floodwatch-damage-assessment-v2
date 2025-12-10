# SPDX-License-Identifier: Apache-2.0

"""
Wind Data API Router
Provides endpoints for wind visualization data from GFS model.
Includes tile serving, point forecasts, and metadata.
"""
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from typing import Optional
import logging
from datetime import datetime

from ..services.wind_pipeline import (
    get_available_runs,
    get_wind_data,
    generate_all_forecast_hours,
    get_latest_gfs_run,
    SRI_LANKA_BOUNDS,
    REGIONAL_BOUNDS,
    tile_cache,
    interpolate_wind_to_tile,
    get_open_meteo_point_forecast
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/wind", tags=["wind"])


@router.get("/meta")
async def get_wind_metadata():
    """
    Get available model runs and forecast hours.
    Returns metadata about what wind data is available.
    """
    runs = get_available_runs()

    if not runs:
        # Generate data for current run if none exists
        try:
            run_date, run_hour = get_latest_gfs_run()
            logger.info(f"No wind data found, generating for {run_date}/{run_hour}")
            generate_all_forecast_hours(
                run_date=run_date,
                run_hour=run_hour,
                max_hours=120,
                step=3,
                bounds=SRI_LANKA_BOUNDS
            )
            runs = get_available_runs()
        except Exception as e:
            logger.error(f"Failed to generate initial wind data: {e}")

    # Get latest run
    latest_run = runs[0] if runs else None

    return {
        "available_runs": runs,
        "latest_run": latest_run,
        "bounds": {
            "sri_lanka": SRI_LANKA_BOUNDS,
            "regional": REGIONAL_BOUNDS
        },
        "generated_at": datetime.utcnow().isoformat()
    }


@router.get("/latest")
async def get_latest_wind_data(
    forecast_hour: int = Query(0, ge=0, le=240, description="Forecast hour")
):
    """
    Get wind data for the latest model run at specified forecast hour.
    Returns full grid data for visualization.
    """
    runs = get_available_runs()

    if not runs:
        # Try to generate data
        try:
            run_date, run_hour = get_latest_gfs_run()
            generate_all_forecast_hours(
                run_date=run_date,
                run_hour=run_hour,
                max_hours=max(120, forecast_hour),
                step=3,
                bounds=SRI_LANKA_BOUNDS
            )
            runs = get_available_runs()
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Failed to generate wind data: {e}")

    if not runs:
        raise HTTPException(status_code=404, detail="No wind data available")

    latest = runs[0]

    # Find nearest available forecast hour
    available_hours = latest.get("forecast_hours", [])
    if forecast_hour not in available_hours:
        # Find nearest
        if available_hours:
            forecast_hour = min(available_hours, key=lambda x: abs(x - forecast_hour))
        else:
            forecast_hour = 0

    data = get_wind_data(latest["run_date"], latest["run_hour"], forecast_hour)

    if not data:
        raise HTTPException(status_code=404, detail=f"Wind data not found for f{forecast_hour:03d}")

    return data


@router.get("/tiles/{run}/{hour}/{z}/{x}/{y}")
async def get_wind_tile(
    run: str,
    hour: int,
    z: int,
    x: int,
    y: int,
    format: str = Query("json", enum=["json", "binary"])
):
    """
    Get wind data tile for visualization.

    - run: Model run identifier (YYYYMMDD_HH)
    - hour: Forecast hour
    - z: Zoom level (2-8)
    - x: Tile X coordinate
    - y: Tile Y coordinate
    - format: Response format (json or binary)
    """
    # Validate zoom
    if z < 2 or z > 8:
        raise HTTPException(status_code=400, detail="Zoom must be between 2 and 8")

    # Check cache first
    cached = tile_cache.get(run, hour, z, x, y)
    if cached:
        return cached

    # Parse run identifier
    try:
        parts = run.split("_")
        run_date, run_hour = parts[0], parts[1]
    except (IndexError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid run format. Use YYYYMMDD_HH")

    # Get base wind data
    wind_data = get_wind_data(run_date, run_hour, hour)

    if not wind_data:
        # Try to generate
        try:
            generate_all_forecast_hours(
                run_date=run_date,
                run_hour=run_hour,
                max_hours=max(120, hour),
                step=3,
                bounds=SRI_LANKA_BOUNDS
            )
            wind_data = get_wind_data(run_date, run_hour, hour)
        except Exception as e:
            logger.error(f"Failed to generate wind data: {e}")

    if not wind_data:
        raise HTTPException(status_code=404, detail="Wind data not available for this run/hour")

    # Interpolate to tile
    tile_data = interpolate_wind_to_tile(wind_data, x, y, z)

    if not tile_data:
        raise HTTPException(status_code=500, detail="Failed to generate tile")

    # Cache it
    tile_cache.put(run, hour, z, x, y, tile_data)

    if format == "binary":
        from ..services.wind_pipeline.tile_generator import create_binary_tile
        binary_data = create_binary_tile(tile_data)
        return Response(
            content=binary_data,
            media_type="application/octet-stream",
            headers={"Cache-Control": "public, max-age=3600"}
        )

    return tile_data


@router.get("/point")
async def get_point_forecast(
    lat: float = Query(..., ge=-90, le=90, description="Latitude"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude"),
    source: str = Query("open-meteo", enum=["open-meteo", "gfs"])
):
    """
    Get wind forecast for a specific point.
    Fallback for when gridded data unavailable or for detailed point queries.

    - lat: Latitude
    - lon: Longitude
    - source: Data source (open-meteo for hourly forecast, gfs for current run)
    """
    if source == "open-meteo":
        data = get_open_meteo_point_forecast(lat, lon)
        if data:
            return data
        raise HTTPException(status_code=503, detail="Failed to fetch Open-Meteo data")

    elif source == "gfs":
        # Interpolate from GFS grid
        runs = get_available_runs()
        if not runs:
            raise HTTPException(status_code=404, detail="No GFS data available")

        latest = runs[0]
        wind_data = get_wind_data(latest["run_date"], latest["run_hour"], 0)

        if not wind_data:
            raise HTTPException(status_code=404, detail="GFS data not loaded")

        # Simple nearest-neighbor lookup
        import numpy as np
        lons = np.array(wind_data["lon"])
        lats = np.array(wind_data["lat"])

        lon_idx = np.abs(lons - lon).argmin()
        lat_idx = np.abs(lats - lat).argmin()

        u = wind_data["u"][lat_idx][lon_idx]
        v = wind_data["v"][lat_idx][lon_idx]
        speed = np.sqrt(u ** 2 + v ** 2)
        direction = (np.degrees(np.arctan2(-u, -v)) + 360) % 360

        return {
            "latitude": lat,
            "longitude": lon,
            "wind_speed_10m": float(speed),
            "wind_direction_10m": float(direction),
            "u_component": float(u),
            "v_component": float(v),
            "source": "gfs",
            "run_date": latest["run_date"],
            "run_hour": latest["run_hour"]
        }


@router.get("/{run_date}/{run_hour}/{forecast_hour}")
async def get_specific_wind_data(
    run_date: str,
    run_hour: str,
    forecast_hour: int
):
    """
    Get wind data for a specific model run and forecast hour.

    - run_date: Model run date (YYYYMMDD)
    - run_hour: Model run hour (00/06/12/18)
    - forecast_hour: Forecast hour (0-240)
    """
    # Validate inputs
    try:
        datetime.strptime(run_date, "%Y%m%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYYMMDD")

    if run_hour not in ["00", "06", "12", "18"]:
        raise HTTPException(status_code=400, detail="Invalid run hour. Use 00, 06, 12, or 18")

    if forecast_hour < 0 or forecast_hour > 240:
        raise HTTPException(status_code=400, detail="Forecast hour must be 0-240")

    data = get_wind_data(run_date, run_hour, forecast_hour)

    if not data:
        # Try to generate the data
        try:
            generate_all_forecast_hours(
                run_date=run_date,
                run_hour=run_hour,
                max_hours=max(120, forecast_hour),
                step=3,
                bounds=SRI_LANKA_BOUNDS
            )
            data = get_wind_data(run_date, run_hour, forecast_hour)
        except Exception as e:
            logger.error(f"Failed to generate wind data: {e}")

    if not data:
        raise HTTPException(
            status_code=404,
            detail=f"Wind data not found for {run_date}/{run_hour} f{forecast_hour:03d}"
        )

    return data


@router.post("/refresh")
async def refresh_wind_data(
    max_hours: int = Query(120, ge=0, le=240),
    step: int = Query(3, ge=1, le=24),
    region: str = Query("srilanka", enum=["srilanka", "regional"])
):
    """
    Force refresh of wind data from latest GFS run.
    """
    bounds = SRI_LANKA_BOUNDS if region == "srilanka" else REGIONAL_BOUNDS

    try:
        run_date, run_hour = get_latest_gfs_run()
        files = generate_all_forecast_hours(
            run_date=run_date,
            run_hour=run_hour,
            max_hours=max_hours,
            step=step,
            bounds=bounds
        )

        # Clear tile cache
        tile_cache.clear()

        return {
            "status": "success",
            "run_date": run_date,
            "run_hour": run_hour,
            "files_generated": len(files),
            "forecast_hours": list(range(0, max_hours + 1, step)),
            "region": region
        }

    except Exception as e:
        logger.error(f"Failed to refresh wind data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/forecast-hours")
async def get_forecast_hours():
    """
    Get list of available forecast hours for the latest run.
    """
    runs = get_available_runs()

    if not runs:
        return {"hours": [], "run": None}

    latest = runs[0]
    return {
        "hours": latest.get("forecast_hours", []),
        "run": {
            "date": latest.get("run_date"),
            "hour": latest.get("run_hour")
        }
    }
