"""
Rivers API Router
Provides river and station data with current water levels
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import River, Station, WaterReading
from ..schemas import RiverWithStations

router = APIRouter(prefix="/api", tags=["rivers"])


@router.get("/rivers", response_model=list[RiverWithStations])
async def get_all_rivers(db: Session = Depends(get_db)):
    """
    Get all rivers with their stations and current water levels
    """
    rivers = db.query(River).options(
        joinedload(River.stations).joinedload(Station.current_reading)
    ).all()

    # Get the latest reading for each station manually since viewonly relationships
    # don't always work as expected
    for river in rivers:
        for station in river.stations:
            latest_reading = db.query(WaterReading).filter(
                WaterReading.station_id == station.id
            ).order_by(WaterReading.recorded_at.desc()).first()
            station.current_reading = latest_reading

    return rivers
