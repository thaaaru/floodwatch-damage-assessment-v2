# API Region Migration Guide

## Overview

This document outlines the migration of all backend API endpoints to support multi-region queries. Endpoints will maintain backward compatibility (default to Sri Lanka) while adding optional `region` parameters.

## Current API Endpoints to Update

### 1. Districts API (`/api/districts`)

**Current Behavior**: Returns only Sri Lankan districts hardcoded in `districts.json`

**Changes Required**:
- Add optional `region` query parameter (default: "srilanka")
- Load appropriate districts JSON file based on region:
  - `srilanka` → `backend/app/data/districts.json` (existing)
  - `south_india` → `backend/app/data/south_india_districts.json` (new)
- Update `load_districts()` to accept region parameter

**Endpoint Changes**:
```python
# Old
GET /api/districts?hours=24

# New (backward compatible)
GET /api/districts?hours=24&region=srilanka
GET /api/districts?hours=24&region=south_india
```

**Implementation Status**: PENDING

---

### 2. Weather API (`/api/weather`)

**Current Behavior**: Uses OpenWeatherMap API for Sri Lanka districts

**Changes Required**:
- Add `region` query parameter to weather endpoints
- Filter districts by region before fetching weather
- Update alert level thresholds based on region configuration
- Regional thresholds already defined in `regions.json`

**Affected Endpoints**:
```python
GET /api/weather/all?hours=24&region=srilanka
GET /api/weather/district/{district_name}?region=srilanka
```

**Implementation Status**: PENDING

---

### 3. Early Warning API (`/early-warning`)

**Current Behavior**: Provides flood early warning data for Sri Lanka

**Changes Required**:
- Add `region` query parameter
- Filter districts by region before processing
- Use region-specific alert thresholds

**Affected Endpoints**:
```python
GET /early-warning/?region=srilanka
GET /early-warning/district/{district_name}?region=srilanka
```

**Implementation Status**: PENDING

---

### 4. Alerts API (`/api/alerts`)

**Current Behavior**: Returns alerts for all Sri Lankan districts

**Changes Required**:
- Add `region` query parameter
- Filter alerts by region

**Affected Endpoints**:
```python
GET /api/alerts?region=srilanka
GET /api/alerts/district/{district_name}?region=srilanka
```

**Implementation Status**: PENDING

---

### 5. Intel API (`/api/intel`)

**Current Behavior**: Provides intelligence data for all districts

**Changes Required**:
- Add `region` query parameter
- Filter data by region
- Calculate metrics (active alerts, population at risk) per region

**Affected Endpoints**:
```python
GET /api/intel/summary?region=srilanka
GET /api/intel/metrics?region=srilanka
GET /api/intel/district-risk-heatmap?region=srilanka
```

**Implementation Status**: PENDING

---

### 6. Flood Map API (`/api/flood-map`)

**Current Behavior**: Generates flood maps for Sri Lanka

**Changes Required**:
- Add `region` query parameter
- Use region-specific bounds and center coordinates
- Update GeoJSON generation for region

**Affected Endpoints**:
```python
GET /api/flood-map/geojson?region=srilanka
GET /api/flood-map/heatmap?region=srilanka
```

**Implementation Status**: PENDING

---

### 7. Rivers API (`/api/rivers`)

**Already Updated** ✅

- ✅ Added `region` parameter to main endpoint
- ✅ Added `/rivers/by-region/{region_id}` endpoint
- ✅ Added `/rivers/by-bounds` endpoint
- ✅ Added `/rivers/providers/status` endpoint
- ✅ Added `/rivers/region-status/{region_id}` endpoint

---

### 8. Subscribers API (`/api/subscribers`)

**Current Behavior**: Manages SMS/WhatsApp subscribers

**Changes Required**:
- Add `region` field to subscriber model (optional, for location-based preferences)
- Filter subscriptions by region in queries

**Affected Endpoints**:
```python
GET /api/subscribers?region=srilanka
GET /api/subscribers/{id}?region=srilanka
```

**Implementation Status**: PENDING (Low Priority)

---

## Implementation Pattern

