# SPDX-License-Identifier: Apache-2.0

"""
Intelligence API Router
Provides automated actionable intelligence for damage control
"""
from fastapi import APIRouter, Query, BackgroundTasks
from typing import Optional

from ..services.intel_engine import intel_engine
from ..services.sos_fetcher import sos_fetcher
from ..services.river_fetcher import river_fetcher
from ..services.osm_facilities import (
    fetch_all_facilities,
    find_nearby_facilities,
    get_nearest_hospital,
    get_facilities_summary,
    refresh_facilities_cache,
)
from ..services.weatherapi_alerts import weatherapi_service
from ..services.marine_weather import marine_service
from ..services.traffic_incidents import traffic_service
from ..services.here_traffic_flow import here_flow_service
from ..services.tomtom_traffic_flow import tomtom_flow_service
from ..services.here_weather import here_weather_service
from ..services.irrigation_fetcher import irrigation_fetcher
from ..services.weather_cache import weather_cache
from ..services.flood_patterns import flood_analyzer, DISTRICT_COORDS
from ..services.environmental_data import environmental_service
from ..services.flood_threat_cache import flood_threat_cache

router = APIRouter(prefix="/api/intel", tags=["intelligence"])


@router.get("/priorities")
async def get_priorities(
    limit: int = Query(50, le=200, description="Max number of reports"),
    district: Optional[str] = Query(None, description="Filter by district"),
    urgency: Optional[str] = Query(None, description="Filter by urgency tier: CRITICAL, HIGH, MEDIUM, LOW"),
):
    """
    Get priority-ranked emergency reports.

    Returns reports sorted by urgency score (0-100).
    Higher score = more urgent = needs immediate attention.

    Urgency factors:
    - Water level (ROOF=40, NECK=35, CHEST=25, WAIST=15, ANKLE=5)
    - Vulnerable people (medical=15, disabled=8, elderly=5, children=2)
    - Time pressure (safe_hours <= 1 = 20 points)
    - People count (up to 10 points)
    - Resource scarcity (no food=3, no water=5)
    - Weather escalation (forecast rain >100mm = 15 points)
    """
    # Run fresh analysis if cache is empty
    if not intel_engine.get_priorities():
        await intel_engine.run_analysis()

    reports = intel_engine.get_priorities(limit=200)

    # Apply filters
    if district:
        reports = [r for r in reports if r.get("district", "").lower() == district.lower()]

    if urgency:
        reports = [r for r in reports if r.get("urgency_tier", "").upper() == urgency.upper()]

    return {
        "count": len(reports[:limit]),
        "reports": reports[:limit],
    }


@router.get("/clusters")
async def get_clusters(
    district: Optional[str] = Query(None, description="Filter by district"),
):
    """
    Get geographic clusters of emergencies.

    Clusters group nearby emergencies (within 2km) for efficient rescue routing.
    Each cluster includes:
    - Total people affected
    - Urgency breakdown (critical/high/medium/low)
    - Centroid coordinates for navigation
    - Vulnerability summary
    """
    if not intel_engine.get_clusters():
        await intel_engine.run_analysis()

    clusters = intel_engine.get_clusters()

    if district:
        clusters = [
            c for c in clusters
            if district.lower() in [d.lower() for d in c.get("districts", [])]
        ]

    return {
        "count": len(clusters),
        "clusters": clusters,
    }


@router.get("/summary")
async def get_summary():
    """
    Get overall intelligence summary.

    Provides:
    - Total reports and people affected
    - Urgency breakdown across all reports
    - Resource needs (food, water, medical)
    - Vulnerability counts
    - Most affected districts ranked by severity
    - Weather risk overlay per district
    """
    if not intel_engine.get_summary():
        await intel_engine.run_analysis()

    return intel_engine.get_summary()


@router.get("/district/{district}")
async def get_district_intel(district: str):
    """
    Get detailed intelligence for a specific district.

    Includes all reports, clusters, and summary stats for the district.
    """
    if not intel_engine.get_priorities():
        await intel_engine.run_analysis()

    return intel_engine.get_district_intel(district)


@router.post("/refresh")
async def refresh_analysis(background_tasks: BackgroundTasks):
    """
    Trigger immediate analysis refresh.

    Normally runs automatically every 5 minutes.
    Use this endpoint to force an immediate update.
    """
    await intel_engine.run_analysis()

    return {
        "status": "refreshed",
        "summary": intel_engine.get_summary(),
    }


@router.get("/raw-sos")
async def get_raw_sos(
    limit: int = Query(100, le=200),
):
    """
    Get raw SOS data from floodsupport.org (for debugging).
    """
    reports = await sos_fetcher.fetch_sos_reports(limit=limit)
    return {
        "count": len(reports),
        "reports": reports,
    }


