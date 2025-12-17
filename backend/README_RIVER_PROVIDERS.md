# River Provider Pattern Documentation

## Overview

The river provider pattern enables FloodWatch to support multiple river monitoring systems across different regions. Instead of hardcoding API calls to a single source (Sri Lanka Navy), the system now uses an abstract provider interface that allows different regional data sources to be plugged in.

## Architecture

### Provider Pattern Structure

```
RiverProvider (Abstract Base Class)
  ├── SriLankaNorthRiverProvider (Wraps Navy WLRS API)
  ├── IndiaWaterCommissionProvider (CWC - Central Water Commission)
  ├── TamilNaduRiverProvider (State PWD API)
  ├── KarnatakaRiverProvider (CNNL - Cauvery Neeravari Nigam Limited)
  ├── AndhraPradeshRiverProvider (State Irrigation Department)
  └── TelanganaRiverProvider (State Irrigation Department)
```

### Data Flow

```
FastAPI Router
    ↓
RiverDataService (high-level operations)
    ↓
RiverProviderFactory (provider selection)
    ↓
RiverProvider implementations (fetch from specific sources)
```

## Key Components

### 1. RiverProvider (Base Class)

Abstract interface that all providers implement.

**Location**: `backend/app/services/river_provider.py`

**Key Methods**:

```python
async def fetch_stations(bounds: Optional[BoundingBox] = None) -> List[RiverStationData]
    # Fetch all river stations, optionally filtered by geographic bounds

async def fetch_station_reading(station_id: str) -> Optional[WaterReading]
    # Fetch current water level for a specific station

async def fetch_readings_history(station_id: str, hours: int = 24) -> List[WaterReading]
    # Fetch historical readings (last N hours)

async def test_connection() -> bool
    # Test if provider can connect to its data source
```

**Standard Data Structures**:

```python
@dataclass
class RiverStationData:
    station_id: str           # Unique ID, typically: "{region}_{code}_{name}"
    river_name: str
    river_code: Optional[str]
    station_name: str
    latitude: float
    longitude: float
    catchment_area_km2: Optional[float]
    water_level_m: float
    water_level_previous_m: Optional[float]
    rainfall_24h_mm: Optional[float]
    status: str              # normal, alert, rising, falling, minor_flood, major_flood
    last_updated: datetime
    region_id: str           # Which region this station belongs to

@dataclass
class WaterReading:
    station_id: str
    water_level_m: float
    rainfall_mm: Optional[float]
    status: str
    timestamp: datetime

@dataclass
class BoundingBox:
    min_lat: float
    max_lat: float
    min_lon: float
    max_lon: float
```

### 2. RiverProviderFactory

Manages provider lifecycle and routes requests to appropriate providers.

**Location**: `backend/app/services/river_provider_factory.py`

**Key Methods**:

```python
def get_provider(provider_id: str) -> Optional[RiverProvider]
    # Get specific provider by ID

def get_providers_for_region(region_id: str) -> List[RiverProvider]
    # Get all providers for a region (srilanka, south_india, etc.)

async def get_providers_for_bounds(bounds: BoundingBox) -> List[RiverProvider]
    # Get providers that cover a geographic area

async def test_all_providers() -> Dict[str, bool]
    # Test all providers and report status

def list_providers() -> Dict[str, str]
    # List all available providers
```

**Provider Mappings**:

```python
{
    "srilanka": ["srilanka_navy"],
    "south_india": [
        "india_cwc",
        "tamil_nadu",
        "karnataka",
        "andhra_pradesh",
        "telangana"
    ]
}
```

### 3. RiverDataService

High-level service that uses providers to fetch and aggregate river data.

**Location**: `backend/app/services/river_service.py`

**Key Methods**:

```python
async def fetch_stations_by_region(region_id: str) -> List[RiverStationData]
    # Fetch all stations for a region using all its providers

async def fetch_stations_by_bounds(bounds: BoundingBox) -> List[RiverStationData]
    # Fetch stations in a geographic area

async def fetch_current_region_stations() -> List[RiverStationData]
    # Fetch stations for currently configured region

async def fetch_station_reading(region_id: str, station_id: str) -> Optional[WaterReading]
    # Get current reading for a station

async def fetch_readings_history(region_id: str, station_id: str, hours: int = 24) -> List[WaterReading]
    # Get historical readings from database (not from provider)

async def get_region_status(region_id: str) -> dict
    # Get health status of all providers in a region
```

## Usage Examples

### Example 1: Fetch all stations for Sri Lanka

```python
from app.services.river_service import get_river_data_service

service = get_river_data_service()
stations = await service.fetch_stations_by_region("srilanka")

for station in stations:
    print(f"{station.station_name}: {station.water_level_m}m ({station.status})")
```

### Example 2: Fetch stations in a geographic area