All endpoints should follow this pattern:

### 1. Add Region Parameter

```python
from fastapi import APIRouter, Query

@router.get("/endpoint")
async def endpoint_name(
    region: str = Query("srilanka", description="Region ID (srilanka, south_india)")
):
    # Implementation
    pass
```

### 2. Validate Region

```python
from app.services.river_service import get_river_data_service

service = get_river_data_service()
if not await service.validate_region(region):
    raise HTTPException(status_code=400, detail=f"Invalid region: {region}")
```

### 3. Load Region-Specific Data

```python
from app.config import get_region_config

config = get_region_config()
region_data = config.get_region(region)
bounds = region_data["bounds"]
alert_thresholds = region_data["alert_thresholds"]
```

### 4. Filter by Region

```python
# For district-based endpoints
region_districts = [d for d in all_districts if d.get("region") == region]

# For geographic bounds
region_bounds = BoundingBox(
    min_lat=bounds["min_lat"],
    max_lat=bounds["max_lat"],
    min_lon=bounds["min_lon"],
    max_lon=bounds["max_lon"]
)
filtered_data = [d for d in data if bounds.contains_point(d.lat, d.lon)]
```

### 5. Return Region Info

```python
return {
    "region": region,
    "data": filtered_data,
    "timestamp": datetime.utcnow().isoformat(),
}
```

## Backward Compatibility Strategy

All changes maintain backward compatibility:

1. **Default Region**: If `region` parameter not provided, defaults to "srilanka"
2. **Existing Clients**: Continue to work without changes
3. **New Clients**: Can specify `region=south_india` for Indian data
4. **Mixed Queries**: Support both old database-based data and new provider-based data

## Priority Order

Implement in this order:

1. ✅ **Rivers API** - DONE (provider pattern already integrated)
2. **Districts API** - Load south_india_districts.json conditionally
3. **Early Warning API** - Filter by region bounds
4. **Weather API** - Filter weather by region
5. **Alerts API** - Filter alerts by region
6. **Intel API** - Aggregate metrics by region
7. **Flood Map API** - Generate maps per region
8. **Subscribers API** - Low priority, optional region field

## Testing Checklist

For each endpoint, verify:

- [ ] Default behavior works (region="srilanka")
- [ ] South India queries return appropriate data
- [ ] Invalid region returns 400 error
- [ ] Bounds filtering works correctly
- [ ] Response includes region information
- [ ] Backward compatibility maintained
- [ ] Response times acceptable

## Database Changes

**No database schema changes needed** - All endpoints currently use:
- Hardcoded JSON files (districts, data)
- External APIs (weather, alerts)
- Computed values (metrics)

For future multi-region database support:
- Add `region_id` column to relevant tables
- Create region-specific indexes
- Partition data by region

## Frontend Integration

Frontend should:

1. Detect current region (auto-detect from config or user selection)
2. Pass `region` parameter to all API calls
3. Update RegionSelector to call endpoints with region param
4. Handle region switching at global level

Example:

```javascript
// frontend/src/lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL;
const CURRENT_REGION = 'srilanka'; // Will be dynamic later

export const fetchDistricts = (region = CURRENT_REGION) => {
  return fetch(`${API_BASE}/api/districts?region=${region}`);
};
```

## Documentation Updates

Update API documentation:
- [ ] API.md with region parameter details
- [ ] Swagger/OpenAPI specs with region parameter
- [ ] Endpoint examples showing region usage
- [ ] Region list and valid values

## Files Modified

This workstream will update:

- `backend/app/routers/districts.py`
- `backend/app/routers/weather.py`
- `backend/app/routers/early_warning.py`
- `backend/app/routers/alerts.py`
- `backend/app/routers/intel.py`
- `backend/app/routers/flood_map.py`
- `backend/app/routers/rivers.py` ✅ (already updated)
- `backend/app/routers/subscribers.py` (optional)

## Next Steps

1. Pick one router to update as example (recommend districts.py)
2. Test with both regions
3. Follow same pattern for other routers
4. Update frontend to pass region parameter
5. Test end-to-end with South India dataset
