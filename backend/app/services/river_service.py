# SPDX-License-Identifier: Apache-2.0

"""
River Data Service
High-level service that uses provider pattern to fetch river data from multiple sources.
Handles caching, aggregation, and region-aware data fetching.
"""

from typing import List, Optional
from datetime import datetime
import logging

from .river_provider import (
    RiverStationData,
    WaterReading,
    BoundingBox,
)
from .river_provider_factory import get_river_provider_factory
from ..config import get_settings

logger = logging.getLogger(__name__)


class RiverDataService:
    """
    High-level service for river data management.
    Uses provider pattern to support multiple data sources.
    """

    def __init__(self):
        self.factory = get_river_provider_factory()
        self.settings = get_settings()

    async def fetch_stations_by_region(
        self, region_id: str
    ) -> List[RiverStationData]:
        """
        Fetch all river stations for a specific region.

        Args:
            region_id: Region identifier ('srilanka', 'south_india', etc.)

        Returns:
            List of RiverStationData objects for that region
        """
        providers = self.factory.get_providers_for_region(region_id)
        if not providers:
            logger.warning(f"No providers found for region {region_id}")
            return []

        all_stations = []
        for provider in providers:
            try:
                stations = await provider.fetch_stations()
                all_stations.extend(stations)
                logger.info(
                    f"Fetched {len(stations)} stations from {provider.__class__.__name__}"
                )
            except Exception as e:
                logger.error(
                    f"Error fetching from {provider.__class__.__name__}: {e}"
                )
                continue

        logger.info(f"Total stations fetched for region {region_id}: {len(all_stations)}")
        return all_stations

    async def fetch_stations_by_bounds(
        self, bounds: BoundingBox
    ) -> List[RiverStationData]:
        """
        Fetch all river stations within geographic bounds.
        Automatically selects providers based on region coverage.

        Args:
            bounds: Geographic bounding box

        Returns:
            List of RiverStationData objects within bounds
        """
        providers = await self.factory.get_providers_for_bounds(bounds)
        if not providers:
            logger.warning(f"No providers cover bounds {bounds}")
            return []

        all_stations = []
        for provider in providers:
            try:
                stations = await provider.fetch_stations(bounds)
                all_stations.extend(stations)
                logger.info(
                    f"Fetched {len(stations)} stations from {provider.__class__.__name__}"
                )
            except Exception as e:
                logger.error(
                    f"Error fetching from {provider.__class__.__name__}: {e}"
                )
                continue

        logger.info(f"Total stations within bounds: {len(all_stations)}")
        return all_stations

    async def fetch_current_region_stations(self) -> List[RiverStationData]:
        """
        Fetch stations for the currently configured region.
        Uses CURRENT_REGION environment variable or default.

        Returns:
            List of RiverStationData objects
        """
        current_region = self.settings.current_region
        logger.info(f"Fetching stations for current region: {current_region}")
        return await self.fetch_stations_by_region(current_region)

    async def fetch_station_reading(
        self, region_id: str, station_id: str
    ) -> Optional[WaterReading]:
        """
        Fetch current reading for a specific station.

        Args:
            region_id: Region identifier
            station_id: Station identifier

        Returns:
            WaterReading object or None if not found
        """
        providers = self.factory.get_providers_for_region(region_id)

        for provider in providers:
            try:
                reading = await provider.fetch_station_reading(station_id)
                if reading:
                    logger.info(
                        f"Fetched reading for station {station_id} from {provider.__class__.__name__}"
                    )
                    return reading
            except Exception as e:
                logger.error(
                    f"Error fetching reading from {provider.__class__.__name__}: {e}"
                )
                continue

        logger.warning(f"No reading found for station {station_id}")
        return None

    async def fetch_readings_history(
        self, region_id: str, station_id: str, hours: int = 24
    ) -> List[WaterReading]:
        """
        Fetch historical readings for a station.

        Args:
            region_id: Region identifier
            station_id: Station identifier
            hours: Number of hours of history (default 24)

        Returns:
            List of WaterReading objects
        """
        providers = self.factory.get_providers_for_region(region_id)

        all_readings = []
        for provider in providers:
            try:
                readings = await provider.fetch_readings_history(
                    station_id, hours
                )
                all_readings.extend(readings)
                if readings:
                    logger.info(
                        f"Fetched {len(readings)} readings from {provider.__class__.__name__}"
                    )
            except Exception as e:
                logger.error(
                    f"Error fetching history from {provider.__class__.__name__}: {e}"
                )
                continue

        return all_readings

    async def validate_region(self, region_id: str) -> bool:
        """
        Validate that a region is configured and has active providers.

        Args:
            region_id: Region identifier

        Returns:
            True if region is valid, False otherwise
        """
        providers = self.factory.get_providers_for_region(region_id)
        if not providers:
            logger.warning(f"No providers configured for region {region_id}")
            return False

        # Try to connect to at least one provider
        for provider in providers:
            try:
                if await provider.test_connection():
                    return True
            except Exception as e:
                logger.warning(f"Provider test failed: {e}")
                continue

        return False

    async def get_region_status(self, region_id: str) -> dict:
        """
        Get detailed status of all providers for a region.

        Args:
            region_id: Region identifier

        Returns:
            Dictionary with provider status information
        """
        providers = self.factory.get_providers_for_region(region_id)
        status = {
            "region_id": region_id,
            "providers": [],
        }

        for provider in providers:
            provider_name = provider.__class__.__name__
            try:
                is_connected = await provider.test_connection()
                status["providers"].append({
                    "name": provider_name,
                    "connected": is_connected,
                })
            except Exception as e:
                status["providers"].append({
                    "name": provider_name,
                    "connected": False,
                    "error": str(e),
                })

        status["active"] = any(
            p["connected"] for p in status["providers"]
        )

        return status


# Singleton instance
_service_instance: Optional[RiverDataService] = None


def get_river_data_service() -> RiverDataService:
    """
    Get or create the river data service singleton.

    Returns:
        RiverDataService instance
    """
    global _service_instance
    if _service_instance is None:
        _service_instance = RiverDataService()
    return _service_instance
