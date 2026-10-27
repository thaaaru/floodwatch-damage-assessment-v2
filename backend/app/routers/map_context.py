# SPDX-License-Identifier: Apache-2.0
"""Map context endpoints with explicit provenance and bounded paid integrations."""
import re

import httpx
from fastapi import APIRouter, HTTPException, Path, Query, Request
from pydantic import BaseModel, Field, field_validator

from ..config import get_settings
from ..config.rate_limit import get_client_identity, limiter
from ..services.map_context import GoogleMapsService, NominatimPlaceService, PointWeatherService
from ..services.open_meteo import OpenMeteoService

router = APIRouter(prefix="/api/map-context", tags=["map-context"])
settings = get_settings()
weather_service = PointWeatherService(OpenMeteoService())
google_maps_service = GoogleMapsService(
    settings.google_maps_api_key,
    client_daily_budget=settings.map_context_client_daily_budget,
)
nominatim_place_service = NominatimPlaceService()
_PLACE_ID = re.compile(r"^[A-Za-z0-9_-]{1,256}$")


class AutocompleteRequest(BaseModel):
    input: str = Field(min_length=1, max_length=100)

    @field_validator("input")
    @classmethod
    def input_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("input must not be blank")
        return value


class Coordinate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RouteRequest(BaseModel):
    origin: Coordinate
    destination: Coordinate


def _require_google() -> None:
    if not settings.google_maps_api_key:
        raise HTTPException(
            status_code=503,
            detail="Google Maps API key not configured. Set GOOGLE_MAPS_API_KEY in the backend environment.",
        )


async def _google_call(awaitable):
    try:
        return await awaitable
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Google Maps upstream unavailable") from exc

async def _nominatim_call(awaitable):
    try:
        return await awaitable
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="OpenStreetMap place search unavailable") from exc


@router.get("/weather")
@limiter.limit("60/minute")
async def weather(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    try:
        return await weather_service.get(lat, lon)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Weather service unavailable") from exc


@router.post("/places/autocomplete")
@limiter.limit("30/minute")
async def autocomplete(request: Request, body: AutocompleteRequest):
    if settings.google_maps_api_key:
        return await _google_call(
            google_maps_service.autocomplete(
                body.input,
                get_client_identity(request, settings.trusted_proxy_cidrs),
            )
        )
    return await _nominatim_call(nominatim_place_service.search(body.input))


@router.get("/places/{place_id}")
@limiter.limit("30/minute")
async def place(
    request: Request,
    place_id: str = Path(..., min_length=1, max_length=256),
):
    if not _PLACE_ID.fullmatch(place_id):
        raise HTTPException(status_code=422, detail="invalid place_id")
    if place_id.startswith("osm_"):
        return await _nominatim_call(nominatim_place_service.place(place_id))
    _require_google()
    return await _google_call(
        google_maps_service.place(
            place_id,
            get_client_identity(request, settings.trusted_proxy_cidrs),
        )
    )


@router.post("/route")
@limiter.limit("15/minute")
async def route(request: Request, body: RouteRequest):
    _require_google()
    return await _google_call(
        google_maps_service.route(
            body.origin.model_dump(),
            body.destination.model_dump(),
            get_client_identity(request, settings.trusted_proxy_cidrs),
        )
    )


@router.get("/elevation")
@limiter.limit("30/minute")
async def elevation(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    _require_google()
    return await _google_call(
        google_maps_service.elevation(
            lat,
            lon,
            get_client_identity(request, settings.trusted_proxy_cidrs),
        )
    )
