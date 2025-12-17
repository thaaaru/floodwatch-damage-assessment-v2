# SPDX-License-Identifier: Apache-2.0

"""
River Data Provider Pattern
Abstraction layer for fetching river water level data from different sources.
Supports multiple regional river monitoring systems (Sri Lanka Navy, India CWC, state APIs, etc.)
"""

from abc import ABC, abstractmethod
from typing import Optional, List
from dataclasses import dataclass
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


@dataclass
class BoundingBox:
    """Geographic bounding box for region queries"""
    min_lat: float
    max_lat: float
    min_lon: float
    max_lon: float

    def contains_point(self, lat: float, lon: float) -> bool:
        """Check if point is within bounding box"""
        return (self.min_lat <= lat <= self.max_lat and
                self.min_lon <= lon <= self.max_lon)


@dataclass
class RiverStationData:
    """Standard river station data structure"""
    station_id: str  # Unique identifier
    river_name: str
    river_code: Optional[str]
    station_name: str
    latitude: float
    longitude: float
    catchment_area_km2: Optional[float]
    water_level_m: float
    water_level_previous_m: Optional[float]
    rainfall_24h_mm: Optional[float]
    status: str  # normal, alert, rising, falling, minor_flood, major_flood
    last_updated: datetime
    region_id: str  # Region this station belongs to


@dataclass
class WaterReading:
    """Single water level reading"""
    station_id: str
    water_level_m: float
    rainfall_mm: Optional[float]
    status: str
    timestamp: datetime


class RiverProvider(ABC):
    """Abstract base class for river data providers"""

    @abstractmethod
    async def fetch_stations(self, bounds: Optional[BoundingBox] = None) -> List[RiverStationData]:
        """
        Fetch all river stations, optionally filtered by bounding box.

        Args:
            bounds: Optional geographic bounding box to filter results

        Returns:
            List of RiverStationData objects
        """
        pass

    @abstractmethod
    async def fetch_station_reading(self, station_id: str) -> Optional[WaterReading]:
        """
        Fetch current water level reading for a specific station.

        Args:
            station_id: Unique station identifier

        Returns:
            Current WaterReading or None if not found
        """
        pass

    @abstractmethod
    async def fetch_readings_history(self, station_id: str, hours: int = 24) -> List[WaterReading]:
        """
        Fetch historical water level readings for a station.

        Args:
            station_id: Unique station identifier
            hours: Number of hours of history to fetch (default 24)

        Returns:
            List of WaterReading objects, ordered by timestamp ascending
        """
        pass

    def get_alert_status(self, water_level: float, station_data: RiverStationData) -> str:
        """
        Determine alert status based on water level and station thresholds.

        Args:
            water_level: Current water level in meters
            station_data: Station data with threshold information

        Returns:
            Alert status: 'normal', 'alert', 'minor_flood', 'major_flood'
        """
        # Default implementation - can be overridden by subclasses
        return "normal"

    @abstractmethod
    async def test_connection(self) -> bool:
        """
        Test if provider can connect to data source.

        Returns:
            True if connection successful, False otherwise
        """
        pass