```python
from app.services.river_provider import BoundingBox
from app.services.river_service import get_river_data_service

# Define bounds for Central Province, Sri Lanka
bounds = BoundingBox(
    min_lat=6.5,
    max_lat=7.5,
    min_lon=80.5,
    max_lon=81.5
)

service = get_river_data_service()
stations = await service.fetch_stations_by_bounds(bounds)
```

### Example 3: Check provider health

```python
from app.services.river_provider_factory import get_river_provider_factory

factory = get_river_provider_factory()
status = await factory.test_all_providers()

# Results example:
# {
#     "srilanka_navy": True,
#     "india_cwc": False,
#     "tamil_nadu": False,
#     "karnataka": False,
#     ...
# }
```

### Example 4: Get region status

```python
from app.services.river_service import get_river_data_service

service = get_river_data_service()
status = await service.get_region_status("south_india")

# Returns:
# {
#     "region_id": "south_india",
#     "active": True,
#     "providers": [
#         {"name": "IndiaWaterCommissionProvider", "connected": False},
#         {"name": "TamilNaduRiverProvider", "connected": False},
#         ...
#     ]
# }
```

## Implementing a New Provider

To add support for a new river data source:

### Step 1: Create Provider Class

```python
from app.services.river_provider import RiverProvider, RiverStationData, WaterReading, BoundingBox

class MyStateRiverProvider(RiverProvider):
    def __init__(self):
        self.base_url = "https://water-api.mystate.gov.in"
        self.region_id = "south_india"

    async def fetch_stations(self, bounds: Optional[BoundingBox] = None) -> List[RiverStationData]:
        # Fetch from API
        # Parse into RiverStationData objects
        # Filter by bounds if provided
        return stations

    async def fetch_station_reading(self, station_id: str) -> Optional[WaterReading]:
        # Fetch current reading from API
        return reading

    async def fetch_readings_history(self, station_id: str, hours: int = 24) -> List[WaterReading]:
        # Fetch historical data from API
        # Note: Most sources don't provide this; return empty list
        return []

    async def test_connection(self) -> bool:
        # Simple connectivity test
        try:
            # Try fetching one station
            stations = await self.fetch_stations()
            return len(stations) > 0
        except:
            return False
```

### Step 2: Register in Factory

```python
# In river_provider_factory.py

def __init__(self):
    self._providers = {
        # ... existing providers ...
        "my_state": MyStateRiverProvider(),
    }

    self._region_providers = {
        # ... existing regions ...
        "south_india": [
            # ... existing providers ...
            "my_state",
        ],
    }
```

### Step 3: Test Connection

```python
factory = get_river_provider_factory()
providers = factory.get_providers_for_region("south_india")
# Should include MyStateRiverProvider
```

## Region Configuration Integration

Providers work together with the region configuration system:

**`regions.json`** defines:
- Region bounds
- Available data providers per region
- Alert thresholds by region
- Supported languages

**`RiverProviderFactory`** uses this to:
- Select appropriate providers for a region
- Determine which providers cover geographic bounds
- Match requested region to available sources

## Migration from Old System

### Old Approach (Hardcoded Navy API)

```python
# Old: router directly called river_fetcher
from app.services.river_fetcher import river_fetcher

@router.get("/api/rivers")
async def get_rivers():
    return await river_fetcher.fetch_river_levels()
```

### New Approach (Provider Pattern)

```python
# New: router uses service which selects providers
from app.services.river_service import get_river_data_service

@router.get("/api/rivers")
async def get_rivers(region: str = "srilanka"):
    service = get_river_data_service()
    return await service.fetch_stations_by_region(region)
```

## Caching Strategy

Current caching occurs at multiple levels:

1. **Provider Level**: `RiverFetcher` (Sri Lanka only) caches for 5 minutes
2. **Database Level**: Historical data stored in `water_readings` table
3. **API Level**: FastAPI response caching (to implement)

Future improvements:
- Unified caching layer across all providers
- Region-specific cache durations
- Cache invalidation on alert changes

## Error Handling

Providers should gracefully handle:

1. **API Unavailability**: Return cached data or empty list
2. **Parsing Errors**: Log warning, skip malformed entries
3. **Network Timeouts**: Propagate error to service layer
4. **Invalid Station IDs**: Return None for missing stations

Service layer should:

1. Try multiple providers if available
2. Log errors for monitoring
3. Return partial results rather than failing completely

## Future Enhancements

1. **Caching**: Add Redis caching layer
2. **Rate Limiting**: Implement per-provider rate limits
3. **Validation**: Add schema validation for provider responses
4. **Monitoring**: Add metrics for provider availability
5. **Fallback**: Implement automatic failover between providers
6. **Aggregation**: Merge readings from multiple sources for same station
7. **Real-time**: Add WebSocket support for live updates

## Related Files

- Region configuration: `backend/app/data/regions.json`
- Region config service: `backend/app/config/region_config.py`
- District data: `backend/app/data/south_india_districts.json`
- Database models: `backend/app/models.py`
- River router (to update): `backend/app/routers/rivers.py`
