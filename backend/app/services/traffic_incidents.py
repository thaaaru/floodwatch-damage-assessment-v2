"""
TomTom Traffic Incidents API integration.
Provides real-time road incidents, closures, and traffic data for Sri Lanka.
"""
import httpx
import logging
from typing import Optional
from datetime import datetime

from ..config import get_settings

logger = logging.getLogger(__name__)

# Sri Lanka split into smaller regions (TomTom limits bbox to 10,000 km²)
# Using ~0.8° x 0.8° regions (~8,000 km² each)
SRI_LANKA_REGIONS = [
    # Colombo Metro
    {"min_lat": 6.7, "min_lon": 79.7, "max_lat": 7.1, "max_lon": 80.2, "name": "Colombo"},
    # Galle-Matara
    {"min_lat": 5.9, "min_lon": 80.0, "max_lat": 6.4, "max_lon": 80.6, "name": "Galle-Matara"},
    # Kandy
    {"min_lat": 7.1, "min_lon": 80.4, "max_lat": 7.5, "max_lon": 80.9, "name": "Kandy"},
    # Kurunegala-Anuradhapura
    {"min_lat": 7.5, "min_lon": 79.9, "max_lat": 8.2, "max_lon": 80.6, "name": "Kurunegala"},
    # Jaffna
    {"min_lat": 9.4, "min_lon": 79.8, "max_lat": 9.9, "max_lon": 80.4, "name": "Jaffna"},
    # Trincomalee
    {"min_lat": 8.3, "min_lon": 80.9, "max_lat": 8.8, "max_lon": 81.4, "name": "Trincomalee"},
    # Batticaloa
    {"min_lat": 7.5, "min_lon": 81.4, "max_lat": 8.0, "max_lon": 81.9, "name": "Batticaloa"},
    # Negombo-Chilaw
    {"min_lat": 7.1, "min_lon": 79.7, "max_lat": 7.6, "max_lon": 80.2, "name": "Negombo"},
]

# TomTom incident categories
INCIDENT_CATEGORIES = {
    0: "Unknown",
    1: "Accident",
    2: "Fog",
    3: "Dangerous Conditions",
    4: "Rain",
    5: "Ice",
    6: "Jam",
    7: "Lane Closed",
    8: "Road Closed",
    9: "Road Works",
    10: "Wind",
    11: "Flooding",
    14: "Broken Down Vehicle",
}

# Severity mapping (TomTom uses magnitudeOfDelay)
def get_severity(magnitude: int) -> str:
    """Convert TomTom magnitude to severity level"""
    if magnitude >= 4:
        return "critical"
    elif magnitude >= 3:
        return "major"
    elif magnitude >= 2:
        return "moderate"
    elif magnitude >= 1:
        return "minor"
    return "unknown"


class TrafficIncident:
    """Represents a traffic incident"""
    def __init__(
        self,
        id: str,
        icon_category: int,
        category: str,
        severity: str,
        lat: float,
        lon: float,
        description: str,
        from_location: str,
        to_location: str,
        road_name: str,
        delay_seconds: int,
        length_meters: int,
        start_time: Optional[str],
        end_time: Optional[str],
    ):
        self.id = id
        self.icon_category = icon_category
        self.category = category
        self.severity = severity
        self.lat = lat
        self.lon = lon
        self.description = description
        self.from_location = from_location
        self.to_location = to_location
        self.road_name = road_name
        self.delay_seconds = delay_seconds
        self.length_meters = length_meters
        self.start_time = start_time
        self.end_time = end_time

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "icon_category": self.icon_category,
            "category": self.category,
            "severity": self.severity,
            "lat": self.lat,
            "lon": self.lon,
            "description": self.description,
            "from_location": self.from_location,
            "to_location": self.to_location,
            "road_name": self.road_name,
            "delay_seconds": self.delay_seconds,
            "delay_minutes": round(self.delay_seconds / 60) if self.delay_seconds else 0,
            "length_meters": self.length_meters,
            "length_km": round(self.length_meters / 1000, 1) if self.length_meters else 0,
            "start_time": self.start_time,
            "end_time": self.end_time,
        }


