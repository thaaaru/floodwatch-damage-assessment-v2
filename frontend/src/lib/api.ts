// SPDX-License-Identifier: Apache-2.0

// Production API URL - use environment variable or fallback
const PRODUCTION_API = process.env.NEXT_PUBLIC_PROD_API_URL || 'https://api.hackandbuild.dev';

// Use production API in production, localhost in development
const BACKEND_BASE = process.env.NODE_ENV === 'production'
  ? PRODUCTION_API
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');

// Use proxy in development to avoid CORS issues with remote backends
// Only needed when backend is a remote IP (198.199.76.11) in development
const USE_PROXY = process.env.NODE_ENV === 'development' &&
                  process.env.NEXT_PUBLIC_API_URL?.includes('198.199.76.11');

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

export interface SubscribeRequest {
  phone_number: string;
  districts: string[];
  language: string;
}

export interface SubscribeResponse {
  id: number;
  phone_number: string;
  districts: string[];
  language: string;
  active: boolean;
  created_at: string;
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
          if (endpoint.includes('/early-warning')) {
            return { total_alerts: 0, alerts: [] } as T;
          }
          return {} as T;
        }
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      return response.json();
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

  async subscribe(data: SubscribeRequest): Promise<SubscribeResponse> {
    return this.fetch<SubscribeResponse>('/api/subscribe', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async unsubscribe(phone_number: string): Promise<{ message: string }> {
    return this.fetch('/api/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ phone_number }),
    });
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

  // Intelligence endpoints
  async getIntelPriorities(limit: number = 50, district?: string, urgency?: string): Promise<IntelPrioritiesResponse> {
    const params = new URLSearchParams();
    params.set('limit', limit.toString());
    if (district) params.set('district', district);
    if (urgency) params.set('urgency', urgency);
    return this.fetch<IntelPrioritiesResponse>(`/api/intel/priorities?${params.toString()}`);
  }

  async getIntelClusters(district?: string): Promise<IntelClustersResponse> {
    const params = new URLSearchParams();
    if (district) params.set('district', district);
    const query = params.toString();
    return this.fetch<IntelClustersResponse>(`/api/intel/clusters${query ? `?${query}` : ''}`);
  }

  async getIntelSummary(): Promise<IntelSummary> {
    return this.fetch<IntelSummary>('/api/intel/summary');
  }

  async getIntelActions(): Promise<IntelActionsResponse> {
    return this.fetch<IntelActionsResponse>('/api/intel/actions');
  }

  async refreshIntel(): Promise<{ status: string; summary: IntelSummary }> {
    return this.fetch('/api/intel/refresh', { method: 'POST' });
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

  // Environmental Data endpoints
  async getEnvironmentalData(startYear: number = 1994, endYear: number = 2024): Promise<EnvironmentalDataResponse> {
    return this.fetch<EnvironmentalDataResponse>(`/api/intel/environmental?start_year=${startYear}&end_year=${endYear}`);
  }

  async getFloodCorrelation(): Promise<FloodCorrelationResponse> {
    return this.fetch<FloodCorrelationResponse>('/api/intel/environmental/flood-correlation');
  }

  // Early Warning System endpoints (OpenWeatherMap One Call API 3.0)
  async getEarlyWarning(): Promise<EarlyWarningResponse> {
    return this.fetch<EarlyWarningResponse>('/early-warning/');
  }

  async getEarlyWarningDistrict(district: string): Promise<EarlyWarningDistrict> {
    return this.fetch<EarlyWarningDistrict>(`/early-warning/district/${encodeURIComponent(district)}`);
  }

  async getEarlyWarningAlerts(): Promise<EarlyWarningAlertsResponse> {
    return this.fetch<EarlyWarningAlertsResponse>('/early-warning/alerts');
  }

  async getEarlyWarningHighRisk(): Promise<EarlyWarningHighRiskResponse> {
    return this.fetch<EarlyWarningHighRiskResponse>('/early-warning/high-risk');
  }

  async getEarlyWarningDailyForecast(days: number = 8): Promise<EarlyWarningDailyForecastResponse> {
    return this.fetch<EarlyWarningDailyForecastResponse>(`/early-warning/forecast/daily?days=${days}`);
  }

  async getEarlyWarningHourlyForecast(district: string, hours: number = 48): Promise<EarlyWarningHourlyForecastResponse> {
    return this.fetch<EarlyWarningHourlyForecastResponse>(`/early-warning/forecast/hourly/${encodeURIComponent(district)}?hours=${hours}`);
  }

  async getCacheStatus(): Promise<CacheStatus> {
    return this.fetch<CacheStatus>('/api/weather/cache-status');
  }

  async getYesterdayStats(): Promise<YesterdayStats> {
    return this.fetch<YesterdayStats>('/api/weather/yesterday/stats');
  }
}

export interface CacheStatus {
  cached_districts: number;
  last_update: string;
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

// Intelligence types
export interface SOSReport {
  id: number;
  reference: string;
  name: string;
  phone: string;
  alternate_phone: string | null;
  address: string;
  landmark: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
  emergency_type: string;
  number_of_people: number;
  water_level: string;
  building_type: string | null;
  floor_level: string | null;
  safe_for_hours: number | null;
  description: string;
  title: string;
  has_children: boolean;
  has_elderly: boolean;
  has_disabled: boolean;
  has_medical_emergency: boolean;
  has_food: boolean;
  has_water: boolean;
  has_power: boolean;
  battery_percent: number | null;
  status: string;
  priority: string;
  source: string;
  rescue_team: string | null;
  verified_by: string | null;
  acknowledged_at: string | null;
  rescued_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  urgency_score: number;
  urgency_tier: string;
  score_factors: string[];
  weather_risk: number;
  elevation_m: number | null;
  elevation_risk: number;
  elevation_risk_level: string;
}

export interface IntelPrioritiesResponse {
  count: number;
  reports: SOSReport[];
}

export interface IntelCluster {
  cluster_id: string;
  name: string;
  districts: string[];
  report_count: number;
  total_people: number;
  total_urgency: number;
  avg_urgency: number;
  critical_count: number;
  high_count: number;
  centroid: {
    latitude: number | null;
    longitude: number | null;
  };
  vulnerabilities: {
    medical_emergency: boolean;
    elderly: boolean;
    children: boolean;
    disabled: boolean;
  };
  reports: number[];
  top_reports: SOSReport[];
}

export interface IntelClustersResponse {
  count: number;
  clusters: IntelCluster[];
}

export interface DistrictIntelStats {
  district: string;
  count: number;
  total_people: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  avg_urgency: number;
  needs_food: number;
  needs_water: number;
  has_medical: number;
  forecast_rain_24h: number;
  current_alert_level: string;
}

export interface IntelSummary {
  total_reports: number;
  total_people_affected: number;
  total_clusters: number;
  urgency_breakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  resource_needs: {
    needs_food: number;
    needs_water: number;
    medical_emergencies: number;
  };
  vulnerability_counts: {
    with_elderly: number;
    with_children: number;
    with_disabled: number;
  };
  most_affected_districts: DistrictIntelStats[];
  districts: Record<string, DistrictIntelStats>;
  analyzed_at: string;
}

export interface IntelAction {
  priority: number;
  action: string;
  description: string;
  targets: Array<Record<string, unknown>>;
}

export interface IntelActionsResponse {
  generated_at: string;
  total_actions: number;
  actions: IntelAction[];
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

// Irrigation/River Water Level types
export interface IrrigationStation {
  station: string;
  river: string;
  lat: number;
  lon: number;
  districts: string[];
  district_ids: string[];
  water_level_m: number;
  alert_level_m: number;
  minor_flood_level_m: number;
  major_flood_level_m: number;
  status: 'normal' | 'alert' | 'minor_flood' | 'major_flood';
  pct_to_alert: number;
  pct_to_minor_flood: number;
  pct_to_major_flood: number;
  last_updated: string;
}

export interface IrrigationResponse {
  count: number;
  summary: {
    total_stations: number;
    normal: number;
    alert: number;
    minor_flood: number;
    major_flood: number;
    highest_risk_station: IrrigationStation | null;
  };
  stations: IrrigationStation[];
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

// Environmental Data types
export interface EnvironmentalTrendAnalysis {
  first_year: number;
  last_year: number;
  first_value: number;
  last_value: number;
  absolute_change: number;
  percent_change: number;
  annual_rate: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  min_value: number;
  max_value: number;
  avg_value: number;
  min_year: number;
  max_year: number;
}

export interface EnvironmentalDataPoint {
  year: number;
  value: number;
}

export interface EnvironmentalIndicator {
  data: EnvironmentalDataPoint[];
  unit: string;
  analysis: EnvironmentalTrendAnalysis;
}

export interface FloodRiskFactor {
  factor: string;
  description: string;
  impact: 'High' | 'Medium' | 'Low';
  explanation: string;
  risk_contribution: number;
}

export interface FloodRiskFactors {
  overall_risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
  risk_score: number;
  max_score: number;
  summary: string;
  factors: FloodRiskFactor[];
  recommendation: string;
}

export interface EnvironmentalDataResponse {
  country: string;
  country_code: string;
  period: string;
  forest_cover: EnvironmentalIndicator;
  population_density: EnvironmentalIndicator;
  population_total: EnvironmentalIndicator;
  urban_population: EnvironmentalIndicator;
  agricultural_land: EnvironmentalIndicator;
  flood_risk_factors: FloodRiskFactors;
  data_source: string;
  analyzed_at: string;
}

export interface FloodCorrelationResponse {
  period: string;
  environmental_changes: {
    forest_cover: EnvironmentalTrendAnalysis;
    population_density: EnvironmentalTrendAnalysis;
    urban_population: EnvironmentalTrendAnalysis;
  };
  flood_patterns: {
    extreme_events_trend: string;
    rainfall_trend: string;
  };
  risk_assessment: FloodRiskFactors;
  key_insights: string[];
  data_sources: {
    environmental: string;
    flood_patterns: string;
  };
}

// Early Warning System types (OpenWeatherMap One Call API 3.0)
export interface EarlyWarningRiskFactor {
  factor: string;
  detail: string;
  severity: 'low' | 'medium' | 'high';
}

export interface EarlyWarningCurrent {
  temp_c: number | null;
  feels_like_c: number | null;
  humidity: number | null;
  pressure: number | null;
  wind_speed_ms: number | null;
  wind_gust_ms: number | null;
  wind_deg: number | null;
  clouds: number | null;
  visibility: number | null;
  uvi: number | null;
  rain_1h_mm: number;
  weather: string;
  weather_icon: string;
}

export interface EarlyWarningHourly {
  time: string;
  temp_c: number | null;
  feels_like_c: number | null;
  humidity: number | null;
  pressure: number | null;
  wind_speed_ms: number | null;
  wind_gust_ms: number | null;
  wind_deg: number | null;
  clouds: number | null;
  pop: number;
  rain_mm: number;
  snow_mm: number;
  uvi: number | null;
  visibility: number | null;
  weather: string;
  weather_icon: string;
}

export interface EarlyWarningDaily {
  date: string;
  day_name: string;
  sunrise: string;
  sunset: string;
  summary: string;
  temp_day_c: number | null;
  temp_night_c: number | null;
  temp_min_c: number | null;
  temp_max_c: number | null;
  feels_like_day_c: number | null;
  humidity: number | null;
  pressure: number | null;
  wind_speed_ms: number | null;
  wind_gust_ms: number | null;
  wind_deg: number | null;
  clouds: number | null;
  pop: number;
  rain_mm: number;
  snow_mm: number;
  uvi: number | null;
  weather: string;
  weather_icon: string;
  moon_phase: number | null;
  alert_level: 'green' | 'yellow' | 'orange' | 'red';
}

export interface GovernmentAlert {
  sender: string;
  event: string;
  start: string;
  end: string;
  description: string;
  tags: string[];
  district?: string;
}

export interface EarlyWarningDistrict {
  district: string;
  coordinates: { lat: number; lon: number };
  fetched_at: string;
  timezone: string;
  risk_level: 'low' | 'medium' | 'high' | 'extreme' | 'unknown';
  risk_score: number;
  risk_factors: EarlyWarningRiskFactor[];
  current: EarlyWarningCurrent;
  precipitation: {
    next_1h_mm: number;
    next_24h_mm: number;
    next_48h_mm: number;
  };
  alerts: GovernmentAlert[];
  alert_count: number;
  overview: string;
  hourly_forecast: EarlyWarningHourly[];
  daily_forecast: EarlyWarningDaily[];
  error?: string;
}

export interface EarlyWarningSummary {
  total_districts: number;
  risk_distribution: {
    extreme: number;
    high: number;
    medium: number;
    low: number;
  };
  total_government_alerts: number;
  districts_at_risk: number;
}

export interface EarlyWarningResponse {
  summary: EarlyWarningSummary;
  districts: EarlyWarningDistrict[];
}

export interface EarlyWarningAlertsResponse {
  total_alerts: number;
  alerts: GovernmentAlert[];
}

export interface EarlyWarningHighRiskResponse {
  count: number;
  districts: EarlyWarningDistrict[];
}

export interface DailyForecastByDay {
  date: string;
  day_name: string;
  districts: Array<{
    district: string;
    temp_max_c: number | null;
    temp_min_c: number | null;
    rain_mm: number;
    pop: number;
    weather: string;
    alert_level: string;
    summary: string;
  }>;
}

export interface EarlyWarningDailyForecastResponse {
  days: number;
  forecast: DailyForecastByDay[];
}

export interface EarlyWarningHourlyForecastResponse {
  district: string;
  hours: number;
  forecast: EarlyWarningHourly[];
}

export const api = new ApiClient();
export default api;