@router.get("/actions")
async def get_recommended_actions():
    """
    Get automated action recommendations based on current intelligence.

    Returns prioritized list of actions that should be taken.
    """
    if not intel_engine.get_summary():
        await intel_engine.run_analysis()

    summary = intel_engine.get_summary()
    priorities = intel_engine.get_priorities(limit=100)
    clusters = intel_engine.get_clusters()

    actions = []

    # Action 1: Critical cases needing immediate rescue
    critical = [p for p in priorities if p.get("urgency_tier") == "CRITICAL"]
    if critical:
        actions.append({
            "priority": 1,
            "action": "IMMEDIATE_RESCUE",
            "description": f"Deploy rescue teams to {len(critical)} CRITICAL cases immediately",
            "targets": [
                {
                    "id": c["id"],
                    "location": c.get("address") or c.get("district"),
                    "people": c.get("number_of_people"),
                    "water_level": c.get("water_level"),
                    "contact": c.get("phone"),
                }
                for c in critical[:10]
            ],
        })

    # Action 2: Medical emergencies
    medical = [p for p in priorities if p.get("has_medical_emergency")]
    if medical:
        actions.append({
            "priority": 2,
            "action": "MEDICAL_RESPONSE",
            "description": f"Dispatch medical teams to {len(medical)} cases with medical emergencies",
            "targets": [
                {
                    "id": m["id"],
                    "location": m.get("address") or m.get("district"),
                    "people": m.get("number_of_people"),
                    "contact": m.get("phone"),
                }
                for m in medical[:10]
            ],
        })

    # Action 3: Food and water distribution
    needs_supplies = summary.get("resource_needs", {})
    if needs_supplies.get("needs_water", 0) > 0 or needs_supplies.get("needs_food", 0) > 0:
        # Find districts with most supply needs
        districts_needing = sorted(
            summary.get("most_affected_districts", []),
            key=lambda d: d.get("needs_water", 0) + d.get("needs_food", 0),
            reverse=True
        )[:5]

        actions.append({
            "priority": 3,
            "action": "SUPPLY_DISTRIBUTION",
            "description": f"Distribute supplies: {needs_supplies.get('needs_water', 0)} need water, {needs_supplies.get('needs_food', 0)} need food",
            "targets": [
                {
                    "district": d["district"],
                    "needs_water": d.get("needs_water", 0),
                    "needs_food": d.get("needs_food", 0),
                    "total_people": d.get("total_people", 0),
                }
                for d in districts_needing
            ],
        })

    # Action 4: Cluster-based rescue operations
    high_urgency_clusters = [c for c in clusters if c.get("avg_urgency", 0) >= 50]
    if high_urgency_clusters:
        actions.append({
            "priority": 4,
            "action": "CLUSTER_RESCUE",
            "description": f"Coordinate rescue operations for {len(high_urgency_clusters)} high-urgency clusters",
            "targets": [
                {
                    "cluster_id": c["cluster_id"],
                    "name": c["name"],
                    "report_count": c["report_count"],
                    "total_people": c["total_people"],
                    "centroid": c["centroid"],
                    "critical_count": c.get("critical_count", 0),
                }
                for c in high_urgency_clusters[:5]
            ],
        })

    # Action 5: Weather escalation warnings
    escalating_districts = [
        d for d in summary.get("most_affected_districts", [])
        if d.get("forecast_rain_24h", 0) > 50
    ]
    if escalating_districts:
        actions.append({
            "priority": 5,
            "action": "WEATHER_ALERT",
            "description": f"Issue warnings for {len(escalating_districts)} districts expecting >50mm rain in 24hrs",
            "targets": [
                {
                    "district": d["district"],
                    "forecast_rain_24h": d.get("forecast_rain_24h", 0),
                    "current_cases": d.get("count", 0),
                }
                for d in escalating_districts
            ],
        })

    return {
        "generated_at": summary.get("analyzed_at"),
        "total_actions": len(actions),
        "actions": actions,
    }


# ============================================================
# Emergency Facilities Endpoints (OpenStreetMap Data)
# ============================================================

@router.get("/facilities")
async def get_all_facilities():
    """
    Get all emergency facilities in Sri Lanka from OpenStreetMap.

    Includes:
    - Hospitals
    - Police stations
    - Fire stations
    - Emergency shelters

    Data is cached for 24 hours and refreshed automatically.
    """
    facilities = await fetch_all_facilities()
    summary = get_facilities_summary()

    return {
        "hospitals": facilities.get("hospitals", []),
        "police": facilities.get("police", []),
        "fire_stations": facilities.get("fire_stations", []),
        "shelters": facilities.get("shelters", []),
        "summary": summary,
        "last_updated": facilities.get("last_updated").isoformat() if facilities.get("last_updated") else None,
    }


