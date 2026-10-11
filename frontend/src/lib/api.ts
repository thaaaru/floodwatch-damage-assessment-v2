// SPDX-License-Identifier: Apache-2.0

// API URL configuration.
// Production: requests are proxied through Next.js (`/api/proxy`) so the
// HTTPS frontend can reach the backend without mixed-content issues and
// without exposing backend hostnames/IPs to the browser.
// Development: requests go directly to NEXT_PUBLIC_API_URL (or localhost).
const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const BACKEND_BASE = PUBLIC_API_URL;

// Always proxy in production. In development, only proxy when the backend is
// non-local (i.e. NEXT_PUBLIC_API_URL points at a remote host) to avoid CORS.
const isLocalBackend = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(PUBLIC_API_URL);
const USE_PROXY = process.env.NODE_ENV === 'production' ||
                  (process.env.NODE_ENV === 'development' && !isLocalBackend);

const API_BASE = USE_PROXY ? '/api/proxy' : BACKEND_BASE;

export interface District {
  name: string;
  latitude: number;
  longitude: number;
  current_alert_level: string;
  rainfall_24h_mm: number | null;
}

export interface DangerFactor {
  factor: string;
  value: string;
  severity: 'low' | 'medium' | 'high';
}

export interface WeatherSummary {
  district: string;
  latitude: number;
  longitude: number;
  rainfall_mm: number;
  rainfall_24h_mm: number;
  rainfall_48h_mm: number;
  rainfall_72h_mm: number;
  forecast_precip_24h_mm: number;
  forecast_precip_48h_mm: number;
  precipitation_probability: number;
  temperature_c: number | null;
  humidity_percent: number | null;
  pressure_hpa: number | null;
  pressure_trend: number;
  cloud_cover_percent: number | null;
  wind_speed_kmh: number | null;
  wind_gusts_kmh: number | null;
  wind_direction: number | null;
  hours: number;
  alert_level: string;
  danger_level: 'low' | 'medium' | 'high';
  danger_score: number;
  danger_factors: DangerFactor[];
}

export interface WeatherDetail {
  district: string;
  latitude: number;
  longitude: number;
  current_rainfall_mm: number;
  rainfall_24h_mm: number;
  temperature_c: number | null;
  humidity_percent: number | null;
  forecast_24h: Array<{
    time: string;
    precipitation_mm: number;
    temperature_c: number | null;
    humidity_percent: number | null;
  }>;
  alert_level: string;
  last_updated: string;
}

export interface Alert {
  id: number;
  district: string;
  alert_level: string;
  rainfall_mm: number | null;
  source: string | null;
  message: string | null;
  sent_at: string;
}

export interface DailyForecast {
  date: string;
  day_name: string;
  total_rainfall_mm: number;
  max_precipitation_probability: number;
  avg_precipitation_probability: number;
  temp_min_c: number | null;
  temp_max_c: number | null;
  avg_humidity_percent: number | null;
  avg_cloud_cover_percent: number | null;
  max_wind_speed_kmh: number | null;
  forecast_alert_level: string;
}

export interface DistrictForecast {
  district: string;
  latitude: number;
  longitude: number;
  forecast_daily: DailyForecast[];
  forecast_precip_24h_mm: number;
  forecast_precip_48h_mm: number;
}

export interface ForecastAlert {
  district: string;
  date: string;
  day_name: string;
  alert_level: string;
  predicted_rainfall_mm: number;
  precipitation_probability: number;
  message: string;
  source: string;
}

