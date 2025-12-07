"""
Script to populate river and station data from Navy flood monitoring system
"""
import sys
import asyncio
from datetime import datetime
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from app.database import SessionLocal
from app.models import River, Station, WaterReading
from app.services.river_fetcher import river_fetcher


# River basin mapping (from frontend data)
RIVER_BASINS = {
    "Kelani Ganga": ("RB 01", "ganga", 1, "https://floodms.navy.lk/wlrs/index.php"),
    "Kalu Ganga": ("RB 03", "ganga", 3, "https://floodms.navy.lk/wlrs/kaluganga.php"),
    "Gin Ganga": ("RB 09", "ganga", 9, "https://floodms.navy.lk/wlrs/ginganga.php"),
    "Nilwala Ganga": ("RB 12", "ganga", 12, "https://floodms.navy.lk/wlrs/nilwalaganga.php"),
    "Walawe Ganga": ("RB 18", "ganga", 18, "https://floodms.navy.lk/wlrs/walaweganga.php"),
    "Menik Ganga": ("RB 26", "ganga", 26, "https://floodms.navy.lk/wlrs/menikganga.php"),
    "Kumbukkan Oya": ("RB 31", "oya", 31, "https://floodms.navy.lk/wlrs/kumbukkanoya.php"),
    "Heda Oya": ("RB 36", "oya", 36, "https://floodms.navy.lk/wlrs/hedaoya.php"),
    "Maduru Oya": ("RB 54", "oya", 54, "https://floodms.navy.lk/wlrs/maduruoya.php"),
    "Mahaweli Ganga": ("RB 60", "ganga", 60, "https://floodms.navy.lk/wlrs/mahaweliga.php"),
    "Yan Oya": ("RB 67", "oya", 67, "https://floodms.navy.lk/wlrs/yanoya.php"),
    "Maa Oya": ("RB 69", "oya", 69, "https://floodms.navy.lk/wlrs/maaoya.php"),
    "Malwathu Oya": ("RB 90", "oya", 90, "https://floodms.navy.lk/wlrs/malwathuoya.php"),
    "Mee Oya": ("RB 95", "oya", 95, "https://floodms.navy.lk/wlrs/meeoya.php"),
    "Deduru Oya": ("RB 99", "oya", 99, "https://floodms.navy.lk/wlrs/deduruoya.php"),
    "Maha Oya": ("RB 102", "oya", 102, "https://floodms.navy.lk/wlrs/mahaoya.php"),
    "Attanagalu Oya": ("RB 103", "oya", 103, "https://floodms.navy.lk/wlrs/attanagaluoya.php"),
    "Kirindi Oya": ("RB 22", "oya", 22, "https://floodms.navy.lk/wlrs/kirindioya.php"),
}


# Sample flood thresholds for major rivers (in meters)
# These are approximate and should be updated with actual data
STATION_THRESHOLDS = {
    # Kelani Ganga stations
    "NStreet": {"alert": 7.0, "minor": 7.5, "major": 8.0},
    "Hanwella": {"alert": 6.0, "minor": 6.5, "major": 7.0},
    "Glencorse": {"alert": 5.5, "minor": 6.0, "major": 6.5},
    "Kitulgala": {"alert": 4.5, "minor": 5.0, "major": 5.5},
    "Holombuwa": {"alert": 5.0, "minor": 5.5, "major": 6.0},
    "Deraniyagala": {"alert": 4.0, "minor": 4.5, "major": 5.0},
    "Norwood": {"alert": 3.5, "minor": 4.0, "major": 4.5},

    # Kalu Ganga stations
    "Putupaula": {"alert": 4.5, "minor": 5.0, "major": 5.5},
    "Ellagawa": {"alert": 5.0, "minor": 5.5, "major": 6.0},
    "Ratnapura": {"alert": 6.0, "minor": 6.5, "major": 7.0},
    "Magura": {"alert": 4.0, "minor": 4.5, "major": 5.0},
    "Kalawellawa": {"alert": 5.5, "minor": 6.0, "major": 6.5},

    # Default thresholds for other stations
    "default": {"alert": 4.0, "minor": 4.5, "major": 5.0},
}


