# SPDX-License-Identifier: Apache-2.0

from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
import re


class SubscriberCreate(BaseModel):
    phone_number: str
    districts: list[str] = ["Colombo"]
    language: str = "en"

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        # Sri Lankan phone number format: +94 followed by 9 digits
        pattern = r"^\+94[0-9]{9}$"
        if not re.match(pattern, v):
            raise ValueError("Invalid Sri Lankan phone number. Format: +94XXXXXXXXX")
        return v

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        if v not in ["en", "si", "ta"]:
            raise ValueError("Language must be 'en', 'si', or 'ta'")
        return v


class SubscriberResponse(BaseModel):
    id: int
    phone_number: str
    districts: list[str]
    language: str
    active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UnsubscribeRequest(BaseModel):
    phone_number: str


class AlertResponse(BaseModel):
    id: int
    district: str
    alert_level: str
    rainfall_mm: Optional[float]
    source: Optional[str]
    message: Optional[str]
    sent_at: datetime

    class Config:
        from_attributes = True


class WeatherResponse(BaseModel):
    district: str
    latitude: float
    longitude: float
    current_rainfall_mm: float
    rainfall_24h_mm: float
    temperature_c: Optional[float]
    humidity_percent: Optional[int]
    forecast_24h: list[dict]
    alert_level: str
    last_updated: datetime


class WeatherSummary(BaseModel):
    district: str
    latitude: float
    longitude: float
    rainfall_24h_mm: float
    alert_level: str


class DistrictInfo(BaseModel):
    name: str
    latitude: float
    longitude: float
    current_alert_level: str
    rainfall_24h_mm: Optional[float] = None


class GDACSAlert(BaseModel):
    event_id: str
    event_type: str
    alert_level: str
    country: str
    description: str
    latitude: float
    longitude: float
    from_date: datetime
    severity: str
    url: Optional[str]


class HealthResponse(BaseModel):
    status: str
    version: str
    timestamp: datetime


# River schemas
class WaterReadingResponse(BaseModel):
    id: int
    station_id: int
    water_level_m: float
    rainfall_24h_mm: float
    status: str
    recorded_at: datetime

    class Config:
        from_attributes = True


class StationResponse(BaseModel):
    id: int
    river_id: int
    name: str
    alert_level_m: Optional[float]
    minor_flood_m: Optional[float]
    major_flood_m: Optional[float]
    latitude: Optional[float]
    longitude: Optional[float]
    current_reading: Optional[WaterReadingResponse]

    class Config:
        from_attributes = True


class RiverWithStations(BaseModel):
    id: int
    name: str
    code: Optional[str]
    river_type: Optional[str]
    basin_number: Optional[int]
    navy_url: Optional[str]
    created_at: datetime
    stations: list[StationResponse]

    class Config:
        from_attributes = True