@router.get("/facilities/nearby")
async def get_nearby_facilities(
    lat: float = Query(..., description="Latitude of the location"),
    lon: float = Query(..., description="Longitude of the location"),
    radius_km: float = Query(10.0, description="Search radius in kilometers"),
    limit_per_type: int = Query(3, le=10, description="Max facilities per type"),
):
    """
    Find emergency facilities near a specific location.

    Returns the nearest hospitals, police stations, fire stations,
    and shelters within the specified radius.

    Useful for:
    - Finding nearest hospital for medical emergencies
    - Locating shelter options for evacuees
    - Coordinating with nearby police/fire stations
    """
    # Ensure facilities cache is populated
    await fetch_all_facilities()

    nearby = find_nearby_facilities(
        lat=lat,
        lon=lon,
        radius_km=radius_km,
        limit_per_type=limit_per_type,
    )

    total = sum(len(v) for v in nearby.values())

    return {
        "location": {"latitude": lat, "longitude": lon},
        "radius_km": radius_km,
        "total_found": total,
        **nearby,
    }


@router.get("/facilities/nearest-hospital")
async def get_nearest_hospital_endpoint(
    lat: float = Query(..., description="Latitude of the location"),
    lon: float = Query(..., description="Longitude of the location"),
):
    """
    Get the single nearest hospital to a location.

    Quick lookup for emergency medical response.
    """
    # Ensure facilities cache is populated
    await fetch_all_facilities()

    hospital = get_nearest_hospital(lat, lon)

    if hospital:
        return {
            "found": True,
            "hospital": hospital,
        }
    else:
        return {
            "found": False,
            "message": "No hospitals in cache. Try refreshing facilities data.",
        }


@router.post("/facilities/refresh")
async def refresh_facilities():
    """
    Force refresh the facilities cache from OpenStreetMap.

    Normally refreshed automatically every 24 hours.
    Use this to get the latest data immediately.
    """
    facilities = await refresh_facilities_cache()
    summary = get_facilities_summary()

    return {
        "status": "refreshed",
        "summary": summary,
        "last_updated": facilities.get("last_updated").isoformat() if facilities.get("last_updated") else None,
    }


# ============================================================
# River Water Level Endpoints (Sri Lanka Navy Flood Monitoring)
# ============================================================

