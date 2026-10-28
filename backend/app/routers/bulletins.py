# SPDX-License-Identifier: Apache-2.0
"""Official bulletins: serves scheduler-refreshed snapshots; never calls sources."""
from fastapi import APIRouter

from ..services.bulletins import dmc_bulletins, landslide_view, met_advisories

router = APIRouter(prefix="/api/bulletins", tags=["bulletins"])


@router.get("/met-advisory")
async def get_met_advisory():
    """Met Department severe-weather advisory PDFs (land/sea/lightning…) with their issue times."""
    return met_advisories()


@router.get("/dmc-sitrep")
async def get_dmc_sitrep():
    """Latest DMC situation report: per-district totals as reported, or the link only when parsed_ok is false."""
    return dmc_bulletins.sitrep()


@router.get("/landslide")
async def get_landslide():
    """Latest NBRO landslide early warning; expired warnings come back with active=false and no warnings."""
    return landslide_view(dmc_bulletins.data.get("landslide"))
