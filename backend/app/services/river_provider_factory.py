# SPDX-License-Identifier: Apache-2.0

"""
River Provider Factory
Selects appropriate river data provider based on region and geographic bounds.
Implements provider pattern for multi-region support.
"""

from typing import List, Optional, Dict
import logging

from .river_provider import (
    RiverProvider,
    BoundingBox,
    SriLankaNorthRiverProvider,
    IndiaWaterCommissionProvider,
    TamilNaduRiverProvider,
    KarnatakaRiverProvider,
    AndhraPradeshRiverProvider,
    TelanganaRiverProvider,
)

logger = logging.getLogger(__name__)


class RiverProviderFactory:
    """
    Factory for selecting and managing river data providers.
    Routes requests to appropriate provider(s) based on region or bounds.
    """

    def __init__(self):
        """Initialize available providers"""
        self._providers: Dict[str, RiverProvider] = {
            "srilanka_navy": SriLankaNorthRiverProvider(),
            "india_cwc": IndiaWaterCommissionProvider(),
            "tamil_nadu": TamilNaduRiverProvider(),
            "karnataka": KarnatakaRiverProvider(),
            "andhra_pradesh": AndhraPradeshRiverProvider(),
            "telangana": TelanganaRiverProvider(),
        }

        # Map regions to their providers
        self._region_providers: Dict[str, List[str]] = {
            "srilanka": ["srilanka_navy"],
            "south_india": [
                "india_cwc",
                "tamil_nadu",
                "karnataka",
                "andhra_pradesh",
                "telangana",
            ],
        }

    def get_provider(self, provider_id: str) -> Optional[RiverProvider]:
        """
        Get a specific provider by ID.

        Args:
            provider_id: Provider identifier

        Returns:
            RiverProvider instance or None if not found
        """
        return self._providers.get(provider_id)

    def get_providers_for_region(self, region_id: str) -> List[RiverProvider]:
        """
        Get all providers for a specific region.

        Args:
            region_id: Region identifier (e.g., 'srilanka', 'south_india')

        Returns:
            List of RiverProvider instances for that region
        """
        provider_ids = self._region_providers.get(region_id, [])
        return [self._providers[pid] for pid in provider_ids if pid in self._providers]

    async def get_providers_for_bounds(
        self, bounds: BoundingBox
    ) -> List[RiverProvider]:
        """
        Get providers that cover the given geographic bounds.
        Uses region configuration to determine which providers serve the area.

        Args:
            bounds: Geographic bounding box

        Returns:
            List of appropriate RiverProvider instances
        """
        from ..config import get_region_config

        region_config = get_region_config()
        providers = []

        # Check which regions contain this bounding box
        for region_id in ["srilanka", "south_india"]:
            region_bounds = region_config.get_bounds(region_id)
            if region_bounds:
                region_bbox = BoundingBox(
                    min_lat=region_bounds["min_lat"],
                    max_lat=region_bounds["max_lat"],
                    min_lon=region_bounds["min_lon"],
                    max_lon=region_bounds["max_lon"],
                )

                # Check if there's overlap between bounds and region
                if self._bounds_overlap(bounds, region_bbox):
                    region_providers = self.get_providers_for_region(region_id)
                    providers.extend(region_providers)

        return providers

    def _bounds_overlap(self, bounds1: BoundingBox, bounds2: BoundingBox) -> bool:
        """Check if two bounding boxes overlap"""
        return not (
            bounds1.max_lat < bounds2.min_lat
            or bounds1.min_lat > bounds2.max_lat
            or bounds1.max_lon < bounds2.min_lon
            or bounds1.min_lon > bounds2.max_lon
        )

    async def test_all_providers(self) -> Dict[str, bool]:
        """
        Test connection to all configured providers.

        Returns:
            Dictionary mapping provider_id to connection status
        """
        results = {}
        for provider_id, provider in self._providers.items():
            try:
                result = await provider.test_connection()
                results[provider_id] = result
                status = "OK" if result else "FAILED"
                logger.info(f"Provider {provider_id} connection test: {status}")
            except Exception as e:
                results[provider_id] = False
                logger.error(f"Provider {provider_id} connection test error: {e}")

        return results

    def list_providers(self) -> Dict[str, str]:
        """
        List all available providers.

        Returns:
            Dictionary mapping provider_id to provider class name
        """
        return {
            provider_id: provider.__class__.__name__
            for provider_id, provider in self._providers.items()
        }


# Singleton instance
_factory_instance: Optional[RiverProviderFactory] = None


def get_river_provider_factory() -> RiverProviderFactory:
    """
    Get or create the river provider factory singleton.

    Returns:
        RiverProviderFactory instance
    """
    global _factory_instance
    if _factory_instance is None:
        _factory_instance = RiverProviderFactory()
    return _factory_instance