class SriLankaNorthRiverProvider(RiverProvider):
    """
    Provider for Sri Lanka Navy flood monitoring system
    Fetches water level data from Navy's WLRS (Water Level Recording System)
    """

    def __init__(self):
        self.base_url = "https://floodms.navy.lk/wlrs/api/"
        self.region_id = "srilanka"
        # Import the existing RiverFetcher
        from .river_fetcher import river_fetcher as existing_fetcher
        self.fetcher = existing_fetcher

    async def fetch_stations(self, bounds: Optional[BoundingBox] = None) -> List[RiverStationData]:
        """Fetch all Sri Lankan river stations"""
        try:
            # Use existing fetcher to get data
            raw_data = await self.fetcher.fetch_river_levels()

            stations = []
            for item in raw_data:
                # Check if station is within bounds if provided
                if bounds and not bounds.contains_point(item['lat'], item['lon']):
                    continue

                station = RiverStationData(
                    station_id=f"srilanka_{item['river_code']}_{item['station']}",
                    river_name=item['river'],
                    river_code=item['river_code'],
                    station_name=item['station'],
                    latitude=item['lat'],
                    longitude=item['lon'],
                    catchment_area_km2=item.get('catchment_area_km2'),
                    water_level_m=item['water_level_m'],
                    water_level_previous_m=item.get('water_level_1hr_ago_m'),
                    rainfall_24h_mm=item.get('rainfall_24h_mm'),
                    status=item['status'],
                    last_updated=datetime.fromisoformat(item['last_updated']) if isinstance(item['last_updated'], str) else item['last_updated'],
                    region_id=self.region_id
                )
                stations.append(station)

            logger.info(f"SriLankaNorthRiverProvider: Fetched {len(stations)} stations")
            return stations

        except Exception as e:
            logger.error(f"SriLankaNorthRiverProvider: Failed to fetch stations: {e}")
            return []

    async def fetch_station_reading(self, station_id: str) -> Optional[WaterReading]:
        """Fetch current reading for a station"""
        try:
            stations = await self.fetch_stations()
            for station in stations:
                if station.station_id == station_id:
                    return WaterReading(
                        station_id=station_id,
                        water_level_m=station.water_level_m,
                        rainfall_mm=station.rainfall_24h_mm,
                        status=station.status,
                        timestamp=station.last_updated
                    )
            return None
        except Exception as e:
            logger.error(f"SriLankaNorthRiverProvider: Failed to fetch reading for {station_id}: {e}")
            return None

    async def fetch_readings_history(self, station_id: str, hours: int = 24) -> List[WaterReading]:
        """
        Fetch historical readings.
        Note: Sri Lanka Navy API doesn't provide historical data, so we return empty list.
        Historical data should be fetched from database.
        """
        logger.info(f"SriLankaNorthRiverProvider: Historical data not available from source")
        return []

    async def test_connection(self) -> bool:
        """Test connection to Sri Lanka Navy API"""
        try:
            stations = await self.fetch_stations()
            return len(stations) > 0
        except Exception as e:
            logger.error(f"SriLankaNorthRiverProvider: Connection test failed: {e}")
            return False


class IndiaWaterCommissionProvider(RiverProvider):
    """
    Provider for Indian water level data from Central Water Commission (CWC)
    This is a placeholder for integration with CWC API
    """

    def __init__(self):
        self.base_url = "https://www.cwc.gov.in/services/water_level"
        self.region_id = "south_india"

    async def fetch_stations(self, bounds: Optional[BoundingBox] = None) -> List[RiverStationData]:
        """Fetch stations from CWC API"""
        logger.warning("IndiaWaterCommissionProvider: Not yet implemented")
        return []

    async def fetch_station_reading(self, station_id: str) -> Optional[WaterReading]:
        """Fetch current reading"""
        logger.warning("IndiaWaterCommissionProvider: Not yet implemented")
        return None

    async def fetch_readings_history(self, station_id: str, hours: int = 24) -> List[WaterReading]:
        """Fetch historical readings"""
        logger.warning("IndiaWaterCommissionProvider: Not yet implemented")
        return []

    async def test_connection(self) -> bool:
        """Test connection"""
        logger.warning("IndiaWaterCommissionProvider: Not yet implemented")
        return False


