# SPDX-License-Identifier: Apache-2.0

from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Dict, List, Any
from .config.region_config import get_region_config


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://user:password@localhost:5432/floodwatch"

    # Twilio
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""  # SMS number
    twilio_whatsapp_number: str = ""  # WhatsApp number (e.g., +14155238886 for sandbox)

    # External APIs
    gdacs_api_url: str = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
    open_meteo_url: str = "https://api.open-meteo.com/v1/forecast"
    open_meteo_marine_url: str = "https://marine-api.open-meteo.com/v1/marine"
    tomorrow_io_api_key: str = ""
    weatherapi_key: str = ""  # WeatherAPI.com key for alerts
    tomtom_api_key: str = ""  # TomTom Traffic API key
    here_api_key: str = ""  # HERE Traffic API key
    openweathermap_api_key: str = ""  # OpenWeatherMap One Call API 3.0 key

    # Application
    alert_check_interval_minutes: int = 15
    frontend_url: str = "https://weather.hackandbuild.dev"
    debug: bool = False

    # Region Configuration
    current_region: str = "srilanka"  # Default region: srilanka, south_india

    # Alert thresholds (mm in 24 hours) - Legacy, use region-specific thresholds
    threshold_yellow: float = 50.0
    threshold_orange: float = 100.0
    threshold_red: float = 150.0

    class Config:
        env_file = ".env"
        case_sensitive = False

    def get_region_data(self) -> Dict[str, Any]:
        """
        Get the current region configuration.

        Returns:
            Dictionary containing region configuration
        """
        region_config = get_region_config()
        return region_config.get_region(self.current_region)

    def get_region_alert_threshold(self, rainfall_mm: float) -> str:
        """
        Get alert level for the current region based on rainfall.

        Args:
            rainfall_mm: Rainfall amount in millimeters

        Returns:
            Alert level: 'green', 'yellow', 'orange', or 'red'
        """
        region_config = get_region_config()
        return region_config.get_alert_threshold(self.current_region, rainfall_mm)

    def get_region_bounds(self) -> Dict[str, float]:
        """
        Get geographic bounds for the current region.

        Returns:
            Dictionary with minLat, maxLat, minLon, maxLon
        """
        region_config = get_region_config()
        return region_config.get_bounds(self.current_region)

    def get_region_center(self) -> Dict[str, float]:
        """
        Get center coordinates for the current region.

        Returns:
            Dictionary with lat and lon
        """
        region_config = get_region_config()
        return region_config.get_center(self.current_region)

    def get_region_data_providers(self, provider_type: str = None) -> Dict[str, List[str]]:
        """
        Get data providers for the current region.

        Args:
            provider_type: Optional type to filter by ('weather', 'rivers', 'emergencyServices')

        Returns:
            Dictionary of data providers or list if provider_type specified
        """
        region_config = get_region_config()
        return region_config.get_data_providers(self.current_region, provider_type)

    def get_region_languages(self) -> List[str]:
        """
        Get supported languages for the current region.

        Returns:
            List of language codes
        """
        region_config = get_region_config()
        return region_config.get_languages(self.current_region)

    def get_region_timezone(self) -> str:
        """
        Get timezone for the current region.

        Returns:
            Timezone string (e.g., 'Asia/Colombo')
        """
        region_config = get_region_config()
        return region_config.get_timezone(self.current_region)

    def get_all_regions(self) -> List[Dict[str, Any]]:
        """
        Get all configured regions.

        Returns:
            List of all region configurations
        """
        region_config = get_region_config()
        return region_config.get_all_regions()

    def get_active_regions(self) -> List[Dict[str, Any]]:
        """
        Get only active regions.

        Returns:
            List of active region configurations
        """
        region_config = get_region_config()
        return region_config.get_active_regions()


@lru_cache()
def get_settings() -> Settings:
    return Settings()
