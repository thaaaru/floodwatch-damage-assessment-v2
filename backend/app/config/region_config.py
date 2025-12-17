"""
Region Configuration Manager for FloodWatch

This module provides region-specific configuration management for the FloodWatch system.
It supports multiple geographic regions with different alert thresholds, data providers,
and regional settings.
"""

import json
import os
from typing import Dict, List, Optional, Any
from pathlib import Path


class RegionConfig:
    """
    Manages region-specific configuration for FloodWatch.

    Supports multiple regions with different:
    - Geographic boundaries
    - Alert thresholds
    - Data providers
    - Languages and localization
    - Emergency services
    """

    def __init__(self, config_path: Optional[str] = None):
        """
        Initialize the RegionConfig.

        Args:
            config_path: Optional path to regions.json. If not provided, uses default location.
        """
        if config_path is None:
            # Default path relative to this file
            base_dir = Path(__file__).parent.parent
            config_path = base_dir / "data" / "regions.json"

        self.config_path = Path(config_path)
        self.regions: Dict[str, Dict[str, Any]] = {}
        self._load_regions()

    def _load_regions(self):
        """Load region configuration from JSON file."""
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Create a dictionary keyed by region ID
                self.regions = {
                    region['id']: region
                    for region in data.get('regions', [])
                }
        except FileNotFoundError:
            raise FileNotFoundError(
                f"Region configuration file not found: {self.config_path}"
            )
        except json.JSONDecodeError as e:
            raise ValueError(
                f"Invalid JSON in region configuration: {e}"
            )

    def get_region(self, region_id: str) -> Optional[Dict[str, Any]]:
        """
        Get configuration for a specific region.

        Args:
            region_id: The region identifier (e.g., 'srilanka', 'south_india')

        Returns:
            Region configuration dictionary or None if not found

        Raises:
            ValueError: If region_id is not valid
        """
        if not region_id:
            raise ValueError("Region ID cannot be empty")

        region = self.regions.get(region_id)
        if region is None:
            raise ValueError(
                f"Invalid region_id: {region_id}. "
                f"Available regions: {', '.join(self.regions.keys())}"
            )

        return region

    def get_all_regions(self) -> List[Dict[str, Any]]:
        """
        Get all configured regions.

        Returns:
            List of all region configurations
        """
        return list(self.regions.values())

    def get_active_regions(self) -> List[Dict[str, Any]]:
        """
        Get only active regions.

        Returns:
            List of active region configurations
        """
        return [
            region for region in self.regions.values()
            if region.get('active', False)
        ]

    def is_valid_region(self, region_id: str) -> bool:
        """
        Check if a region ID is valid.

        Args:
            region_id: The region identifier to validate

        Returns:
            True if region exists, False otherwise
        """
        return region_id in self.regions

    def is_region_active(self, region_id: str) -> bool:
        """
        Check if a region is active.

        Args:
            region_id: The region identifier

        Returns:
            True if region is active, False otherwise

        Raises:
            ValueError: If region_id is not valid
        """
        region = self.get_region(region_id)
        return region.get('active', False) if region else False

    def get_alert_threshold(self, region_id: str, rainfall_mm: float) -> str:
        """
        Determine the alert level for a given rainfall amount in a region.

        Args:
            region_id: The region identifier
            rainfall_mm: Rainfall amount in millimeters

        Returns:
            Alert level: 'green', 'yellow', 'orange', or 'red'

        Raises:
            ValueError: If region_id is not valid
        """
        region = self.get_region(region_id)
        thresholds = region.get('alertThresholds', {})

        # Check thresholds in order of severity
        for level in ['red', 'orange', 'yellow', 'green']:
            threshold = thresholds.get(level, {})
            min_rain = threshold.get('minRain', 0)
            max_rain = threshold.get('maxRain', 999)

            if min_rain <= rainfall_mm <= max_rain:
                return level

        # Default to green if no threshold matches
        return 'green'

    def get_alert_thresholds(self, region_id: str) -> Dict[str, Dict[str, float]]:
        """
        Get all alert thresholds for a region.

        Args:
            region_id: The region identifier

        Returns:
            Dictionary of alert thresholds

        Raises:
            ValueError: If region_id is not valid
        """
        region = self.get_region(region_id)
        return region.get('alertThresholds', {})

    def get_data_providers(
        self,
        region_id: str,
        provider_type: Optional[str] = None
    ) -> Dict[str, List[str]]:
        """
        Get data providers configured for a region.

        Args:
            region_id: The region identifier
            provider_type: Optional type to filter by ('weather', 'rivers', 'emergencyServices')

        Returns:
            Dictionary of data providers or list if provider_type specified

        Raises:
            ValueError: If region_id is not valid
        """
        region = self.get_region(region_id)
        providers = region.get('dataProviders', {})

        if provider_type:
            return providers.get(provider_type, [])

        return providers

    def get_bounds(self, region_id: str) -> Dict[str, float]:
        """
        Get geographic bounding box for a region.

        Args:
            region_id: The region identifier

        Returns:
            Dictionary with minLat, maxLat, minLon, maxLon

        Raises:
            ValueError: If region_id is not valid
        """
        region = self.get_region(region_id)
        return region.get('bounds', {})

    def get_center(self, region_id: str) -> Dict[str, float]:
        """
        Get center coordinates for a region.

        Args:
            region_id: The region identifier

        Returns:
            Dictionary with lat and lon

        Raises:
            ValueError: If region_id is not valid
        """
        region = self.get_region(region_id)
        return region.get('center', {})

    def get_languages(self, region_id: str) -> List[str]:
        """
        Get supported languages for a region.

        Args:
            region_id: The region identifier

        Returns:
            List of language codes

        Raises:
            ValueError: If region_id is not valid
        """
        region = self.get_region(region_id)
        return region.get('languages', [])

    def get_timezone(self, region_id: str) -> str:
        """
        Get timezone for a region.

        Args:
            region_id: The region identifier

        Returns:
            Timezone string (e.g., 'Asia/Colombo')

        Raises:
            ValueError: If region_id is not valid
        """
        region = self.get_region(region_id)
        return region.get('timeZone', 'UTC')

    def get_currency(self, region_id: str) -> str:
        """
        Get currency code for a region.

        Args:
            region_id: The region identifier

        Returns:
            Currency code (e.g., 'LKR', 'INR')

        Raises:
            ValueError: If region_id is not valid
        """
        region = self.get_region(region_id)
        return region.get('currency', 'USD')

    def get_sms_gateway(self, region_id: str) -> str:
        """
        Get SMS gateway configuration for a region.

        Args:
            region_id: The region identifier

        Returns:
            SMS gateway identifier

        Raises:
            ValueError: If region_id is not valid
        """
        region = self.get_region(region_id)
        return region.get('smsGateway', 'twilio')

    def reload(self):
        """Reload region configuration from file."""
        self._load_regions()


# Global instance
_region_config: Optional[RegionConfig] = None


def get_region_config() -> RegionConfig:
    """
    Get the global RegionConfig instance.

    Returns:
        RegionConfig singleton instance
    """
    global _region_config
    if _region_config is None:
        _region_config = RegionConfig()
    return _region_config