class ApiClient {
  private getUrl(endpoint: string): string {
    if (USE_PROXY) {
      // Use the Next.js proxy to avoid CORS issues with remote backends
      return `${API_BASE}?path=${encodeURIComponent(endpoint)}`;
    }
    // Use backend directly
    return `${BACKEND_BASE}${endpoint}`;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    try {
      // Create abort controller for timeout (fallback for browsers without AbortSignal.timeout)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(this.getUrl(endpoint), {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        // Handle 502 Bad Gateway and other server errors
        if (response.status >= 500) {
          console.error(`Backend server error (${response.status}) for ${endpoint}. Backend may be temporarily unavailable.`);
          // Return empty array/object based on expected type to prevent UI crashes
          if (endpoint.includes('/alerts') || endpoint.includes('/history') || endpoint.includes('/forecast') || endpoint.includes('/weather')) {
            return [] as T;
          }
          // For irrigation and other object responses, return empty object with expected structure
          if (endpoint.includes('/irrigation')) {
            return { count: 0, summary: { total_stations: 0, normal: 0, alert: 0, minor_flood: 0, major_flood: 0, highest_risk_station: null }, stations: [] } as T;
          }
          if (endpoint.includes('/rivers')) {
            return { count: 0, summary: { normal: 0, alert: 0, rising: 0, falling: 0 }, stations: [] } as T;
          }
          return {} as T;
        }
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();

      // Additional safety check: ensure forecast endpoints return arrays
      if (endpoint.includes('/forecast') || endpoint.includes('/history') || endpoint.includes('/alerts')) {
        if (!Array.isArray(data)) {
          console.warn(`Expected array but got ${typeof data} for ${endpoint}, returning empty array`);
          return [] as T;
        }
      }

      return data;
    } catch (error: any) {
      // Handle network errors, timeouts, etc.
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        console.error(`Request timeout for ${endpoint}`);
        // Return empty result to prevent UI crashes
        if (endpoint.includes('/alerts') || endpoint.includes('/history') || endpoint.includes('/forecast')) {
          return [] as T;
        }
        if (endpoint.includes('/irrigation')) {
          return { count: 0, summary: {}, stations: [] } as T;
        }
        if (endpoint.includes('/rivers')) {
          return { count: 0, summary: {}, stations: [] } as T;
        }
        return {} as T;
      }
      // Handle fetch errors (network failures, CORS, etc.)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.error(`Network error for ${endpoint}:`, error.message);
        // Return empty result based on endpoint type
        if (endpoint.includes('/alerts') || endpoint.includes('/history') || endpoint.includes('/forecast')) {
          return [] as T;
        }
        if (endpoint.includes('/irrigation')) {
          return { count: 0, summary: {}, stations: [] } as T;
        }
        if (endpoint.includes('/rivers')) {
          return { count: 0, summary: {}, stations: [] } as T;
        }
        return {} as T;
      }
      // Re-throw other errors
      throw error;
    }
  }

  async getDistricts(): Promise<District[]> {
    return this.fetch<District[]>('/api/districts');
  }

  async getAllWeather(hours: number = 24): Promise<WeatherSummary[]> {
    return this.fetch<WeatherSummary[]>(`/api/weather/all?hours=${hours}`);
  }

  /**
   * Sri Lanka Department of Meteorology - measured rainfall from 24
   * official WMO weather stations (3-hourly bulletin). Authoritative
   * ground-truth data; no modeling, no interpolation.
   */
  async getMetStations(): Promise<MetStationsResponse> {
    return this.fetch<MetStationsResponse>('/api/weather/met-stations');
  }

  async getDistrictWeather(name: string): Promise<WeatherDetail> {
    return this.fetch<WeatherDetail>(`/api/weather/${encodeURIComponent(name)}`);
  }

  async getActiveAlerts(district?: string, level?: string): Promise<Alert[]> {
    const params = new URLSearchParams();
    if (district) params.set('district', district);
    if (level) params.set('level', level);
    const query = params.toString();
    return this.fetch<Alert[]>(`/api/alerts${query ? `?${query}` : ''}`);
  }

  async getAlertHistory(options?: {
    district?: string;
    level?: string;
    limit?: number;
  }): Promise<Alert[]> {
    const params = new URLSearchParams();
    if (options?.district) params.set('district', options.district);
    if (options?.level) params.set('level', options.level);
    if (options?.limit) params.set('limit', options.limit.toString());
    const query = params.toString();
    return this.fetch<Alert[]>(`/api/alerts/history${query ? `?${query}` : ''}`);
  }

  async healthCheck(): Promise<{ status: string; version: string }> {
    return this.fetch('/api/health');
  }

  async getAllForecast(): Promise<DistrictForecast[]> {
    return this.fetch<DistrictForecast[]>('/api/weather/forecast/all');
  }

  async getForecastAlerts(): Promise<ForecastAlert[]> {
    return this.fetch<ForecastAlert[]>('/api/alerts/forecast');
  }

  // Emergency Facilities endpoints (OpenStreetMap)
  async getFacilities(): Promise<FacilitiesResponse> {
    return this.fetch<FacilitiesResponse>('/api/intel/facilities');
  }

  async getNearbyFacilities(
    lat: number,
    lon: number,
    radiusKm: number = 10,
    limitPerType: number = 3
  ): Promise<NearbyFacilitiesResponse> {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
      radius_km: radiusKm.toString(),
      limit_per_type: limitPerType.toString(),
    });
    return this.fetch<NearbyFacilitiesResponse>(`/api/intel/facilities/nearby?${params.toString()}`);
  }

  async getNearestHospital(lat: number, lon: number): Promise<NearestHospitalResponse> {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
    });
    return this.fetch<NearestHospitalResponse>(`/api/intel/facilities/nearest-hospital?${params.toString()}`);
  }

  async refreshFacilities(): Promise<{ status: string; summary: Record<string, number>; last_updated: string | null }> {
    return this.fetch('/api/intel/facilities/refresh', { method: 'POST' });
  }

  // River water levels endpoints
  async getRiverLevels(): Promise<RiverLevelsResponse> {
    return this.fetch<RiverLevelsResponse>('/api/intel/rivers');
  }

  async refreshRiverLevels(): Promise<{ status: string; count: number; summary: Record<string, number> }> {
    return this.fetch('/api/intel/rivers/refresh', { method: 'POST' });
  }

  // Weather Alerts endpoints (WeatherAPI.com)
  async getWeatherAlerts(): Promise<WeatherAlertsResponse> {
    return this.fetch<WeatherAlertsResponse>('/api/intel/weather-alerts');
  }

  async refreshWeatherAlerts(): Promise<{ status: string; count: number; summary: Record<string, number> }> {
    return this.fetch('/api/intel/weather-alerts/refresh', { method: 'POST' });
  }

  // Marine Weather endpoints (Open-Meteo Marine)
  async getMarineConditions(): Promise<MarineResponse> {
    return this.fetch<MarineResponse>('/api/intel/marine');
  }

  async refreshMarineConditions(): Promise<{ status: string; count: number; summary: Record<string, number> }> {
    return this.fetch('/api/intel/marine/refresh', { method: 'POST' });
  }

  // Traffic Incidents endpoints (TomTom)
  async getTrafficIncidents(category?: string): Promise<TrafficResponse> {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    const query = params.toString();
    return this.fetch<TrafficResponse>(`/api/intel/traffic${query ? `?${query}` : ''}`);
  }

  async refreshTrafficIncidents(): Promise<{ status: string; count: number; summary: Record<string, number> }> {
    return this.fetch('/api/intel/traffic/refresh', { method: 'POST' });
  }

  // Irrigation/River Water Level endpoints
  async getIrrigationData(): Promise<IrrigationResponse> {
    return this.fetch<IrrigationResponse>('/api/intel/irrigation');
  }

  async getNews(): Promise<import('./newsService').NewsResponse> {
    return this.fetch('/api/news');
  }

  async getGaugeHistory(gauge: string, days: number = 7): Promise<GaugeReading[]> {
    return this.fetch<GaugeReading[]>(`/api/intel/irrigation/history/${encodeURIComponent(gauge)}?days=${days}`);
  }

  async getIrrigationByDistrict(district: string): Promise<{
    district: string;
    risk_level: string;
    risk_score: number;
    max_pct_to_flood: number;
    station_count: number;
    stations: IrrigationStation[];
  }> {
    return this.fetch(`/api/intel/irrigation/district/${encodeURIComponent(district)}`);
  }

  async refreshIrrigationData(): Promise<{ status: string; count: number; summary: Record<string, number> }> {
    return this.fetch('/api/intel/irrigation/refresh', { method: 'POST' });
  }

  // Flood Threat Assessment endpoint
  async getFloodThreat(): Promise<FloodThreatResponse> {
    return this.fetch<FloodThreatResponse>('/api/intel/flood-threat');
  }

  // Traffic Flow endpoints
  async getTrafficFlow(): Promise<TrafficFlowResponse> {
    return this.fetch<TrafficFlowResponse>('/api/intel/traffic-flow');
  }

  // All Facilities endpoint
  async getAllFacilities(): Promise<AllFacilitiesResponse> {
    return this.fetch<AllFacilitiesResponse>('/api/intel/facilities');
  }

  // Flood Pattern Analysis endpoints
  async getFloodPatterns(district: string = 'Colombo', years: number = 10): Promise<FloodPatternsResponse> {
    return this.fetch<FloodPatternsResponse>(`/api/intel/flood-patterns?district=${encodeURIComponent(district)}&years=${years}`);
  }

  async getFloodPatternDistricts(): Promise<{ districts: string[]; flood_prone_districts: string[] }> {
    return this.fetch('/api/intel/flood-patterns/districts');
  }

  // 30-year rainfall context (ERA5 via Open-Meteo, served from the DB)
  async getRainVsNormal(): Promise<RainVsNormalResponse> {
    return this.fetch<RainVsNormalResponse>('/api/rain-history/districts');
  }

  async getRainHistory(district: string): Promise<RainHistoryResponse> {
    return this.fetch<RainHistoryResponse>(`/api/rain-history/districts/${encodeURIComponent(district)}`);
  }

  async getCacheStatus(): Promise<CacheStatus> {
    return this.fetch<CacheStatus>('/api/weather/cache-status');
  }

  async getYesterdayStats(): Promise<YesterdayStats> {
    return this.fetch<YesterdayStats>('/api/weather/yesterday/stats');
  }

  // Google Floods endpoints (powered by Google Flood Forecasting API)
  async getGoogleFloodGauges(): Promise<GoogleFloodsResponse> {
    return this.fetch<GoogleFloodsResponse>('/api/google-floods/gauges');
  }

  async getGoogleFloodForecast(gaugeId: string): Promise<GoogleFloodForecast> {
    return this.fetch<GoogleFloodForecast>(`/api/google-floods/gauges/${encodeURIComponent(gaugeId)}/forecast`);
  }
}

