# SPDX-License-Identifier: Apache-2.0
from fastapi import APIRouter

from ..config import get_settings
from ..services.external_flood import ExternalFloodService

router = APIRouter(prefix="/api/external-flood", tags=["External Flood Intelligence"])
external_flood_service = ExternalFloodService(get_settings().google_floods_api_key)


@router.get("/snapshot")
async def get_external_flood_snapshot():
    return await external_flood_service.snapshot()
