# Sentinel-2 Integration Guide

## Problem: Local Installation Issues

Installing GDAL locally requires ~5GB and has 70+ dependencies. Installation failed due to disk space during dependency download.

## Solution: Cloud-Based Tile Services

Use ready-made Sentinel-2 tile services - **no backend processing needed!**

---

## Option 1: Sentinel Hub (Recommended) ⭐

**Free Tier:** 1,000 requests/month
**Resolution:** 10m
**Coverage:** Global

### Implementation:

```typescript
// In DamageMap.tsx
const sentinelLayer = L.tileLayer(
  'https://services.sentinel-hub.com/ogc/wms/{instanceId}?' +
  'SERVICE=WMS&REQUEST=GetMap&LAYERS=TRUE_COLOR&' +
  'MAXCC=20&WIDTH=256&HEIGHT=256&FORMAT=image/png&' +
  'BBOX={bbox}&TIME=2024-01-01/2024-12-31&' +
  'CRS=EPSG:3857',
  {
    attribution: '© ESA Sentinel-2',
    maxZoom: 16
  }
);
```

**Setup:**
1. Sign up at https://www.sentinel-hub.com/
2. Create free account (no credit card)
3. Get instance ID
4. Add to frontend

---

## Option 2: Google Earth Engine (Free)

**Free:** Yes (for research/non-commercial)
**Resolution:** 10m
**Pros:** Powerful processing, composites, time series

### Implementation:

1. Sign up for Earth Engine: https://earthengine.google.com/
2. Use Earth Engine Code Editor to create tile layer
3. Publish as Web Map Tile Service (WMTS)
4. Add to Leaflet map

---

## Option 3: AWS Open Data (Free)

**Cost:** Free
**Resolution:** 10m
**Pros:** Full archive, no limits
**Cons:** Requires custom tile generation

### Implementation:

Use COG (Cloud-Optimized GeoTIFF) with frontend library:

```bash
cd frontend
npm install geotiff
```

```typescript
import GeoTIFF from 'geotiff';

// Read Sentinel-2 COG directly in browser
const tiff = await GeoTIFF.fromUrl(
  'https://sentinel-cogs.s3.amazonaws.com/sentinel-s2-l2a-cogs/...'
);
```

---

## Option 4: Pre-rendered Static Tiles (Best for Production)

**Cost:** Free (one-time generation)
**Speed:** Fastest
**Control:** Full

### Steps:

1. **Generate tiles** using one of:
   - QGIS (desktop app)
   - gdal2tiles.py (if you have GDAL elsewhere)
   - Online tile generators

2. **Upload to CDN/S3:**
   ```bash
   aws s3 sync ./tiles s3://your-bucket/sentinel2-tiles --acl public-read
   ```

3. **Serve in app:**
   ```typescript
   const tilesLayer = L.tileLayer(
     'https://your-cdn.com/sentinel2-tiles/{z}/{x}/{y}.png',
     { attribution: '© ESA Sentinel-2' }
   );
   ```

---

## Quick Start: Use Sentinel Hub Free Tier

This is the **easiest and fastest** way to get started:

### Step 1: Sign Up (2 minutes)
1. Go to https://www.sentinel-hub.com/
2. Click "Sign up" (free tier, no credit card)
3. Verify email
4. Create a configuration

### Step 2: Get Configuration ID
1. Go to Configuration Utility
2. Create new configuration
3. Copy the **Instance ID**

### Step 3: Update Frontend
```typescript
// frontend/src/components/damage-assessment/DamageMap.tsx

const sentinelBeforeLayer = L.tileLayer.wms(
  'https://services.sentinel-hub.com/ogc/wms/YOUR_INSTANCE_ID',
  {
    layers: 'TRUE_COLOR',
    time: '2023-01-01/2023-06-30',  // Before disaster
    maxcc: 20,  // Max cloud cover %
    format: 'image/png',
    transparent: true,
    attribution: '© ESA Sentinel-2'
  }
);

const sentinelAfterLayer = L.tileLayer.wms(
  'https://services.sentinel-hub.com/ogc/wms/YOUR_INSTANCE_ID',
  {
    layers: 'TRUE_COLOR',
    time: '2024-11-01/2024-12-31',  // After disaster
    maxcc: 20,
    format: 'image/png',
    transparent: true,
    attribution: '© ESA Sentinel-2'
  }
);
```

---

## Resources

**Sentinel Hub:**
- Docs: https://docs.sentinel-hub.com/
- Free tier: https://www.sentinel-hub.com/pricing/
- WMS Guide: https://docs.sentinel-hub.com/api/latest/api/ogc/

**Google Earth Engine:**
- Sign up: https://earthengine.google.com/
- Tutorials: https://developers.google.com/earth-engine/tutorials

**AWS Open Data:**
- Registry: https://registry.opendata.aws/sentinel-2/
- COG Format: https://sentinel-cogs.s3.amazonaws.com/

---

## Comparison

| Option | Setup Time | Cost | Control | Best For |
|--------|-----------|------|---------|----------|
| **Sentinel Hub** | 5 min | Free (1k/mo) | Medium | Quick start |
| **Google EE** | 30 min | Free | High | Analysis |
| **AWS COGs** | 2 hours | Free | Full | Custom |
| **Static Tiles** | 4 hours | Free | Full | Production |

**Recommendation:** Start with **Sentinel Hub** for immediate results, migrate to static tiles for production.

---

## Next Steps

1. ✅ **Sign up** for Sentinel Hub free tier
2. ✅ **Get instance ID** from configuration
3. ✅ **Update** `DamageMap.tsx` with WMS layer
4. ✅ **Test** with real Sentinel-2 imagery
5. ⏳ **Optimize** with static tiles for production

---

**Updated:** December 10, 2025
**Status:** Ready to implement cloud-based approach
