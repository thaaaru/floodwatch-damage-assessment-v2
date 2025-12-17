# FloodWatch Regional Configuration System

This document describes the multi-region configuration system for FloodWatch, which allows the platform to support different geographic regions with region-specific settings, data providers, and alert thresholds.

## Overview

The regional configuration system enables FloodWatch to:
- Support multiple geographic regions (currently Sri Lanka and South India)
- Configure region-specific alert thresholds based on local rainfall patterns
- Manage different data providers per region
- Support multiple languages and localization
- Configure region-specific emergency services and SMS gateways
- Define geographic boundaries and center points for mapping

## Architecture

### Components

1. **regions.json** - Main configuration file with all region definitions
2. **RegionConfig Class** - Python module for accessing region configuration
3. **Settings Integration** - Integration with the main application settings
4. **District Data Files** - Region-specific district/location data

### File Locations

```
backend/
├── app/
│   ├── config/
│   │   └── region_config.py          # RegionConfig class
│   ├── data/
│   │   ├── regions.json               # Region definitions
│   │   ├── districts.json             # Sri Lanka districts
│   │   └── south_india_districts.json # South India districts
│   └── config.py                      # Main settings with region integration
└── README_REGIONS.md                  # This file
```

## Region Configuration Reference

### Region Structure

Each region in `regions.json` has the following structure:

```json
{
  "id": "srilanka",                    // Unique region identifier
  "name": "Sri Lanka",                 // Region name
  "displayName": "Sri Lanka",          // Display name for UI
  "code": "SL",                        // Two-letter region code
  "bounds": {                          // Geographic bounding box
    "minLat": 5.7,
    "maxLat": 10.0,
    "minLon": 79.4,
    "maxLon": 82.1
  },
  "center": {                          // Map center coordinates
    "lat": 7.8736,
    "lon": 80.7713
  },
  "languages": ["en", "si", "ta"],     // Supported languages
  "timeZone": "Asia/Colombo",          // Region timezone
  "alertThresholds": {                 // Rainfall alert thresholds (mm)
    "green": { "minRain": 0, "maxRain": 50 },
    "yellow": { "minRain": 50, "maxRain": 100 },
    "orange": { "minRain": 100, "maxRain": 150 },
    "red": { "minRain": 150, "maxRain": 999 }
  },
  "districts": 25,                     // Number of districts/areas
  "dataProviders": {                   // Configured data sources
    "weather": ["open_meteo", "here_weather"],
    "rivers": ["srilanka_navy"],
    "emergencyServices": ["colombo_disaster", "police_lk"]
  },
  "smsGateway": "twilio",             // SMS gateway provider
  "currency": "LKR",                  // Local currency code
  "active": true                      // Whether region is active
}
```

### Alert Thresholds

Alert thresholds are region-specific because rainfall patterns vary by geography:

**Sri Lanka:**
- Green: 0-50mm (Normal)
- Yellow: 50-100mm (Light Alert)
- Orange: 100-150mm (Moderate Alert)
- Red: 150+mm (Severe Alert)

**South India:**
- Green: 0-75mm (Normal)
- Yellow: 75-125mm (Light Alert)
- Orange: 125-200mm (Moderate Alert)
- Red: 200+mm (Severe Alert)

Note: South India has higher thresholds due to different monsoon patterns.

### Data Providers

Each region can configure different data providers:

**Weather Providers:**
- `open_meteo` - Open-Meteo API (global)
- `here_weather` - HERE Weather API
- `imd` - India Meteorological Department

**River Data Providers:**
- `srilanka_navy` - Sri Lanka Navy water levels
- `central_water_commission` - India's CWC
- `tamil_nadu_wr` - Tamil Nadu Water Resources
- `karnataka_cauvery` - Karnataka Cauvery Monitoring
- `andhra_pradesh` - AP Water Resources
- `telangana` - Telangana Water Resources

**Emergency Services:**
- `colombo_disaster` - Colombo Disaster Management
- `police_lk` - Sri Lanka Police
- `ndma` - National Disaster Management Authority (India)
- `sdma_tn` - Tamil Nadu State DMA
- `sdma_ka` - Karnataka State DMA

## Using the RegionConfig Class

### Basic Usage

```python
from app.config.region_config import get_region_config

# Get the global region config instance
region_config = get_region_config()

# Get a specific region
srilanka = region_config.get_region('srilanka')
print(srilanka['name'])  # "Sri Lanka"

# Get all regions
all_regions = region_config.get_all_regions()

# Get only active regions
active_regions = region_config.get_active_regions()
```

### Alert Thresholds