export interface CacheStatus {
  cached_districts: number;
  last_update: string | null;
  last_attempt: string | null;
  last_attempt_ok: boolean | null;
  cache_age_seconds: number;
  is_valid: boolean;
  next_refresh_seconds: number;
}

// Yesterday's Stats types
export interface YesterdayDistrictData {
  district: string;
  rainfall_mm: number;
  temp_max_c: number | null;
  temp_min_c: number | null;
}

export interface YesterdayDistrictRain {
  district: string;
  rainfall_mm: number;
}

export interface YesterdayStats {
  date: string;
  total_districts: number;
  districts_with_rain: number;
  total_rainfall_mm: number;
  avg_rainfall_mm: number;
  max_rainfall_mm: number;
  max_rainfall_district: string | null;
  heavy_rain_districts: YesterdayDistrictRain[];
  moderate_rain_districts: YesterdayDistrictRain[];
  light_rain_districts: YesterdayDistrictRain[];
  dry_districts: string[];
  district_data: YesterdayDistrictData[];
}

// Emergency Facilities types (OpenStreetMap)
export interface EmergencyFacility {
  id: number;
  name: string;
  lat: number;
  lon: number;
  type: 'hospitals' | 'police' | 'fire_stations' | 'shelters';
  label: string;
  icon: string;
  emergency: string;
  phone: string | null;
  address: string | null;
  distance_km?: number;
}