def get_thresholds(station_name: str):
    """Get flood thresholds for a station"""
    return STATION_THRESHOLDS.get(station_name, STATION_THRESHOLDS["default"])


def calculate_status(water_level: float, alert: float, minor: float, major: float) -> str:
    """Calculate status based on water level and thresholds"""
    if water_level >= major:
        return "major_flood"
    elif water_level >= minor:
        return "minor_flood"
    elif water_level >= alert:
        return "alert"
    else:
        return "normal"


async def populate_rivers():
    """Populate rivers and stations from Navy data"""
    print("Fetching river data from Navy flood monitoring system...")

    # Fetch stations from Navy
    navy_stations = await river_fetcher.fetch_river_levels()
    print(f"Found {len(navy_stations)} stations from Navy system")

    # Group stations by river
    rivers_data = {}
    for station_data in navy_stations:
        river_name = station_data.get("river", "Unknown")
        if river_name not in rivers_data:
            rivers_data[river_name] = []
        rivers_data[river_name].append(station_data)

    print(f"Grouped into {len(rivers_data)} rivers")

    # Create database session
    db = SessionLocal()

    try:
        # Create rivers and stations
        for river_name, stations_list in rivers_data.items():
            # Get river metadata
            river_meta = RIVER_BASINS.get(river_name, (None, None, None, None))
            code, river_type, basin_number, navy_url = river_meta

            print(f"\nProcessing river: {river_name} ({code if code else 'unknown code'})")

            # Check if river exists
            river = db.query(River).filter(River.name == river_name).first()

            if not river:
                # Create new river
                river = River(
                    name=river_name,
                    code=code,
                    river_type=river_type,
                    basin_number=basin_number,
                    navy_url=navy_url,
                    created_at=datetime.utcnow()
                )
                db.add(river)
                db.flush()  # Get the river ID
                print(f"  Created river: {river_name}")
            else:
                print(f"  River already exists: {river_name}")

            # Create stations
            for station_data in stations_list:
                station_name = station_data.get("station", "Unknown")

                # Check if station exists
                station = db.query(Station).filter(
                    Station.river_id == river.id,
                    Station.name == station_name
                ).first()

                if not station:
                    # Get thresholds
                    thresholds = get_thresholds(station_name)

                    # Create new station
                    station = Station(
                        river_id=river.id,
                        name=station_name,
                        alert_level_m=thresholds["alert"],
                        minor_flood_m=thresholds["minor"],
                        major_flood_m=thresholds["major"],
                        latitude=station_data.get("latitude"),
                        longitude=station_data.get("longitude")
                    )
                    db.add(station)
                    db.flush()  # Get the station ID
                    print(f"    Created station: {station_name}")
                else:
                    print(f"    Station already exists: {station_name}")

                # Add water reading
                water_level = station_data.get("water_level_m", 0.0) or 0.0
                rainfall = station_data.get("rainfall_24h_mm", 0.0) or 0.0

                # Calculate status
                status = calculate_status(
                    water_level,
                    station.alert_level_m or 4.0,
                    station.minor_flood_m or 4.5,
                    station.major_flood_m or 5.0
                )

                # Create water reading
                reading = WaterReading(
                    station_id=station.id,
                    water_level_m=water_level,
                    rainfall_24h_mm=rainfall,
                    status=status,
                    recorded_at=datetime.utcnow()
                )
                db.add(reading)
                print(f"      Added reading: {water_level}m ({status})")

        # Commit all changes
        db.commit()
        print("\n✅ Successfully populated rivers and stations!")

        # Print summary
        total_rivers = db.query(River).count()
        total_stations = db.query(Station).count()
        total_readings = db.query(WaterReading).count()

        print(f"\nSummary:")
        print(f"  Rivers: {total_rivers}")
        print(f"  Stations: {total_stations}")
        print(f"  Readings: {total_readings}")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(populate_rivers())
