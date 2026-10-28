# SPDX-License-Identifier: Apache-2.0
"""Optional home-map overlays: observed 24 h rain (NBRO via RISE) and OSM hospitals/shelters."""
from fastapi import APIRouter

from ..services.map_feeds import MapFacilitiesService, Rain24hService

router = APIRouter(tags=["map-layers"])
rain_24h_service = Rain24hService()
map_facilities_service = MapFacilitiesService()


@router.get("/api/rain/24h")
async def rain_last_24h():
    """NBRO rain gauges: 24 h total per station; stale=True on a station older than 3 h."""
    return await rain_24h_service.get()


@router.get("/api/map/facilities")
async def map_facilities():
    """Hospitals and emergency shelters from OpenStreetMap (unverified, not an official list)."""
    return await map_facilities_service.get()