export interface FacilitiesResponse {
  hospitals: EmergencyFacility[];
  police: EmergencyFacility[];
  fire_stations: EmergencyFacility[];
  shelters: EmergencyFacility[];
  summary: {
    hospitals: number;
    police: number;
    fire_stations: number;
    shelters: number;
  };
  last_updated: string | null;
}

export interface NearbyFacilitiesResponse {
  location: { latitude: number; longitude: number };
  radius_km: number;
  total_found: number;
  hospitals: EmergencyFacility[];
  police: EmergencyFacility[];
  fire_stations: EmergencyFacility[];
  shelters: EmergencyFacility[];
}

export interface NearestHospitalResponse {
  found: boolean;
  hospital?: EmergencyFacility;
  message?: string;
}

// River water levels types
export interface RiverStation {
  river: string;
  river_code: string;
  station: string;
  lat: number;
  lon: number;
  catchment_area_km2: number;
  water_level_m: number;
  water_level_1hr_ago_m: number;
  water_level_9am_m: number;
  rainfall_24h_mm: number;
  status: 'normal' | 'alert' | 'rising' | 'falling' | 'unknown';
  last_updated: string;
}

export interface RiverLevelsResponse {
  count: number;
  summary: {
    normal: number;
    alert: number;
    rising: number;
    falling: number;
  };
  stations: RiverStation[];
}

