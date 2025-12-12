// SPDX-License-Identifier: Apache-2.0

/**
 * OpenWeatherMap Wind Data Provider
 * Uses OpenWeatherMap One Call API as a backup to Open-Meteo
 * Free tier: 60 calls/min, 1,000,000 calls/month
 */

import type {
  WindDataProvider,
  WindDataRequest,
  WindField,
  WindPoint,
  BBox,
} from '../types';
import { windConfig } from '../config';
import {
  generateGrid,
  getGridDimensions,
  calculateWindStats,
} from '../utils';

const OWM_API_KEY = process.env.NEXT_PUBLIC_OPENWEATHERMAP_API_KEY || '';
const OWM_BASE_URL = 'https://api.openweathermap.org/data/2.5';

/**
 * OpenWeatherMap API response types
 */
interface OWMCurrentWeather {
  coord: { lon: number; lat: number };
  wind: {
    speed: number;  // m/s
    deg: number;    // degrees
    gust?: number;
  };
  dt: number;
}

/**
 * OpenWeatherMap Provider implementation
 * Uses the free tier current weather API
 */
class OpenWeatherProvider implements WindDataProvider {
  name: 'openweather' = 'openweather';

  /**
   * Check if provider can serve the request
   */
  async canServe(request: WindDataRequest): Promise<boolean> {
    // Only serve if we have an API key
    if (!OWM_API_KEY) {
      return false;
    }

    const [minLon, minLat, maxLon, maxLat] = request.bbox;

    // OpenWeatherMap has global coverage
    if (minLat < -90 || maxLat > 90 || minLon < -180 || maxLon > 180) {
      return false;
    }

    return true;
  }

  /**
   * Get available time range
   */
  async getAvailableTimeRange(): Promise<{ start: string; end: string }> {
    const now = new Date();
    return {
      start: now.toISOString(),
      end: now.toISOString(),
    };
  }

  /**
   * Fetch wind field data
   * Uses batching to stay within rate limits
   */
  async fetchWindField(request: WindDataRequest): Promise<WindField> {
    const { bbox, resolutionKm = 50 } = request;
    const now = new Date().toISOString();

    // Generate grid points with larger spacing to reduce API calls
    const gridPoints = generateGrid(bbox, resolutionKm);
    const { width, height } = getGridDimensions(bbox, resolutionKm);

    // Batch requests to respect rate limit (60/min)
    const batchSize = 10; // 10 concurrent requests at a time
    const delayBetweenBatches = 200; // ms

    const points: WindPoint[] = [];

    for (let i = 0; i < gridPoints.length; i += batchSize) {
      const batch = gridPoints.slice(i, i + batchSize);

      const batchPromises = batch.map(async (point) => {
        try {
          const url = `${OWM_BASE_URL}/weather?lat=${point.lat.toFixed(2)}&lon=${point.lon.toFixed(2)}&appid=${OWM_API_KEY}&units=metric`;

          const response = await fetch(url, {
            signal: AbortSignal.timeout(10000),
          });

          if (!response.ok) {
            return null;
          }

          const data: OWMCurrentWeather = await response.json();

          if (!data.wind) return null;

          const speed = data.wind.speed;
          const direction = data.wind.deg;

          // Convert direction to U/V components
          const directionRad = (direction * Math.PI) / 180;
          const u = -speed * Math.sin(directionRad);
          const v = -speed * Math.cos(directionRad);

          return {
            lat: data.coord.lat,
            lon: data.coord.lon,
            u,
            v,
            speed,
            directionDeg: direction,
            time: new Date(data.dt * 1000).toISOString(),
            source: 'openweather' as const,
          };
        } catch (error) {
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      for (const result of batchResults) {
        if (result !== null) {
          points.push(result as WindPoint);
        }
      }

      // Delay between batches
      if (i + batchSize < gridPoints.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    const stats = calculateWindStats(points);

    return {
      metadata: {
        source: 'openweather',
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
export const openWeatherProvider = new OpenWeatherProvider();
export default openWeatherProvider;
