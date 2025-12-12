// SPDX-License-Identifier: Apache-2.0

/**
 * GFS Wind Data Provider
 * Uses Open-Meteo API as a JSON interface to GFS data
 * https://api.open-meteo.com/v1/gfs
 */

import type {
  WindDataProvider,
  WindDataRequest,
  WindField,
  WindPoint,
  BBox,
} from '../types';
import { windConfig, TIMEOUTS } from '../config';
import {
  uvToSpeed,
  uvToDirection,
  generateGrid,
  getGridDimensions,
  calculateWindStats,
} from '../utils';

const GFS_BASE_URL = windConfig.providers.gfs.baseUrl;

/**
 * Open-Meteo API response types
 */
interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  hourly_units?: {
    time: string;
    wind_speed_10m: string;
    wind_direction_10m: string;
  };
  hourly?: {
    time: string[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    wind_u_component_10m?: number[];
    wind_v_component_10m?: number[];
  };
  current?: {
    time: string;
    wind_speed_10m: number;
    wind_direction_10m: number;
  };
}

/**
 * GFS Provider implementation using Open-Meteo
 */
class GFSProvider implements WindDataProvider {
  name: 'gfs' = 'gfs';

  /**
   * Check if provider can serve the request
   */
  async canServe(request: WindDataRequest): Promise<boolean> {
    if (!windConfig.providers.gfs.enabled) {
      return false;
    }

    // GFS via Open-Meteo has good global coverage
    // Check if bbox is within reasonable bounds
    const [minLon, minLat, maxLon, maxLat] = request.bbox;

    // Open-Meteo supports global coverage
    if (minLat < -90 || maxLat > 90 || minLon < -180 || maxLon > 180) {
      return false;
    }

    // Check time range (GFS provides ~16 days forecast, ~5 days historical)
    if (request.time) {
      const requestTime = new Date(request.time);
      const now = new Date();
      const daysDiff = (requestTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

      if (daysDiff < -5 || daysDiff > 16) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get available time range
   */
  async getAvailableTimeRange(): Promise<{ start: string; end: string }> {
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const end = new Date(now.getTime() + 16 * 24 * 60 * 60 * 1000);  // 16 days ahead

    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }

  /**
   * Fetch wind field data using bulk API to avoid rate limits
   */
  async fetchWindField(request: WindDataRequest): Promise<WindField> {
    const { bbox, resolutionKm = 25 } = request;
    const now = new Date().toISOString();

    // Generate grid points
    const gridPoints = generateGrid(bbox, resolutionKm);
    const { width, height } = getGridDimensions(bbox, resolutionKm);

    // Use bulk API - comma-separated coordinates in single requests
    // Max ~100 points per request to avoid URL length limits
    const maxPointsPerRequest = 100;
    const points: WindPoint[] = [];

    for (let i = 0; i < gridPoints.length; i += maxPointsPerRequest) {
      const chunk = gridPoints.slice(i, i + maxPointsPerRequest);

      const latitudes = chunk.map(p => p.lat.toFixed(2)).join(',');
      const longitudes = chunk.map(p => p.lon.toFixed(2)).join(',');

      try {
        const params = new URLSearchParams({
          latitude: latitudes,
          longitude: longitudes,
          current: 'wind_speed_10m,wind_direction_10m',
          wind_speed_unit: 'ms',
          timezone: 'UTC',
        });

        const response = await fetch(`${GFS_BASE_URL}/forecast?${params}`, {
          signal: AbortSignal.timeout(15000),
          headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
          continue;
        }

        const data = await response.json();

        // Response is an array when multiple locations requested
        const results = Array.isArray(data) ? data : [data];

        for (const result of results) {
          if (!result.current) continue;

          const speed = result.current.wind_speed_10m;
          const direction = result.current.wind_direction_10m;

          if (speed == null || direction == null) continue;

          const directionRad = (direction * Math.PI) / 180;
          const u = -speed * Math.sin(directionRad);
          const v = -speed * Math.cos(directionRad);

          points.push({
            lat: result.latitude,
            lon: result.longitude,
            u,
            v,
            speed,
            directionDeg: direction,
            time: result.current.time,
            source: 'gfs',
          });
        }
      } catch (error) {
        // GFS bulk fetch error
      }

      // Small delay between chunks
      if (i + maxPointsPerRequest < gridPoints.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Calculate statistics
    const stats = calculateWindStats(points);

    return {
      metadata: {
        source: 'gfs',
        time: now,
        bbox,
        resolutionKm,
        gridWidth: width,
        gridHeight: height,
        minSpeed: stats.minSpeed,
        maxSpeed: stats.maxSpeed,
        meanSpeed: stats.meanSpeed,
        fetchedAt: now,
      },
      points,
    };
  }
}


// Export singleton instance
export const gfsProvider = new GFSProvider();
export default gfsProvider;
