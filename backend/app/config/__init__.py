"""Application and region configuration for FloodWatch backend."""

from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import quote

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings

from .region_config import RegionConfig, get_region_config


# OpenWeatherMap One Call points: one per district (district capital), 25 total.
# Each scheduled refresh makes exactly one call per point.
OWM_LOCATIONS: Dict[str, Dict[str, float]] = {
    "Colombo": {"lat": 6.9271, "lon": 79.8612},
    "Gampaha": {"lat": 7.0873, "lon": 80.0144},
    "Kalutara": {"lat": 6.5854, "lon": 79.9607},
    "Kandy": {"lat": 7.2906, "lon": 80.6337},
    "Matale": {"lat": 7.4675, "lon": 80.6234},
    "Nuwara Eliya": {"lat": 6.9497, "lon": 80.7891},
    "Galle": {"lat": 6.0535, "lon": 80.2210},
    "Matara": {"lat": 5.9549, "lon": 80.5550},
    "Hambantota": {"lat": 6.1429, "lon": 81.1212},
    "Jaffna": {"lat": 9.6615, "lon": 80.0255},
    "Kilinochchi": {"lat": 9.3803, "lon": 80.3770},
    "Mannar": {"lat": 8.9810, "lon": 79.9044},
    "Vavuniya": {"lat": 8.7514, "lon": 80.4971},
    "Mullaitivu": {"lat": 9.2671, "lon": 80.8142},
    "Batticaloa": {"lat": 7.7310, "lon": 81.6747},
    "Ampara": {"lat": 7.2975, "lon": 81.6820},
    "Trincomalee": {"lat": 8.5874, "lon": 81.2152},
    "Kurunegala": {"lat": 7.4863, "lon": 80.3647},
    "Puttalam": {"lat": 8.0362, "lon": 79.8283},
    "Anuradhapura": {"lat": 8.3114, "lon": 80.4037},
    "Polonnaruwa": {"lat": 7.9403, "lon": 81.0188},
    "Badulla": {"lat": 6.9934, "lon": 81.0550},
    "Monaragala": {"lat": 6.8728, "lon": 81.3507},
    "Ratnapura": {"lat": 6.6828, "lon": 80.3992},
    "Kegalle": {"lat": 7.2513, "lon": 80.3464},
}


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
    openweathermap_api_key: str = ""
    # Production: key comes from a Docker secret file; missing/empty file -> no key
    # (early warning stays off, 503). Unset -> OPENWEATHERMAP_API_KEY env (local dev).
    openweathermap_api_key_file: str = ""
    # One Call refresh interval. 25 points x 1440/120 = 300 calls/day. ge=40 keeps the
    # nominal rate <= 25 x 1440/40 = 900 (the hard daily guard) whatever is configured.
    owm_refresh_minutes: int = Field(120, ge=40)
    google_floods_api_key: str = ""

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
        if self.openweathermap_api_key_file:
            key_file = Path(self.openweathermap_api_key_file)
            if key_file.is_file():
                self.openweathermap_api_key = key_file.read_text().strip()
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


__all__ = ["OWM_LOCATIONS", "RegionConfig", "Settings", "get_region_config", "get_settings"]