@router.get("/rivers")
async def get_river_levels():
    """
    Get real-time river water levels from Sri Lanka Navy flood monitoring system.

    Returns data from 45+ gauging stations across major rivers including:
    - Current water level (meters)
    - Water level 1 hour ago
    - Water level at 9am
    - 24-hour rainfall (mm)
    - Station status: normal, alert, rising, falling

    Data is cached for 5 minutes and sourced from https://floodms.navy.lk
    """
    if not river_fetcher.is_cache_valid():
        await river_fetcher.fetch_river_levels()

    stations = river_fetcher.get_cached_data()

    # Calculate summary stats
    status_counts = {"normal": 0, "alert": 0, "rising": 0, "falling": 0, "unknown": 0}
    for station in stations:
        status = station.get("status", "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1

    return {
        "count": len(stations),
        "summary": {
            "normal": status_counts["normal"],
            "alert": status_counts["alert"],
            "rising": status_counts["rising"],
            "falling": status_counts["falling"],
        },
        "stations": stations,
    }


@router.post("/rivers/refresh")
async def refresh_river_levels():
    """
    Force refresh river water level data from Navy flood monitoring.

    Normally cached for 5 minutes. Use this to get immediate update.
    """
    stations = await river_fetcher.fetch_river_levels()

    status_counts = {"normal": 0, "alert": 0, "rising": 0, "falling": 0, "unknown": 0}
    for station in stations:
        status = station.get("status", "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1

    return {
        "status": "refreshed",
        "count": len(stations),
        "summary": {
            "normal": status_counts["normal"],
            "alert": status_counts["alert"],
            "rising": status_counts["rising"],
            "falling": status_counts["falling"],
        },
    }


# ============================================================
# Weather Alerts Endpoints (WeatherAPI.com)
# ============================================================

@router.get("/weather-alerts")
async def get_weather_alerts():
    """
    Get official weather alerts for Sri Lanka from WeatherAPI.com.

    Returns active weather warnings including:
    - Flood warnings
    - Storm warnings
    - Heavy rain alerts
    - Cyclone advisories

    Data is cached for 15 minutes.
    """
    if not weatherapi_service.is_cache_valid():
        await weatherapi_service.fetch_all_alerts()

    alerts = weatherapi_service.get_cached_alerts()

    # Group by severity
    severity_counts = {"Extreme": 0, "Severe": 0, "Moderate": 0, "Minor": 0, "Unknown": 0}
    for alert in alerts:
        severity = alert.get("severity", "Unknown")
        severity_counts[severity] = severity_counts.get(severity, 0) + 1

    return {
        "count": len(alerts),
        "summary": {
            "extreme": severity_counts.get("Extreme", 0),
            "severe": severity_counts.get("Severe", 0),
            "moderate": severity_counts.get("Moderate", 0),
            "minor": severity_counts.get("Minor", 0),
        },
        "alerts": alerts,
    }


@router.post("/weather-alerts/refresh")
async def refresh_weather_alerts():
    """
    Force refresh weather alerts from WeatherAPI.com.

    Normally cached for 15 minutes. Use this to get immediate update.
    """
    alerts = await weatherapi_service.fetch_all_alerts()

    severity_counts = {"Extreme": 0, "Severe": 0, "Moderate": 0, "Minor": 0}
    for alert in alerts:
        severity = alert.get("severity", "Unknown")
        if severity in severity_counts:
            severity_counts[severity] += 1

    return {
        "status": "refreshed",
        "count": len(alerts),
        "summary": severity_counts,
    }


@router.get("/weather-alerts/location")
async def get_weather_for_location(
    location: str = Query(..., description="Location query (e.g., 'Colombo,Sri Lanka')"),
):
    """
    Get current weather and alerts for a specific location.

    Returns current conditions plus any active alerts.
    """
    weather = await weatherapi_service.fetch_current_weather(location)

    if weather:
        return weather
    else:
        return {"error": "Failed to fetch weather data", "location": location}


# ============================================================
# Marine Weather Endpoints (Open-Meteo Marine)
# ============================================================

@router.get("/marine")
async def get_marine_conditions():
    """
    Get marine/coastal weather conditions for Sri Lanka.

    Returns wave heights, swell conditions, and coastal flood risk for
    all major coastal districts. Useful for:
    - Storm surge warnings
    - Coastal flooding assessment
    - Maritime safety advisories

    Data is cached for 30 minutes from Open-Meteo Marine API.
    """
    if not marine_service.is_cache_valid():
        await marine_service.fetch_all_coastal_data()

    conditions = marine_service.get_cached_data()
    summary = marine_service.get_summary()

    return {
        "count": len(conditions),
        "summary": summary,
        "conditions": conditions,
    }


@router.post("/marine/refresh")
async def refresh_marine_conditions():
    """
    Force refresh marine weather data.

    Normally cached for 30 minutes. Use this to get immediate update.
    """
    conditions = await marine_service.fetch_all_coastal_data()
    summary = marine_service.get_summary()

    return {
        "status": "refreshed",
        "count": len(conditions),
        "summary": summary,
    }


@router.get("/marine/district/{district}")
async def get_marine_for_district(district: str):
    """
    Get marine conditions for a specific coastal district.

    Returns wave height, risk level, and risk factors.
    """
    if not marine_service.is_cache_valid():
        await marine_service.fetch_all_coastal_data()

    conditions = marine_service.get_cached_data()

    # Find matching district
    for cond in conditions:
        if cond.get("district", "").lower() == district.lower():
            return cond

    return {"error": f"No marine data for district: {district}", "available_districts": list(set(c["district"] for c in conditions))}


# ============================================================
# Traffic Incidents Endpoints (TomTom Traffic API)
# ============================================================

@router.get("/traffic")
async def get_traffic_incidents(
    category: Optional[str] = Query(None, description="Filter by category: road_closed, accident, roadworks, flooding, jam"),
):
    """
    Get real-time traffic incidents for Sri Lanka from TomTom.

    Returns road closures, accidents, roadworks, flooding, and traffic jams.
    Automatically detected - no manual reporting needed.

    Categories:
    - road_closed: Road closures
    - accident: Traffic accidents
    - roadworks: Construction/road works
    - flooding: Flooded roads
    - jam: Traffic jams

    Data is cached for 5 minutes and sourced from TomTom Traffic API.
    """
    if not traffic_service.is_cache_valid():
        await traffic_service.fetch_incidents()

    if category:
        incidents = traffic_service.get_by_category(category)
    else:
        incidents = traffic_service.get_cached_data()

    summary = traffic_service.get_summary()

    return {
        "count": len(incidents),
        "summary": summary,
        "incidents": incidents,
    }


@router.post("/traffic/refresh")
async def refresh_traffic_incidents():
    """
    Force refresh traffic incidents from TomTom.

    Normally cached for 5 minutes. Use this to get immediate update.
    """
    incidents = await traffic_service.fetch_incidents()
    summary = traffic_service.get_summary()

    return {
        "status": "refreshed",
        "count": len(incidents),
        "summary": summary,
    }


# ============================================================
# Traffic Flow Endpoints (HERE & TomTom)
# ============================================================

@router.get("/traffic-flow")
async def get_traffic_flow():
    """
    Get real-time traffic flow data for major roads in Sri Lanka.

    Returns current speeds, free-flow speeds, and congestion levels
    for expressways, major city roads, and inter-city highways.

    Combines data from both HERE and TomTom for better coverage.

    Congestion levels:
    - free: Traffic moving at normal speeds (>90% of free flow)
    - light: Slightly slower than normal (70-90%)
    - moderate: Noticeable slowdown (50-70%)
    - heavy: Significant congestion (30-50%)
    - severe: Near standstill (<30%)

    Data is cached for 5 minutes.
    """
    # Fetch from both sources
    here_data = []
    tomtom_data = []

    if not here_flow_service.is_cache_valid():
        here_data = await here_flow_service.fetch_all_flow_data()
    else:
        here_data = here_flow_service.get_cached_data()

    if not tomtom_flow_service.is_cache_valid():
        tomtom_data = await tomtom_flow_service.fetch_all_flow_data()
    else:
        tomtom_data = tomtom_flow_service.get_cached_data()

    here_summary = here_flow_service.get_summary()
    tomtom_summary = tomtom_flow_service.get_summary()

    return {
        "here": {
            "count": len(here_data),
            "summary": here_summary,
            "locations": here_data,
        },
        "tomtom": {
            "count": len(tomtom_data),
            "summary": tomtom_summary,
            "locations": tomtom_data,
        },
        "combined_count": len(here_data) + len(tomtom_data),
    }


@router.get("/traffic-flow/here")
async def get_here_traffic_flow():
    """
    Get traffic flow data from HERE API only.

    Returns speeds and congestion for major Sri Lanka roads.
    """
    if not here_flow_service.is_cache_valid():
        await here_flow_service.fetch_all_flow_data()

    data = here_flow_service.get_cached_data()
    summary = here_flow_service.get_summary()

    return {
        "count": len(data),
        "summary": summary,
        "locations": data,
    }


@router.get("/traffic-flow/tomtom")
async def get_tomtom_traffic_flow():
    """
    Get traffic flow data from TomTom API only.

    Returns speeds, travel times, and delays for major Sri Lanka roads.
    """
    if not tomtom_flow_service.is_cache_valid():
        await tomtom_flow_service.fetch_all_flow_data()

    data = tomtom_flow_service.get_cached_data()
    summary = tomtom_flow_service.get_summary()

    return {
        "count": len(data),
        "summary": summary,
        "locations": data,
        "congested_roads": tomtom_flow_service.get_congested_roads(),
    }


@router.post("/traffic-flow/refresh")
async def refresh_traffic_flow():
    """
    Force refresh traffic flow data from both HERE and TomTom.
    """
    here_data = await here_flow_service.fetch_all_flow_data()
    tomtom_data = await tomtom_flow_service.fetch_all_flow_data()

    return {
        "status": "refreshed",
        "here_count": len(here_data),
        "tomtom_count": len(tomtom_data),
        "here_summary": here_flow_service.get_summary(),
        "tomtom_summary": tomtom_flow_service.get_summary(),
    }


# ============================================================
# HERE Weather Endpoints
# ============================================================

@router.get("/here-weather")
async def get_here_weather():
    """
    Get current weather observations from HERE Weather API.

    Returns temperature, humidity, precipitation, wind, and other
    weather data for all 25 districts of Sri Lanka.

    Data is cached for 30 minutes.
    """
    if not here_weather_service.is_cache_valid():
        await here_weather_service.fetch_all_observations()

    observations = here_weather_service.get_cached_observations()
    summary = here_weather_service.get_summary()

    return {
        "count": len(observations),
        "summary": summary,
        "observations": observations,
    }


@router.get("/here-weather/forecast")
async def get_here_weather_forecast():
    """
    Get 7-day weather forecasts from HERE Weather API.

    Returns daily forecasts including temperature highs/lows,
    precipitation probability, and conditions for all districts.
    """
    forecasts = await here_weather_service.fetch_all_forecasts()

    return {
        "count": len(forecasts),
        "locations": forecasts,
    }


@router.get("/here-weather/alerts")
async def get_here_weather_alerts():
    """
    Get weather alerts from HERE Weather API.

    Returns active weather warnings, watches, and advisories
    for Sri Lanka locations.
    """
    alerts = await here_weather_service.fetch_all_alerts()

    return {
        "count": len(alerts),
        "alerts": alerts,
    }


@router.get("/here-weather/location")
async def get_here_weather_for_location(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    name: str = Query("Custom Location", description="Location name"),
):
    """
    Get weather data for a specific location.

    Returns current observation, 7-day forecast, and any active alerts.
    """
    observation = await here_weather_service.fetch_observation(lat, lon, name)
    forecast = await here_weather_service.fetch_forecast(lat, lon, name)
    alerts = await here_weather_service.fetch_alerts(lat, lon, name)

    return {
        "location": name,
        "lat": lat,
        "lon": lon,
        "observation": observation,
        "forecast": forecast.get("forecasts") if forecast else [],
        "alerts": alerts,
    }


@router.post("/here-weather/refresh")
async def refresh_here_weather():
    """
    Force refresh weather data from HERE.
    """
    observations = await here_weather_service.fetch_all_observations()
    alerts = await here_weather_service.fetch_all_alerts()

    return {
        "status": "refreshed",
        "observations_count": len(observations),
        "alerts_count": len(alerts),
        "summary": here_weather_service.get_summary(),
    }


# ============================================================
# Irrigation Department River Water Levels (ArcGIS)
# ============================================================

@router.get("/irrigation")
async def get_irrigation_water_levels():
    """
    Get real-time river water levels from Irrigation Department.

    Returns water levels for 39 gauging stations with:
    - Current water level (meters)
    - Flood thresholds (alert, minor flood, major flood)
    - Percentage to each threshold
    - Affected districts
    - Coordinates for mapping

    Data sourced from Irrigation Department's ArcGIS service.
    Cached for 5 minutes.
    """
    if not irrigation_fetcher.is_cache_valid():
        await irrigation_fetcher.fetch_water_levels()

    stations = irrigation_fetcher.get_cached_data()
    summary = irrigation_fetcher.get_summary()

    return {
        "count": len(stations),
        "summary": summary,
        "stations": stations,
    }


@router.get("/irrigation/district/{district}")
async def get_irrigation_by_district(district: str):
    """
    Get river stations affecting a specific district.

    Returns flood risk assessment for the district based on
    river water levels at upstream stations.
    """
    if not irrigation_fetcher.is_cache_valid():
        await irrigation_fetcher.fetch_water_levels()

    return irrigation_fetcher.get_flood_risk_for_district(district)


@router.post("/irrigation/refresh")
async def refresh_irrigation_data():
    """
    Force refresh river water level data from Irrigation Department.

    Normally cached for 5 minutes. Use this to get immediate update.
    """
    stations = await irrigation_fetcher.fetch_water_levels()
    summary = irrigation_fetcher.get_summary()

    return {
        "status": "refreshed",
        "count": len(stations),
        "summary": summary,
    }


# ============================================================
# Composite Flood Threat Score
# ============================================================

@router.get("/flood-threat")
async def get_flood_threat_assessment():
    """
    Get composite flood threat assessment for all districts (cached for instant response).

    Combines multiple data sources into a single threat score (0-100):
    - Current rainfall (24/48/72h accumulated) - 30%
    - River water levels vs flood thresholds - 40%
    - Forecast rainfall (next 24-48h) - 30%

    Returns:
    - National threat level
    - Per-district threat scores
    - Top risk districts
    - Contributing factors

    NOTE: Data is pre-computed by background job every 15 minutes for fast response.
    """
    # Try to get cached data first (instant response)
    cached_data = flood_threat_cache.get_cached_data()

    if cached_data:
        return cached_data

    # Cache miss or stale - trigger refresh
    logger.warning("Flood threat cache miss - triggering immediate refresh")
    success = await flood_threat_cache.refresh_cache(force=True)

    # Return refreshed data
    cached_data = flood_threat_cache.get_cached_data()
    if cached_data:
        return cached_data

    # Fallback error response if refresh failed
    logger.error("Failed to refresh flood threat cache - returning fallback response")
    return {
        "error": "Flood threat data temporarily unavailable",
        "national_threat_level": "UNKNOWN",
        "national_threat_score": 0,
        "summary": {
            "critical_districts": 0,
            "high_risk_districts": 0,
            "medium_risk_districts": 0,
            "rivers_at_major_flood": 0,
            "rivers_at_minor_flood": 0,
            "rivers_at_alert": 0,
        },
        "top_risk_districts": [],
        "all_districts": [],
        "highest_risk_river": None,
        "analyzed_at": None,
    }


# ============================================================
# Flood Pattern Analysis Endpoints (30-year historical data)
# ============================================================

@router.get("/flood-patterns")
async def get_flood_patterns(
    district: str = Query("Colombo", description="District to analyze"),
    years: int = Query(30, ge=5, le=50, description="Number of years to analyze"),
):
    """
    Get historical flood patterns for a district.

    Analyzes 30+ years of rainfall data from Open-Meteo to identify:
    - Monthly rainfall patterns and flood risk levels
    - Seasonal monsoon patterns
    - Extreme rainfall events (potential flood triggers)
    - Year-over-year trends

    This endpoint fetches historical data which may take 30-60 seconds.
    """
    if district not in DISTRICT_COORDS:
        return {"error": f"Unknown district: {district}. Valid districts: {list(DISTRICT_COORDS.keys())}"}

    analysis = await flood_analyzer.run_full_analysis(district, years)
    return analysis


@router.get("/flood-patterns/monthly")
async def get_monthly_flood_risk(
    district: str = Query("Colombo", description="District to analyze"),
):
    """
    Get monthly flood risk assessment based on historical data.

    Returns flood risk level (HIGH/MEDIUM/LOW) for each month
    based on 30 years of rainfall patterns.
    """
    if district not in DISTRICT_COORDS:
        return {"error": f"Unknown district: {district}"}

    analysis = await flood_analyzer.run_full_analysis(district, years=30)

    if "error" in analysis:
        return analysis

    return {
        "district": district,
        "period": analysis["period"],
        "flood_risk_by_month": analysis["flood_risk_months"],
        "peak_risk_months": [
            m for m in analysis["flood_risk_months"]
            if m["flood_risk"] == "HIGH"
        ],
        "summary": {
            "avg_annual_rainfall_mm": analysis["summary"]["avg_annual_rainfall_mm"],
            "extreme_rain_days_30yr": analysis["summary"]["extreme_rain_days"],
        }
    }


@router.get("/flood-patterns/extreme-events")
async def get_extreme_events(
    district: str = Query("Colombo", description="District to analyze"),
    threshold_mm: float = Query(100, description="Rainfall threshold in mm"),
):
    """
    Get historical extreme rainfall events that could trigger floods.

    Returns the top 50 highest rainfall days in the past 30 years
    for the specified district.
    """
    if district not in DISTRICT_COORDS:
        return {"error": f"Unknown district: {district}"}

    coords = DISTRICT_COORDS[district]

    # Fetch and analyze
    rainfall_data = await flood_analyzer.fetch_historical_rainfall(
        coords["lat"], coords["lon"],
        start_year=1994, end_year=2024
    )

    extreme_events = flood_analyzer.analyze_extreme_events(rainfall_data, threshold_mm)

    # Group by month to see which months have most extreme events
    month_counts = {}
    for event in extreme_events:
        month = event["month"]
        month_name = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month]
        month_counts[month_name] = month_counts.get(month_name, 0) + 1

    return {
        "district": district,
        "threshold_mm": threshold_mm,
        "total_extreme_events": len(extreme_events),
        "events_by_month": month_counts,
        "top_events": extreme_events[:30],
    }


@router.get("/flood-patterns/districts")
async def get_available_districts():
    """
    Get list of available districts for flood pattern analysis.
    """
    flood_prone = [
        "Colombo", "Gampaha", "Kalutara", "Ratnapura", "Kegalle",
        "Galle", "Matara", "Batticaloa", "Ampara", "Trincomalee"
    ]

    return {
        "total_districts": len(DISTRICT_COORDS),
        "districts": list(DISTRICT_COORDS.keys()),
        "flood_prone_districts": flood_prone,
        "note": "Flood-prone districts are based on historical flood occurrence data",
    }


@router.get("/flood-patterns/current-risk")
async def get_current_flood_risk_with_history():
    """
    Compare current conditions with historical patterns.

    Combines:
    - Current rainfall from weather API
    - Current river levels from Irrigation Dept
    - Historical monthly averages for context

    Returns whether current conditions are above/below historical norms.
    """
    from datetime import datetime

    current_month = datetime.now().month
    month_name = datetime.now().strftime("%B")

    # Get current weather data
    weather_data = weather_cache.get_all_weather()

    # Get current river data
    river_data = await irrigation_fetcher.fetch_water_levels()

    # Analyze a sample district for historical context
    try:
        historical = await flood_analyzer.run_full_analysis("Colombo", years=30)
        historical_monthly = historical.get("monthly_patterns", {}).get(current_month, {})
    except Exception:
        historical_monthly = {}

    # Calculate current conditions
    current_rainfall_avg = 0
    if weather_data:
        rainfalls = [w.get("current_precip_mm", 0) or 0 for w in weather_data]
        current_rainfall_avg = sum(rainfalls) / len(rainfalls) if rainfalls else 0

    rivers_at_risk = len([r for r in river_data if r.get("status") in ["alert", "minor_flood", "major_flood"]])

    # Compare with historical
    historical_avg = historical_monthly.get("avg_daily_rainfall_mm", 0)
    historical_risk = historical_monthly.get("flood_risk", "UNKNOWN")

    deviation = "NORMAL"
    if historical_avg > 0:
        ratio = current_rainfall_avg / historical_avg
        if ratio > 1.5:
            deviation = "ABOVE_NORMAL"
        elif ratio < 0.5:
            deviation = "BELOW_NORMAL"

    return {
        "current_month": month_name,
        "current_conditions": {
            "avg_rainfall_today_mm": round(current_rainfall_avg, 2),
            "rivers_at_risk": rivers_at_risk,
            "total_rivers_monitored": len(river_data),
        },
        "historical_context": {
            "avg_daily_rainfall_mm": historical_avg,
            "historical_flood_risk": historical_risk,
            "max_daily_rainfall_mm": historical_monthly.get("max_daily_rainfall_mm", 0),
        },
        "assessment": {
            "deviation_from_normal": deviation,
            "is_high_risk_month": historical_risk == "HIGH",
            "rivers_at_risk_pct": round(rivers_at_risk / max(1, len(river_data)) * 100, 1),
        },
        "data_sources": {
            "weather": "Open-Meteo (real-time)",
            "rivers": "Irrigation Dept ArcGIS",
            "historical": "Open-Meteo Archive (30 years)",
        }
    }


# ============================================================
# Environmental Data Endpoints (Deforestation & Population)
# ============================================================

@router.get("/environmental")
async def get_environmental_data(
    start_year: int = Query(1994, ge=1990, le=2024, description="Start year for analysis"),
    end_year: int = Query(2024, ge=1990, le=2024, description="End year for analysis"),
):
    """
    Get environmental trend data for Sri Lanka.

    Includes:
    - Forest cover changes (deforestation)
    - Population density trends
    - Urban population growth
    - Agricultural land changes

    Also calculates flood risk factors based on environmental changes.
    Data is sourced from World Bank Open Data API and cached for 1 week.
    """
    return await environmental_service.get_environmental_trends(start_year, end_year)


@router.get("/environmental/flood-correlation")
async def get_flood_correlation():
    """
    Get correlation analysis between environmental changes and flood risk.

    Shows how deforestation, population growth, and urbanization
    have affected flood vulnerability over the past 30 years.
    """
    # Get environmental data
    env_data = await environmental_service.get_environmental_trends(1994, 2024)

    # Get flood pattern data for comparison
    try:
        flood_data = await flood_analyzer.run_full_analysis("Colombo", years=30)
    except Exception:
        flood_data = {}

    # Prepare correlation analysis
    correlation = {
        "period": "1994-2024",
        "environmental_changes": {
            "forest_cover": env_data.get("forest_cover", {}).get("analysis", {}),
            "population_density": env_data.get("population_density", {}).get("analysis", {}),
            "urban_population": env_data.get("urban_population", {}).get("analysis", {}),
        },
        "flood_patterns": {
            "extreme_events_trend": "increasing" if flood_data.get("climate_change", {}).get("changes", [{}])[1].get("trend") == "increasing" else "stable",
            "rainfall_trend": flood_data.get("climate_change", {}).get("changes", [{}])[0].get("trend", "unknown"),
        } if flood_data else {},
        "risk_assessment": env_data.get("flood_risk_factors", {}),
        "key_insights": [
            f"Forest cover has changed by {env_data.get('forest_cover', {}).get('analysis', {}).get('percent_change', 0):.1f}% since 1994",
            f"Population density increased by {env_data.get('population_density', {}).get('analysis', {}).get('percent_change', 0):.1f}%",
            f"Urban population grew from {env_data.get('urban_population', {}).get('analysis', {}).get('first_value', 0):.1f}% to {env_data.get('urban_population', {}).get('analysis', {}).get('last_value', 0):.1f}%",
        ],
        "data_sources": {
            "environmental": "World Bank Open Data API",
            "flood_patterns": "Open-Meteo Historical Archive",
        }
    }

    return correlation
