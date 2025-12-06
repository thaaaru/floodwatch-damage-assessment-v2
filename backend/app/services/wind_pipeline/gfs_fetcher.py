"""
GFS GRIB2 Data Fetcher
Downloads real GFS wind data from NOAA NOMADS and processes with xarray/cfgrib.
"""
import os
import io
import logging
import tempfile
from datetime import datetime, timedelta
from typing import Optional, Dict, Tuple, List
import httpx
import numpy as np

logger = logging.getLogger(__name__)

# NOAA NOMADS endpoints
NOMADS_FILTER_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
NOMADS_DIRECT_URL = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod"

# Alternative sources
AWS_NOAA_URL = "https://noaa-gfs-bdp-pds.s3.amazonaws.com"

# Timeout for downloads
DOWNLOAD_TIMEOUT = 120.0


def get_available_gfs_runs(hours_back: int = 24) -> List[Tuple[str, str]]:
    """
    Check which GFS runs are available on NOMADS.
    Returns list of (date_str, hour_str) tuples.
    """
    available = []
    now = datetime.utcnow()

    # Check last several runs
    for hours_ago in range(0, hours_back, 6):
        check_time = now - timedelta(hours=hours_ago + 4)  # GFS available ~4h after run
        run_hour = (check_time.hour // 6) * 6
        run_time = check_time.replace(hour=run_hour, minute=0, second=0, microsecond=0)

        date_str = run_time.strftime("%Y%m%d")
        hour_str = f"{run_hour:02d}"

        # Quick check if this run exists
        try:
            url = f"{NOMADS_DIRECT_URL}/gfs.{date_str}/{hour_str}/atmos/"
            with httpx.Client(timeout=10.0) as client:
                resp = client.head(url)
                if resp.status_code == 200:
                    available.append((date_str, hour_str))
        except Exception:
            pass

    return available


def download_gfs_grib2(
    date_str: str,
    run_hour: str,
    forecast_hour: int,
    bounds: Dict,
    variables: List[str] = None
) -> Optional[bytes]:
    """
    Download GFS GRIB2 data from NOAA NOMADS filter service.

    Args:
        date_str: Run date (YYYYMMDD)
        run_hour: Run hour (00/06/12/18)
        forecast_hour: Forecast hour (0-384)
        bounds: Dict with lat_min, lat_max, lon_min, lon_max
        variables: List of variables to download (default: UGRD, VGRD at 10m)

    Returns:
        GRIB2 file contents as bytes, or None on failure
    """
    if variables is None:
        variables = ["UGRD", "VGRD"]

    # Build filter URL parameters
    params = {
        "file": f"gfs.t{run_hour}z.pgrb2.0p25.f{forecast_hour:03d}",
        "lev_10_m_above_ground": "on",
        "subregion": "",
        "leftlon": str(bounds.get("lon_min", 0)),
        "rightlon": str(bounds.get("lon_max", 360)),
        "toplat": str(bounds.get("lat_max", 90)),
        "bottomlat": str(bounds.get("lat_min", -90)),
        "dir": f"/gfs.{date_str}/{run_hour}/atmos"
    }

    # Add requested variables
    for var in variables:
        params[f"var_{var}"] = "on"

    try:
        logger.info(f"Downloading GFS data: {date_str}/{run_hour} f{forecast_hour:03d}")

        with httpx.Client(timeout=DOWNLOAD_TIMEOUT) as client:
            response = client.get(NOMADS_FILTER_URL, params=params)

            if response.status_code == 200:
                content = response.content
                if len(content) > 1000:  # Valid GRIB2 should be larger
                    logger.info(f"Downloaded {len(content)} bytes of GRIB2 data")
                    return content
                else:
                    logger.warning(f"Downloaded file too small ({len(content)} bytes), may be error page")
                    return None
            else:
                logger.error(f"NOMADS returned status {response.status_code}")
                return None

    except httpx.TimeoutException:
        logger.error("Download timed out")
        return None
    except Exception as e:
        logger.error(f"Download failed: {e}")
        return None


def decode_grib2_wind(grib_data: bytes) -> Optional[Dict]:
    """
    Decode GRIB2 data and extract U/V wind components.

    Returns dict with:
        - lon: 1D array of longitudes
        - lat: 1D array of latitudes
        - u: 2D array of U component (m/s)
        - v: 2D array of V component (m/s)
    """
    try:
        import xarray as xr
        import cfgrib

        # Write to temp file (cfgrib needs file path)
        with tempfile.NamedTemporaryFile(suffix='.grib2', delete=False) as f:
            f.write(grib_data)
            temp_path = f.name

        try:
            # Open with cfgrib
            datasets = cfgrib.open_datasets(temp_path)

            u_data = None
            v_data = None
            lats = None
            lons = None

            for ds in datasets:
                if 'u10' in ds.data_vars:
                    u_data = ds['u10'].values
                    lats = ds['latitude'].values
                    lons = ds['longitude'].values
                elif 'v10' in ds.data_vars:
                    v_data = ds['v10'].values
                    if lats is None:
                        lats = ds['latitude'].values
                        lons = ds['longitude'].values

            if u_data is None or v_data is None:
                logger.error("Could not find u10/v10 in GRIB2 data")
                return None

            # Handle longitude wrapping (0-360 to -180-180 if needed)
            if np.max(lons) > 180:
                # Keep as 0-360 for now
                pass

            return {
                "lon": lons.tolist() if hasattr(lons, 'tolist') else list(lons),
                "lat": lats.tolist() if hasattr(lats, 'tolist') else list(lats),
                "u": u_data.tolist() if hasattr(u_data, 'tolist') else [list(row) for row in u_data],
                "v": v_data.tolist() if hasattr(v_data, 'tolist') else [list(row) for row in v_data]
            }

        finally:
            os.unlink(temp_path)

    except ImportError:
        logger.warning("cfgrib not available - cannot decode GRIB2")
        return None
    except Exception as e:
        logger.error(f"Failed to decode GRIB2: {e}")
        return None


def fetch_and_process_gfs(
    date_str: str,
    run_hour: str,
    forecast_hour: int,
    bounds: Dict
) -> Optional[Dict]:
    """
    Download and process GFS wind data.
    Falls back to synthetic data if real data unavailable.
    """
    # Try to download real data
    grib_data = download_gfs_grib2(date_str, run_hour, forecast_hour, bounds)

    if grib_data:
        wind_data = decode_grib2_wind(grib_data)
        if wind_data:
            return wind_data

    logger.info("Using synthetic wind data as fallback")
    return None


def get_open_meteo_point_forecast(lat: float, lon: float) -> Optional[Dict]:
    """
    Get wind forecast for a specific point from Open-Meteo API.
    Used as fallback when gridded data unavailable.

    Returns:
        Dict with hourly wind_speed_10m, wind_direction_10m, time
    """
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
        "forecast_days": 7,
        "timezone": "UTC"
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)

            if response.status_code == 200:
                data = response.json()
                return {
                    "latitude": lat,
                    "longitude": lon,
                    "time": data["hourly"]["time"],
                    "wind_speed_10m": data["hourly"]["wind_speed_10m"],
                    "wind_direction_10m": data["hourly"]["wind_direction_10m"],
                    "wind_gusts_10m": data["hourly"].get("wind_gusts_10m"),
                    "source": "open-meteo"
                }
            else:
                logger.error(f"Open-Meteo returned status {response.status_code}")
                return None

    except Exception as e:
        logger.error(f"Open-Meteo request failed: {e}")
        return None