// Weather Alerts types (WeatherAPI.com)
export interface WeatherAlert {
  headline: string;
  severity: string;
  urgency: string;
  event: string;
  effective: string;
  expires: string;
  description: string;
  instruction: string;
  areas: string[];
  location: string;
  latitude: number;
  longitude: number;
}

export interface WeatherAlertsResponse {
  count: number;
  summary: {
    extreme: number;
    severe: number;
    moderate: number;
    minor: number;
  };
  alerts: WeatherAlert[];
}

// Marine Weather types (Open-Meteo Marine)
export interface MarineCondition {
  location: string;
  district: string;
  lat: number;
  lon: number;
  wave_height_m: number;
  wave_direction: number;
  wave_period_s: number;
  wind_wave_height_m: number;
  swell_wave_height_m: number;
  sea_surface_temp_c: number | null;
  risk_level: 'low' | 'medium' | 'high';
  risk_factors: string[];
}

export interface MarineResponse {
  count: number;
  summary: {
    total: number;
    high_risk: number;
    medium_risk: number;
    low_risk: number;
    max_wave_height: number;
  };
  conditions: MarineCondition[];
}

// Traffic Incidents types (TomTom)
export interface TrafficIncident {
  id: string;
  icon_category: number;
  category: string;
  severity: string;
  lat: number;
  lon: number;
  description: string;
  from_location: string;
  to_location: string;
  road_name: string;
  delay_seconds: number;
  delay_minutes: number;
  length_meters: number;
  length_km: number;
  start_time: string | null;
  end_time: string | null;
}

export interface TrafficResponse {
  count: number;
  summary: {
    total: number;
    road_closed: number;
    accidents: number;
    roadworks: number;
    flooding: number;
    jams: number;
    other: number;
  };
  incidents: TrafficIncident[];
}

// Sri Lanka Department of Meteorology - measured ground-gauge readings.
// 24 WMO-compliant stations, refreshed every ~3h upstream.
export interface MetStation {
  wmo_id: number;
  name: string;
  district: string;
  latitude: number;
  longitude: number;
  report_time_utc: string;          // ISO-8601
  rainfall_3h_mm: number;           // 3-hour total
  rainfall_since_830am_mm: number;  // daily accumulation from 08:30 local
  temperature_c: number | null;
  relative_humidity_pct: number | null;
  weather_type: string;             // 'rain', 'showers', 'fairday', etc.
}

export interface MetStationsResponse {
  source: string;
  source_type: 'measured';
  summary: {
    station_count: number;
    report_time_utc: string | null;
    rainfall_total_mm: number;
    wettest_station: { name: string; district: string; rainfall_since_830am_mm: number } | null;
    stations_with_rain: number;
  };
  stations: MetStation[];
}

export type GaugeStatus = 'normal' | 'alert' | 'minor' | 'major' | 'unknown';
export type GaugeTrend = 'rising' | 'falling' | 'steady' | null;

// Irrigation Dept river gauge (latest reading, served from the DB).
export interface IrrigationStation {
  station: string;
  basin: string | null;
  river: string;
  lat: number | null;
  lon: number | null;
  districts: string[];
  district_ids: string[];
  water_level_m: number | null;
  rainfall_mm: number | null;
  alert_level_m: number | null;
  minor_flood_level_m: number | null;
  major_flood_level_m: number | null;
  status: GaugeStatus;
  trend: GaugeTrend;
  stale: boolean;
  observed_at: string;
  last_updated: string;
  pct_to_alert: number | null;
  pct_to_minor_flood: number | null;
  pct_to_major_flood: number | null;
}

