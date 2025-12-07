from sqlalchemy import Column, Integer, String, Boolean, DECIMAL, TIMESTAMP, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import json
from .database import Base


class River(Base):
    __tablename__ = "rivers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    code = Column(String(20))  # e.g., "RB 01"
    river_type = Column(String(20))  # "ganga" or "oya"
    basin_number = Column(Integer)
    navy_url = Column(String(255))
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    # Relationship
    stations = relationship("Station", back_populates="river", cascade="all, delete-orphan")


class Station(Base):
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, index=True)
    river_id = Column(Integer, ForeignKey("rivers.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False, index=True)
    alert_level_m = Column(DECIMAL(10, 2))
    minor_flood_m = Column(DECIMAL(10, 2))
    major_flood_m = Column(DECIMAL(10, 2))
    latitude = Column(DECIMAL(10, 6))
    longitude = Column(DECIMAL(10, 6))

    # Relationship
    river = relationship("River", back_populates="stations")
    current_reading = relationship("WaterReading", back_populates="station", uselist=False,
                                   order_by="desc(WaterReading.recorded_at)", viewonly=True)
    readings = relationship("WaterReading", back_populates="station", cascade="all, delete-orphan")


class WaterReading(Base):
    __tablename__ = "water_readings"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=False, index=True)
    water_level_m = Column(DECIMAL(10, 2), nullable=False)
    rainfall_24h_mm = Column(DECIMAL(10, 2), default=0.0)
    status = Column(String(20), nullable=False)  # normal, alert, minor_flood, major_flood
    recorded_at = Column(TIMESTAMP, server_default=func.current_timestamp(), index=True)

    # Relationship
    station = relationship("Station", back_populates="readings")


class Subscriber(Base):
    __tablename__ = "subscribers"

    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String(15), unique=True, nullable=False, index=True)
    _districts = Column("districts", Text, default='["Colombo"]')

    @property
    def districts(self):
        return json.loads(self._districts) if self._districts else ["Colombo"]

    @districts.setter
    def districts(self, value):
        self._districts = json.dumps(value) if value else '["Colombo"]'
    language = Column(String(10), default="en")
    channel = Column(String(10), default="whatsapp")  # whatsapp, sms
    whatsapp_opted_in = Column(Boolean, default=False)  # True when user sends first message
    active = Column(Boolean, default=True, index=True)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())
    updated_at = Column(TIMESTAMP, server_default=func.current_timestamp(), onupdate=func.current_timestamp())


class AlertHistory(Base):
    __tablename__ = "alert_history"

    id = Column(Integer, primary_key=True, index=True)
    district = Column(String(50), nullable=False, index=True)
    alert_level = Column(String(20), nullable=False)
    rainfall_mm = Column(DECIMAL(10, 2))
    source = Column(String(50))
    message = Column(Text)
    sent_at = Column(TIMESTAMP, server_default=func.current_timestamp(), index=True)


class WeatherLog(Base):
    __tablename__ = "weather_logs"

    id = Column(Integer, primary_key=True, index=True)
    district = Column(String(50), nullable=False, index=True)
    rainfall_mm = Column(DECIMAL(10, 2))
    temperature_c = Column(DECIMAL(5, 2))
    humidity_percent = Column(Integer)
    recorded_at = Column(TIMESTAMP, server_default=func.current_timestamp(), index=True)
