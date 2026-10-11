"""Application and region configuration for FloodWatch backend."""

from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import quote

from pydantic import model_validator
from pydantic_settings import BaseSettings

from .region_config import RegionConfig, get_region_config


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://user:password@localhost:5432/floodwatch"
    # Production: password comes from a Docker secret file and DATABASE_URL is
    # built from the parts below. Unset -> database_url is used as-is (local dev).
    db_password_file: str = ""
    db_user: str = "floodwatch"
    db_host: str = "db"
    db_port: int = 5432
    db_name: str = "floodwatch"

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
    google_floods_api_key: str = ""
    # ReliefWeb API v2 requires a pre-approved appname; empty = source disabled.
    reliefweb_appname: str = ""

    # SMS/WhatsApp subscriber alerts. Off by default: subscription routes are
    # not registered and the alert engine never sends messages.
    alerts_enabled: bool = False
    # floodsupport.org SOS feed: routes and the background fetch run only when true.
    sos_enabled: bool = False

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

    @model_validator(mode="after")
    def _database_url_from_secret(self) -> "Settings":
        if self.db_password_file:
            password = Path(self.db_password_file).read_text().strip()
            self.database_url = (
                f"postgresql://{quote(self.db_user, safe='')}:{quote(password, safe='')}"
                f"@{self.db_host}:{self.db_port}/{self.db_name}"
            )
        return self

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