```python
# Determine alert level for rainfall
alert_level = region_config.get_alert_threshold('srilanka', 120.5)
# Returns: 'orange' (100-150mm range)

# Get all thresholds for a region
thresholds = region_config.get_alert_thresholds('south_india')
# Returns: {'green': {...}, 'yellow': {...}, ...}
```

### Geographic Data

```python
# Get region bounds
bounds = region_config.get_bounds('srilanka')
# Returns: {'minLat': 5.7, 'maxLat': 10.0, 'minLon': 79.4, 'maxLon': 82.1}

# Get center coordinates
center = region_config.get_center('srilanka')
# Returns: {'lat': 7.8736, 'lon': 80.7713}
```

### Data Providers

```python
# Get all data providers
providers = region_config.get_data_providers('srilanka')
# Returns: {'weather': [...], 'rivers': [...], 'emergencyServices': [...]}

# Get specific provider type
weather_providers = region_config.get_data_providers('srilanka', 'weather')
# Returns: ['open_meteo', 'here_weather']
```

### Regional Settings

```python
# Get supported languages
languages = region_config.get_languages('south_india')
# Returns: ['en', 'hi', 'ta', 'ka', 'te']

# Get timezone
timezone = region_config.get_timezone('srilanka')
# Returns: 'Asia/Colombo'

# Get currency
currency = region_config.get_currency('south_india')
# Returns: 'INR'

# Get SMS gateway
gateway = region_config.get_sms_gateway('srilanka')
# Returns: 'twilio'
```

### Validation

```python
# Check if region is valid
is_valid = region_config.is_valid_region('srilanka')
# Returns: True

# Check if region is active
is_active = region_config.is_region_active('south_india')
# Returns: False (currently inactive)
```

## Integration with Settings

The main `Settings` class in `config.py` includes region-aware methods:

```python
from app.config import get_settings

settings = get_settings()

# Set current region (via environment variable CURRENT_REGION)
# Default is 'srilanka'

# Get current region data
region = settings.get_region_data()

# Get alert level for current region
alert = settings.get_region_alert_threshold(rainfall_mm=125.0)

# Get region bounds
bounds = settings.get_region_bounds()

# Get region center
center = settings.get_region_center()

# Get data providers
providers = settings.get_region_data_providers('weather')

# Get all/active regions
all_regions = settings.get_all_regions()
active_regions = settings.get_active_regions()
```

## Environment Variables

Add to your `.env` file:

```bash
# Set the current active region
CURRENT_REGION=srilanka

# Options: srilanka, south_india
```

## Adding a New Region

To add a new region to FloodWatch:

### 1. Update regions.json

Add a new region entry to `backend/app/data/regions.json`:

```json
{
  "id": "new_region",
  "name": "New Region",
  "displayName": "Display Name",
  "code": "NR",
  "bounds": {
    "minLat": 0.0,
    "maxLat": 10.0,
    "minLon": 70.0,
    "maxLon": 80.0
  },
  "center": {
    "lat": 5.0,
    "lon": 75.0
  },
  "languages": ["en"],
  "timeZone": "Asia/Kolkata",
  "alertThresholds": {
    "green": { "minRain": 0, "maxRain": 50 },
    "yellow": { "minRain": 50, "maxRain": 100 },
    "orange": { "minRain": 100, "maxRain": 150 },
    "red": { "minRain": 150, "maxRain": 999 }
  },
  "districts": 20,
  "dataProviders": {
    "weather": ["open_meteo"],
    "rivers": [],
    "emergencyServices": []
  },
  "smsGateway": "twilio",
  "currency": "USD",
  "active": true
}
```

### 2. Create District Data File

Create a new file `backend/app/data/new_region_districts.json`:

```json
{
  "districts": [
    {
      "id": "region_district_name",
      "name": "District Name",
      "state": "State/Province",
      "region": "new_region",
      "latitude": 5.0,
      "longitude": 75.0,
      "population": 1000000,
      "alert_threshold_low": 50,
      "alert_threshold_high": 100,
      "river_names": ["River Name"],
      "language_names": {
        "en": "English Name"
      }
    }
  ],
  "bounding_box": {
    "min_lat": 0.0,
    "max_lat": 10.0,
    "min_lon": 70.0,
    "max_lon": 80.0
  }
}
```

### 3. Configure Data Providers

Ensure the data providers listed in the region configuration are implemented:

- Add API integration for new weather providers
- Add river monitoring station integrations
- Configure emergency service endpoints
- Set up SMS gateway credentials

### 4. Test the Configuration

```python
from app.config.region_config import get_region_config

config = get_region_config()

# Reload to pick up changes
config.reload()

# Test the new region
region = config.get_region('new_region')
assert region is not None
assert config.is_valid_region('new_region')
```

### 5. Update API Endpoints

Update any API endpoints that need region-specific behavior:

```python
@app.get("/api/districts")
async def get_districts(region: str = "srilanka"):
    region_config = get_region_config()
    if not region_config.is_valid_region(region):
        raise HTTPException(status_code=400, detail="Invalid region")

    # Load appropriate district file
    # Return region-specific districts
```

## Switching Between Regions

### Via Environment Variable

The simplest way to switch regions:

```bash
# In .env file
CURRENT_REGION=south_india
```

Then restart the application.

### Programmatically

```python
from app.config import get_settings

settings = get_settings()

# Note: Pydantic settings are immutable after creation
# To change regions, you need to set the environment variable
# and create a new Settings instance, or clear the lru_cache

import os
from functools import lru_cache

os.environ['CURRENT_REGION'] = 'south_india'

# Clear the cached settings
get_settings.cache_clear()

# Get new settings with updated region
settings = get_settings()
```

### Per-Request Region Selection

For multi-region APIs where the region is selected per request:

```python
from app.config.region_config import get_region_config

@app.get("/api/weather/{region}")
async def get_weather(region: str):
    region_config = get_region_config()

    # Validate region
    if not region_config.is_valid_region(region):
        raise HTTPException(status_code=400, detail=f"Invalid region: {region}")

    # Get region-specific configuration
    region_data = region_config.get_region(region)
    providers = region_config.get_data_providers(region, 'weather')

    # Fetch weather data using region-specific providers
    # ...
```

## Best Practices

### 1. Always Validate Region IDs

```python
# Bad
region = region_config.get_region(user_input)

# Good
if region_config.is_valid_region(user_input):
    region = region_config.get_region(user_input)
else:
    # Handle invalid region
```

### 2. Use Region-Specific Thresholds

```python
# Bad - using hardcoded thresholds
if rainfall > 100:
    alert_level = 'orange'

# Good - using region-specific thresholds
alert_level = region_config.get_alert_threshold(region_id, rainfall)
```

### 3. Handle Inactive Regions

```python
# Check if region is active before processing
if not region_config.is_region_active(region_id):
    raise HTTPException(
        status_code=400,
        detail=f"Region {region_id} is not currently active"
    )
```

### 4. Cache Region Data When Appropriate

```python
from functools import lru_cache

@lru_cache(maxsize=10)
def get_cached_region_providers(region_id: str, provider_type: str):
    region_config = get_region_config()
    return region_config.get_data_providers(region_id, provider_type)
```

### 5. Document Region-Specific Behavior

When implementing region-specific features, document them clearly:

```python
def calculate_flood_risk(region_id: str, rainfall_mm: float) -> str:
    """
    Calculate flood risk for a region.

    Note: Uses region-specific alert thresholds. Sri Lanka and South India
    have different threshold values due to different monsoon patterns.

    Args:
        region_id: Region identifier
        rainfall_mm: 24-hour rainfall in millimeters

    Returns:
        Risk level: 'green', 'yellow', 'orange', or 'red'
    """
    region_config = get_region_config()
    return region_config.get_alert_threshold(region_id, rainfall_mm)
```

## Troubleshooting

### Region Not Found Error

```
ValueError: Invalid region_id: xyz. Available regions: srilanka, south_india
```

**Solution:** Check that the region ID is correct and exists in `regions.json`.

### Configuration File Not Found

```
FileNotFoundError: Region configuration file not found: /path/to/regions.json
```

**Solution:** Ensure `backend/app/data/regions.json` exists. Check file permissions.

### Invalid JSON

```
ValueError: Invalid JSON in region configuration
```

**Solution:** Validate `regions.json` syntax. Use a JSON validator or `python -m json.tool regions.json`.

### Reload Configuration

If you've updated `regions.json` and changes aren't reflected:

```python
from app.config.region_config import get_region_config

config = get_region_config()
config.reload()  # Reload from file
```

## Future Enhancements

Potential improvements to the region system:

1. **Database Storage** - Move region configuration from JSON to database
2. **Dynamic Regions** - Allow adding regions without code deployment
3. **Region Hierarchies** - Support sub-regions (states, provinces)
4. **Multi-Region Queries** - Query data across multiple regions
5. **Region-Specific Models** - Different ML models per region
6. **Automated Data Provider Discovery** - Auto-detect available providers
7. **Region Analytics** - Track usage and alerts by region
8. **Region-Specific UI Themes** - Customized branding per region

## Support

For questions or issues with regional configuration:

1. Check this documentation
2. Review `regions.json` for configuration examples
3. Examine `region_config.py` for available methods
4. Check application logs for region-related errors

## Contributing

When contributing region-specific features:

1. Ensure backward compatibility with existing regions
2. Add tests for new region-specific functionality
3. Update this documentation
4. Validate JSON configuration files
5. Test with multiple regions enabled
