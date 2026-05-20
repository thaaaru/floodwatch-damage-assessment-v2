"""Application and region configuration for FloodWatch backend."""

from functools import lru_cache
from typing import Any, Dict, List

from pydantic_settings import BaseSettings

from .region_config import RegionConfig, get_region_config


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://user:password@localhost:5432/floodwatch"

    # Twilio
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""
    twilio_whatsapp_number: str = ""

    # External APIs
    gdacs_api_url: str = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
    open_meteo_url: str = "https://api.open-meteo.com/v1/forecast"
    open_meteo_marine_url: str = "https://marine-api.open-meteo.com/v1/marine"
    weather_source: str = "open_meteo"
    tomorrow_io_api_key: str = ""
    weatherapi_key: str = ""
    tomtom_api_key: str = ""
    here_api_key: str = ""
    openweathermap_api_key: str = ""

    # Application
    alert_check_interval_minutes: int = 15
    frontend_url: str = "https://floodwatch.teklab.dev"
    debug: bool = False
    # Comma-separated list of additional CORS origins to whitelist (e.g. preview deploys, staging hosts)
    extra_cors_origins: str = ""

    # Region Configuration
    current_region: str = "srilanka"

    # Alert thresholds (mm in 24 hours)
    threshold_yellow: float = 50.0
    threshold_orange: float = 100.0
    threshold_red: float = 150.0

    class Config:
        env_file = ".env"
        case_sensitive = False

    def get_region_data(self) -> Dict[str, Any]:
        region_config = get_region_config()
        return region_config.get_region(self.current_region)

    def get_region_alert_threshold(self, rainfall_mm: float) -> str:
        region_config = get_region_config()
        return region_config.get_alert_threshold(self.current_region, rainfall_mm)

    def get_region_bounds(self) -> Dict[str, float]:
        region_config = get_region_config()
        return region_config.get_bounds(self.current_region)

    def get_region_center(self) -> Dict[str, float]:
        region_config = get_region_config()
        return region_config.get_center(self.current_region)

    def get_region_data_providers(self, provider_type: str = None) -> Dict[str, List[str]]:
        region_config = get_region_config()
        return region_config.get_data_providers(self.current_region, provider_type)

    def get_region_languages(self) -> List[str]:
        region_config = get_region_config()
        return region_config.get_languages(self.current_region)

    def get_region_timezone(self) -> str:
        region_config = get_region_config()
        return region_config.get_timezone(self.current_region)

    def get_all_regions(self) -> List[Dict[str, Any]]:
        region_config = get_region_config()
        return region_config.get_all_regions()

    def get_active_regions(self) -> List[Dict[str, Any]]:
        region_config = get_region_config()
        return region_config.get_active_regions()


@lru_cache()
def get_settings() -> Settings:
    return Settings()


__all__ = ["RegionConfig", "Settings", "get_region_config", "get_settings"]