class TrafficIncidentsService:
    """Service for fetching traffic incidents from TomTom"""

    BASE_URL = "https://api.tomtom.com/traffic/services/5/incidentDetails"

    def __init__(self):
        self.settings = get_settings()
        self._cache: list[dict] = []
        self._last_fetch: Optional[datetime] = None
        self._cache_duration_seconds = 300  # 5 minutes

    async def fetch_incidents_for_region(self, region: dict) -> list[dict]:
        """Fetch traffic incidents for a specific region"""
        api_key = self.settings.tomtom_api_key

        if not api_key:
            return []

        try:
            bbox = f"{region['min_lon']},{region['min_lat']},{region['max_lon']},{region['max_lat']}"

            params = {
                "key": api_key,
                "bbox": bbox,
                "fields": "{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers}}}",
                "language": "en-GB",
                "categoryFilter": "0,1,2,3,4,5,6,7,8,9,10,11,14",
                "timeValidityFilter": "present",
            }

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(self.BASE_URL, params=params)
                response.raise_for_status()
                data = response.json()

            return data.get("incidents", [])

        except Exception as e:
            logger.error(f"Failed to fetch incidents for region {region.get('name', 'unknown')}: {e}")
            return []

    async def fetch_incidents(self) -> list[dict]:
        """Fetch traffic incidents for all of Sri Lanka (multiple regions)"""
        api_key = self.settings.tomtom_api_key

        if not api_key:
            logger.warning("TomTom API key not configured")
            return []

        try:
            # Fetch from all regions
            all_raw_incidents = []
            seen_ids = set()

            for region in SRI_LANKA_REGIONS:
                raw_incidents = await self.fetch_incidents_for_region(region)
                for incident in raw_incidents:
                    incident_id = incident.get("properties", {}).get("id")
                    if incident_id and incident_id not in seen_ids:
                        seen_ids.add(incident_id)
                        all_raw_incidents.append(incident)

            logger.info(f"Fetched {len(all_raw_incidents)} raw incidents from {len(SRI_LANKA_REGIONS)} regions")

            incidents = []
            raw_incidents = all_raw_incidents

            for item in raw_incidents:
                try:
                    props = item.get("properties", {})
                    geometry = item.get("geometry", {})

                    # Get coordinates (can be point or line)
                    coords = geometry.get("coordinates", [])
                    if geometry.get("type") == "Point":
                        lon, lat = coords[0], coords[1] if len(coords) > 1 else (0, 0)
                    elif geometry.get("type") == "LineString" and coords:
                        # Use midpoint of line
                        mid_idx = len(coords) // 2
                        lon, lat = coords[mid_idx] if coords else (0, 0)
                    else:
                        continue

                    icon_category = props.get("iconCategory", 0)
                    category = INCIDENT_CATEGORIES.get(icon_category, "Unknown")
                    magnitude = props.get("magnitudeOfDelay", 0)
                    severity = get_severity(magnitude)

                    # Get description from events
                    events = props.get("events", [])
                    description = events[0].get("description", "") if events else ""

                    # Road names
                    road_numbers = props.get("roadNumbers", [])
                    road_name = ", ".join(road_numbers) if road_numbers else "Unknown Road"

                    incident = TrafficIncident(
                        id=props.get("id", ""),
                        icon_category=icon_category,
                        category=category,
                        severity=severity,
                        lat=lat,
                        lon=lon,
                        description=description,
                        from_location=props.get("from", ""),
                        to_location=props.get("to", ""),
                        road_name=road_name,
                        delay_seconds=props.get("delay", 0),
                        length_meters=props.get("length", 0),
                        start_time=props.get("startTime"),
                        end_time=props.get("endTime"),
                    )
                    incidents.append(incident.to_dict())

                except Exception as e:
                    logger.error(f"Error parsing incident: {e}")
                    continue

            self._cache = incidents
            self._last_fetch = datetime.utcnow()

            logger.info(f"Fetched {len(incidents)} traffic incidents for Sri Lanka")
            return incidents

        except httpx.HTTPStatusError as e:
            logger.error(f"TomTom API error: {e.response.status_code} - {e.response.text}")
            return []
        except Exception as e:
            logger.error(f"Failed to fetch traffic incidents: {e}")
            return []

    def get_cached_data(self) -> list[dict]:
        """Get cached traffic incidents"""
        return self._cache

    def is_cache_valid(self) -> bool:
        """Check if cache is still valid"""
        if not self._last_fetch:
            return False
        elapsed = (datetime.utcnow() - self._last_fetch).total_seconds()
        return elapsed < self._cache_duration_seconds

    def get_summary(self) -> dict:
        """Get summary of current incidents"""
        if not self._cache:
            return {
                "total": 0,
                "road_closed": 0,
                "accidents": 0,
                "roadworks": 0,
                "flooding": 0,
                "jams": 0,
                "other": 0,
            }

        road_closed = sum(1 for i in self._cache if i["icon_category"] == 8)
        accidents = sum(1 for i in self._cache if i["icon_category"] == 1)
        roadworks = sum(1 for i in self._cache if i["icon_category"] == 9)
        flooding = sum(1 for i in self._cache if i["icon_category"] == 11)
        jams = sum(1 for i in self._cache if i["icon_category"] == 6)
        other = len(self._cache) - road_closed - accidents - roadworks - flooding - jams

        return {
            "total": len(self._cache),
            "road_closed": road_closed,
            "accidents": accidents,
            "roadworks": roadworks,
            "flooding": flooding,
            "jams": jams,
            "other": other,
        }

    def get_by_category(self, category: str) -> list[dict]:
        """Filter incidents by category"""
        category_map = {
            "road_closed": 8,
            "accident": 1,
            "roadworks": 9,
            "flooding": 11,
            "jam": 6,
        }

        icon_cat = category_map.get(category.lower())
        if icon_cat is None:
            return self._cache

        return [i for i in self._cache if i["icon_category"] == icon_cat]


# Singleton instance
traffic_service = TrafficIncidentsService()