export interface IrrigationResponse {
  count: number;
  summary: {
    total_stations: number;
    normal: number;
    alert: number;
    minor: number;
    major: number;
    unknown: number;
    stale: number;
    highest_risk_station: IrrigationStation | null;
  };
  stations: IrrigationStation[];
}

export interface GaugeReading {
  observed_at: string;
  level_m: number | null;
}

// Flood Threat types
export interface ThreatFactor {
  factor: string;
  value: string;
  score: number;
  station?: string;
  river?: string;
}

export interface DistrictThreat {
  district: string;
  threat_score: number;
  threat_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  rainfall_score: number;
  river_score: number;
  forecast_score: number;
  factors: ThreatFactor[];
  current_alert_level: string;
  lat: number;
  lon: number;
}

export interface FloodThreatResponse {
  national_threat_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  national_threat_score: number;
  summary: {
    critical_districts: number;
    high_risk_districts: number;
    medium_risk_districts: number;
    rivers_at_major_flood: number;
    rivers_at_minor_flood: number;
    rivers_at_alert: number;
  };
  top_risk_districts: DistrictThreat[];
  all_districts: DistrictThreat[];
  highest_risk_river: IrrigationStation | null;
  analyzed_at: string;
}

// Traffic Flow types
export interface TrafficFlowLocation {
  name: string;
  lat: number;
  lon: number;
  current_speed_kmh: number;
  free_flow_speed_kmh: number;
  speed_ratio: number;
  jam_factor?: number;
  congestion: 'free' | 'light' | 'moderate' | 'heavy' | 'severe' | 'closed' | 'unknown';
  congestion_color: string;
  delay_seconds?: number;
  delay_minutes?: number;
  road_closure?: boolean;
  road_names?: string[];
  segment_count?: number;
  confidence?: number;
  source?: string;
}

export interface TrafficFlowSummary {
  total_locations: number;
  free_flow: number;
  light: number;
  moderate: number;
  heavy: number;
  severe: number;
  closed?: number;
  avg_speed_kmh: number;
  avg_jam_factor?: number;
  total_delay_minutes?: number;
}

export interface TrafficFlowResponse {
  total_locations: number;
  combined_summary: {
    free_flow: number;
    light: number;
    moderate: number;
    heavy: number;
    severe: number;
    avg_speed_kmh: number;
  };
  here_summary: TrafficFlowSummary;
  tomtom_summary: TrafficFlowSummary;
  here_locations: TrafficFlowLocation[];
  tomtom_locations: TrafficFlowLocation[];
  congested_roads: TrafficFlowLocation[];
}

// All Facilities types
export interface AllFacilitiesResponse {
  hospitals: EmergencyFacility[];
  police: EmergencyFacility[];
  fire_stations: EmergencyFacility[];
  shelters: EmergencyFacility[];
  summary: {
    hospitals: number;
    police: number;
    fire_stations: number;
    shelters: number;
  };
  last_updated: string | null;
}

// Flood Pattern Analysis types
export interface FloodRiskMonth {
  month: number;
  month_name: string;
  flood_risk: 'HIGH' | 'MEDIUM' | 'LOW';
  risk_score: number;
  avg_rainfall_mm: number;
  max_daily_mm: number;
}

export interface SeasonalPattern {
  name: string;
  avg_daily_mm: number;
  total_days: number;
  rainy_days: number;
  heavy_rain_days: number;
  extreme_rain_days: number;
  max_daily_mm: number;
}

export interface ExtremeEvent {
  date: string;
  precipitation_mm: number;
  month: number;
  year: number;
}

export interface YearlyTrend {
  year: number;
  total_rainfall_mm: number;
  rainy_days: number;
  extreme_days: number;
  max_daily_mm: number;
}

