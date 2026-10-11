# SPDX-License-Identifier: Apache-2.0
"""30-year rainfall context (ERA5 via Open-Meteo): served from rain_daily only, never calls upstream."""
from fastapi import APIRouter, HTTPException

from ..services.rain_history import DISTRICTS, SOURCE_LABEL, rain_history

router = APIRouter(prefix="/api/rain-history", tags=["rain-history"])


@router.get("/districts")
async def districts_vs_normal():
    """Month-to-date rain vs the pro-rated 1996-2025 normal for every district capital."""
    return {"source": SOURCE_LABEL, "districts": rain_history.overview()}


@router.get("/districts/{district}")
async def district_context(district: str):
    """Monthly normals, month to date, top-5 wettest days and the annual-total trend."""
    if district not in DISTRICTS:
        raise HTTPException(status_code=404, detail="Unknown district")
    return {"source": SOURCE_LABEL, "district": district, **(rain_history.summary(district) or {"as_of": None})}