class TamilNaduRiverProvider(RiverProvider):
    """
    Provider for Tamil Nadu state water resources data
    Integrates with PWD (Public Works Department) API
    """

    def __init__(self):
        self.base_url = "https://www.tnwaterresources.gov.in"
        self.region_id = "south_india"

    async def fetch_stations(self, bounds: Optional[BoundingBox] = None) -> List[RiverStationData]:
        """Fetch stations from Tamil Nadu API"""
        logger.warning("TamilNaduRiverProvider: Not yet implemented")
        return []

    async def fetch_station_reading(self, station_id: str) -> Optional[WaterReading]:
        """Fetch current reading"""
        logger.warning("TamilNaduRiverProvider: Not yet implemented")
        return None

    async def fetch_readings_history(self, station_id: str, hours: int = 24) -> List[WaterReading]:
        """Fetch historical readings"""
        logger.warning("TamilNaduRiverProvider: Not yet implemented")
        return []

    async def test_connection(self) -> bool:
        """Test connection"""
        logger.warning("TamilNaduRiverProvider: Not yet implemented")
        return False


class KarnatakaRiverProvider(RiverProvider):
    """
    Provider for Karnataka state water resources data
    Integrates with Cauvery Neeravari Nigam Limited (CNNL)
    """

    def __init__(self):
        self.base_url = "https://www.cnnl.gov.in"
        self.region_id = "south_india"

    async def fetch_stations(self, bounds: Optional[BoundingBox] = None) -> List[RiverStationData]:
        """Fetch stations from Karnataka API"""
        logger.warning("KarnatakaRiverProvider: Not yet implemented")
        return []

    async def fetch_station_reading(self, station_id: str) -> Optional[WaterReading]:
        """Fetch current reading"""
        logger.warning("KarnatakaRiverProvider: Not yet implemented")
        return None

    async def fetch_readings_history(self, station_id: str, hours: int = 24) -> List[WaterReading]:
        """Fetch historical readings"""
        logger.warning("KarnatakaRiverProvider: Not yet implemented")
        return []

    async def test_connection(self) -> bool:
        """Test connection"""
        logger.warning("KarnatakaRiverProvider: Not yet implemented")
        return False


class AndhraPradeshRiverProvider(RiverProvider):
    """
    Provider for Andhra Pradesh state water resources data
    Integrates with irrigation department APIs
    """

    def __init__(self):
        self.base_url = "https://waltax.ap.gov.in"
        self.region_id = "south_india"

    async def fetch_stations(self, bounds: Optional[BoundingBox] = None) -> List[RiverStationData]:
        """Fetch stations from AP API"""
        logger.warning("AndhraPradeshRiverProvider: Not yet implemented")
        return []

    async def fetch_station_reading(self, station_id: str) -> Optional[WaterReading]:
        """Fetch current reading"""
        logger.warning("AndhraPradeshRiverProvider: Not yet implemented")
        return None

    async def fetch_readings_history(self, station_id: str, hours: int = 24) -> List[WaterReading]:
        """Fetch historical readings"""
        logger.warning("AndhraPradeshRiverProvider: Not yet implemented")
        return []

    async def test_connection(self) -> bool:
        """Test connection"""
        logger.warning("AndhraPradeshRiverProvider: Not yet implemented")
        return False


class TelanganaRiverProvider(RiverProvider):
    """
    Provider for Telangana state water resources data
    Integrates with Irrigation Department APIs
    """

    def __init__(self):
        self.base_url = "https://irrigation.telangana.gov.in"
        self.region_id = "south_india"

    async def fetch_stations(self, bounds: Optional[BoundingBox] = None) -> List[RiverStationData]:
        """Fetch stations from Telangana API"""
        logger.warning("TelanganaRiverProvider: Not yet implemented")
        return []

    async def fetch_station_reading(self, station_id: str) -> Optional[WaterReading]:
        """Fetch current reading"""
        logger.warning("TelanganaRiverProvider: Not yet implemented")
        return None

    async def fetch_readings_history(self, station_id: str, hours: int = 24) -> List[WaterReading]:
        """Fetch historical readings"""
        logger.warning("TelanganaRiverProvider: Not yet implemented")
        return []

    async def test_connection(self) -> bool:
        """Test connection"""
        logger.warning("TelanganaRiverProvider: Not yet implemented")
        return False