export interface DecadeStats {
  years: string;
  avg_annual_rainfall_mm: number;
  avg_rainy_days: number;
  avg_extreme_days: number;
  total_extreme_days: number;
  max_daily_mm: number;
  wettest_year: YearlyTrend;
  driest_year: YearlyTrend;
}

export interface ClimateChange {
  metric: string;
  first_decade: string;
  last_decade: string;
  change: string;
  change_pct: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface MovingAverage {
  year: number;
  avg_rainfall_mm: number;
  avg_extreme_days: number;
}

export interface ExtremeByDecade {
  years: string;
  count: number;
  events: { date: string; precipitation_mm: number }[];
}

export interface ClimateChangeAnalysis {
  period_analyzed: string;
  decades: {
    first: DecadeStats | null;
    second: DecadeStats | null;
    third: DecadeStats | null;
  };
  changes: ClimateChange[];
  moving_average_5yr: MovingAverage[];
  extreme_events_by_decade: {
    decade1: ExtremeByDecade;
    decade2: ExtremeByDecade;
    decade3: ExtremeByDecade;
  };
  key_findings: string[];
}

export interface FloodPatternsResponse {
  district: string;
  coordinates: { lat: number; lon: number };
  period: string;
  total_days_analyzed: number;
  summary: {
    total_rainfall_mm: number;
    avg_annual_rainfall_mm: number;
    avg_daily_rainfall_mm: number;
    max_daily_rainfall_mm: number;
    rainy_days_total: number;
    heavy_rain_days: number;
    extreme_rain_days: number;
  };
  flood_risk_months: FloodRiskMonth[];
  seasonal_patterns: Record<string, SeasonalPattern>;
  extreme_events: ExtremeEvent[];
  yearly_trends: YearlyTrend[];
  climate_change?: ClimateChangeAnalysis;
  analyzed_at: string;
}

// 30-year rainfall context (ERA5 reanalysis via Open-Meteo): model data, not rain gauges
export interface RainVsNormal {
  district: string;
  lat: number;
  lon: number;
  as_of: string | null; // latest ERA5 day stored (about 5 days behind)
  month?: number;
  mtd_mm?: number;
  normal_to_date_mm?: number | null;
  pct_of_normal?: number | null;
}

export interface RainVsNormalResponse {
  source: string;
  districts: RainVsNormal[];
}

export interface RainTrend {
  slope_mm_per_year: number;
  ci_low: number;
  ci_high: number;
  intercept: number;
  significant: boolean;
}

export interface RainHistoryResponse extends Omit<RainVsNormal, 'lat' | 'lon'> {
  source: string;
  monthly_normals_mm?: (number | null)[];
  wettest_days?: { date: string; mm: number }[];
  annual_totals?: { year: number; mm: number }[];
  trend?: RainTrend | null;
  first_date?: string;
}

export const api = new ApiClient();
export default api;

// ------------------------------------------------------------------
// Google Flood Hub types
// ------------------------------------------------------------------

export type FloodSeverity =
  | 'EXTREME'
  | 'SEVERE'
  | 'WARNING'
  | 'NO_KNOWN_FLOODING'
  | 'UNKNOWN'
  | string; // future-proof: API may add new values.

export interface GoogleFloodGauge {
  gauge_id: string;
  severity: FloodSeverity;
  river: string | null;
  site_name: string | null;
  latitude: number | null;
  longitude: number | null;
  current_value: number | null;
  current_value_unit: string | null;
  thresholds: {
    warning: number | null;
    danger: number | null;
    extreme: number | null;
  };
  issued_time: string | null;
  source_url: string | null;
  raw_status?: unknown;
  raw_meta?: unknown;
}

export interface GoogleFloodsResponse {
  fetched_at: string;
  cache_ttl_minutes: number;
  gauge_count: number;
  severity_breakdown: Record<string, number>;
  gauges: GoogleFloodGauge[];
  source: string;
  license_note: string;
}

// Forecast shape mirrors the upstream queryGaugeForecast response.
// Stored loosely typed: the page just iterates whatever timeseries it returns.
export interface GoogleFloodForecast {
  gauge_id?: string;
  forecastTimeSeries?: unknown;
  [key: string]: unknown;
}
