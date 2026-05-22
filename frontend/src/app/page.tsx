// SPDX-License-Identifier: Apache-2.0

'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { api, Alert, YesterdayStats } from '@/lib/api';
import AlertList from '@/components/AlertList';
import NewsFeed from '@/components/NewsFeed';
import RiverNetworkStatus from '@/components/RiverNetworkStatus';
import { MapLayer } from '@/components/Map';

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-slate-100 rounded-2xl flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
        <span className="text-sm text-slate-500">Loading map...</span>
      </div>
    </div>
  )
});

const layerOptions: { id: MapLayer; label: string; icon: string; description: string; group: string }[] = [
  { id: 'danger', label: 'Flood Risk', icon: '⚠️', description: 'Danger level based on multiple factors', group: 'current' },
  { id: 'rainfall', label: 'Rainfall', icon: '🌧️', description: 'Accumulated rainfall', group: 'current' },
  { id: 'temperature', label: 'Temp', icon: '🌡️', description: 'Current temperature', group: 'current' },
  { id: 'humidity', label: 'Humidity', icon: '💧', description: 'Relative humidity', group: 'current' },
  { id: 'wind', label: 'Wind', icon: '💨', description: 'Wind speed', group: 'current' },
  { id: 'pressure', label: 'Pressure', icon: '📊', description: 'Atmospheric pressure', group: 'current' },
  { id: 'forecast1', label: '+1 Day', icon: '📅', description: 'Tomorrow forecast', group: 'forecast' },
  { id: 'forecast2', label: '+2 Days', icon: '📅', description: 'Day 2 forecast', group: 'forecast' },
  { id: 'forecast3', label: '+3 Days', icon: '📅', description: 'Day 3 forecast', group: 'forecast' },
  { id: 'forecast4', label: '+4 Days', icon: '📅', description: 'Day 4 forecast', group: 'forecast' },
  { id: 'forecast5', label: '+5 Days', icon: '📅', description: 'Day 5 forecast', group: 'forecast' },
];

export type DangerFilter = 'all' | 'low' | 'medium' | 'high';

interface RainSummary {
  districtsWithRain: number;
  totalDistricts: number;
  maxRainfall: number;
  maxRainfallDistrict: string;
  totalRainfall: number;
}

// Safe number formatting helper
const fmt = (v: any, d: number = 0): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return '0';
  return Number(v).toFixed(d);
};

// Safe date formatting helper
const formatDate = (dateStr: string | null | undefined, options: Intl.DateTimeFormatOptions): string => {
  if (!dateStr) return 'Unknown date';
  try {
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleDateString('en-LK', options);
  } catch {
    return 'Unknown date';
  }
};

export default function Dashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>('Nawalapitiya');
  const [selectedHours, setSelectedHours] = useState<number>(24);
  const [selectedLayer, setSelectedLayer] = useState<MapLayer>('rainfall');
  const [loading, setLoading] = useState(true);
  const [dangerFilter, setDangerFilter] = useState<DangerFilter>('all');
  const [rainSummary, setRainSummary] = useState<RainSummary | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [yesterdayStats, setYesterdayStats] = useState<YesterdayStats | null>(null);
  const [loadingYesterdayStats, setLoadingYesterdayStats] = useState(false);
  // Layer is locked to 'rainfall' on the home dashboard (see explanation
  // near the top-controls block). The setter is kept (and unused) only to
  // preserve the original useState signature for an easy revert.
  const [showRiverStations, setShowRiverStations] = useState(false); // Hidden by default: home map is rainfall-only.

  // Note: Info panel is always visible on desktop as a sidebar, toggle only works on mobile

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const data = await api.getActiveAlerts();
        setAlerts(data);
      } catch (err) {
        console.error('Failed to fetch alerts:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAlerts();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  // Get user location for Windy map focus
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
        },
        () => {
          // User denied or error - use default Sri Lanka center
          setUserLocation(null);
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
      );
    }
  }, []);

  // Fetch rain summary
  useEffect(() => {
    const fetchRainSummary = async () => {
      try {
        const weatherData = await api.getAllWeather(selectedHours);
        if (!weatherData || !Array.isArray(weatherData) || weatherData.length === 0) return;

        const rainfallKey = selectedHours === 24 ? 'rainfall_24h_mm' :
                          selectedHours === 48 ? 'rainfall_48h_mm' : 'rainfall_72h_mm';

        // Filter valid data entries
        const validData = weatherData.filter((d: any) => d != null);
        if (validData.length === 0) return;

        const districtsWithRain = validData.filter((d: any) => (d[rainfallKey] || 0) > 0);
        const maxDistrict = validData.reduce((max: any, d: any) =>
          (d[rainfallKey] || 0) > (max[rainfallKey] || 0) ? d : max, validData[0]);
        const totalRainfall = validData.reduce((sum: number, d: any) =>
          sum + (d[rainfallKey] || 0), 0);

        setRainSummary({
          districtsWithRain: districtsWithRain.length,
          totalDistricts: validData.length,
          maxRainfall: Number(maxDistrict?.[rainfallKey]) || 0,
          maxRainfallDistrict: maxDistrict?.district || 'Unknown',
          totalRainfall: totalRainfall,
        });
      } catch (err) {
        console.error('Failed to fetch rain summary:', err);
      }
    };
    fetchRainSummary();
    // No auto-refresh - data is cached on backend for 60 minutes
  }, [selectedHours]);

  // Fetch yesterday's stats
  useEffect(() => {
    const fetchYesterdayStats = async () => {
      setLoadingYesterdayStats(true);
      try {
        const stats = await api.getYesterdayStats();
        setYesterdayStats(stats);
      } catch (err) {
        console.error('Failed to fetch yesterday stats:', err);
      } finally {
        setLoadingYesterdayStats(false);
      }
    };
    fetchYesterdayStats();
    // Data is cached for the entire day on backend
  }, []);

  // (Rainfall-only home: layer / period / forecast controls removed.
  // Helpers and computed lists below are intentionally not used; kept
  // commented out for easy restoration.
  //
  // const currentLayers = layerOptions.filter(l => l.group === 'current');
  // const forecastLayers = layerOptions.filter(l => l.group === 'forecast');
  // const getForecastDate = (dayOffset: number) => { ... };
  // const forecastLayersWithDates = forecastLayers.map(...);
  // )

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-slate-50">
      {/* Desktop: Grid Layout | Mobile: Full Screen Map */}
      <div className="flex-1 lg:grid lg:grid-cols-[1fr_400px] relative">
        {/* Map Container */}
        <div className="relative h-full">
          {/* Map - Full Screen on mobile, left column on desktop */}
            <div className="absolute inset-0 p-4">
              <div className="h-full card overflow-hidden">
                <Map
                  onDistrictSelect={setSelectedDistrict}
                  hours={selectedHours}
                  layer={selectedLayer}
                  dangerFilter={dangerFilter}
                  userLocation={userLocation}
                  showRivers={showRiverStations}
                  onShowRiversChange={setShowRiverStations}
                />
            </div>
          </div>

        {/* Rainfall-only home dashboard: all map controls intentionally hidden.
            Layer is locked to `rainfall` (see useState default) so the map
            always renders precipitation icons. Period 24h is fixed; if you
            want to expose layer / period / station toggles again, see
            git commit history around 2026-05-22. */}

          {/* Windy Icon - Left Side */}
          <a
            href="/windy"
            className="fixed bottom-6 left-6 z-[2000] w-14 h-14 bg-gradient-to-br from-purple-600 to-pink-500 hover:shadow-lg hover:shadow-pink-500/30 text-white rounded-full shadow-2xl flex items-center justify-center transition-all active:scale-95 ring-4 ring-purple-300/40"
            title="Windy Weather Map"
          >
            <span className="text-2xl">🌀</span>
          </a>

          {/* Mobile Only: Floating Info Panel */}
          <div className="lg:hidden">
            {/* Floating Action Button - Mobile Only */}
            <button
              onClick={() => setShowMobilePanel(!showMobilePanel)}
              className="fixed bottom-16 right-6 z-[2000] w-16 h-16 bg-brand-600 hover:bg-brand-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-all active:scale-95 ring-4 ring-white/30"
            >
              {showMobilePanel ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </button>

            {/* Mobile Floating Panel */}
            {showMobilePanel && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 bg-black/50 z-[1500] animate-in fade-in duration-200"
                  onClick={() => setShowMobilePanel(false)}
                />

                {/* Panel Content - Bottom on mobile */}
                <div className="fixed inset-x-0 bottom-0 z-[1600] glass rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300">
                {/* Handle */}
                <div className="flex items-center justify-center pt-3 pb-2 lg:hidden">
                  <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
                </div>

                {/* Panel Header */}
                <div className="px-4 pb-3 border-b border-slate-200">
                  <h2 className="text-lg font-bold text-slate-900">Dashboard Info</h2>
                  <p className="text-xs text-slate-600 mt-1 font-medium">Real-time flood monitoring data</p>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* River Network Status - Mobile */}
                  <RiverNetworkStatus />

                  {/* Alerts */}
                  {alerts.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
                      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-red-50">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                          <h2 className="text-sm font-bold text-slate-900">Active Alerts</h2>
                        </div>
                        <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800 font-bold">
                          {alerts.length}
                        </span>
                      </div>
                      <div className="p-3 max-h-[250px] overflow-y-auto">
                        <AlertList
                          alerts={selectedDistrict ? alerts.filter(a => a.district === selectedDistrict) : alerts}
                          compact
                        />
                      </div>
                    </div>
                  )}

                  {/* No Alerts */}
                  {alerts.length === 0 && !loading && (
                    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-2 text-sm">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-semibold text-slate-900">No active alerts</span>
                    </div>
                  )}

                  {/* News Feed */}
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 bg-blue-50">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                      </svg>
                      <h2 className="text-sm font-bold text-slate-900">News & Updates</h2>
                    </div>
                    <div className="p-3 max-h-[300px] overflow-y-auto">
                      <NewsFeed maxItems={5} compact />
                    </div>
                  </div>

                  {/* Yesterday's Weather Summary */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <span>📅</span> Yesterday&apos;s Weather Summary
                      {loadingYesterdayStats && <span className="text-xs text-slate-400 font-normal">(Loading...)</span>}
                    </h2>

                    {yesterdayStats ? (
                      <div className="space-y-3">
                        {/* Summary Stats */}
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-center">
                          <div className="text-lg font-bold text-orange-600">{fmt(yesterdayStats.max_rainfall_mm)}</div>
                          <div className="text-[10px] text-orange-700 font-medium">Max Rainfall (mm)</div>
                        </div>

                        {/* Max rainfall district */}
                        {yesterdayStats.max_rainfall_district && yesterdayStats.max_rainfall_mm > 0 && (
                          <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-lg p-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-[10px] text-slate-600 font-medium">Highest Rainfall</div>
                                <div className="text-xs font-bold text-slate-900">{yesterdayStats.max_rainfall_district}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-xl font-bold text-orange-600">{fmt(yesterdayStats.max_rainfall_mm)}</div>
                                <div className="text-[10px] text-orange-700 font-medium">mm</div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Footer with date */}
                        <div className="text-[10px] text-slate-500 text-center">
                          Data for {formatDate(yesterdayStats.date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </div>
                      </div>
                    ) : loadingYesterdayStats ? (
                      <div className="text-center py-6">
                        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                      </div>
                    ) : (
                      <div className="text-center text-slate-500 py-6 text-xs">
                        Unable to load yesterday&apos;s stats
                      </div>
                    )}
                  </div>

                  {/* Windy Link */}
                  <a
                    href="/windy"
                    className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between group hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🌀</span>
                      <div>
                        <div className="text-sm font-bold text-slate-900">Windy Weather Map</div>
                        <div className="text-xs text-slate-600 font-medium">Real-time wind & rain visualization</div>
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-purple-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                </div>
              </div>
            </>
          )}
          </div>
        </div>

        {/* Desktop Only: Fixed Sidebar */}
        <div className="hidden lg:flex flex-col h-full glass border-l border-slate-200">
          {/* Panel Header */}
          <div className="px-4 py-4 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Dashboard Info</h2>
            <p className="text-xs text-slate-600 mt-1 font-medium">Real-time flood monitoring data</p>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* River Network Status */}
            <RiverNetworkStatus />

            {/* Alerts */}
            {alerts.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-red-50">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <h2 className="text-sm font-bold text-slate-900">Active Alerts</h2>
                  </div>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800 font-bold">
                    {alerts.length}
                  </span>
                </div>
                <div className="p-3 max-h-[250px] overflow-y-auto">
                  <AlertList
                    alerts={selectedDistrict ? alerts.filter(a => a.district === selectedDistrict) : alerts}
                    compact
                  />
                </div>
              </div>
            )}

            {/* No Alerts */}
            {alerts.length === 0 && !loading && (
              <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-2 text-sm">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <div className="font-bold text-slate-900">No Active Alerts</div>
                  <div className="text-xs text-slate-600 font-medium">All areas currently safe</div>
                </div>
              </div>
            )}

            {/* News */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 bg-blue-50">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
                <h2 className="text-sm font-bold text-slate-900">News & Updates</h2>
              </div>
              <div className="p-3 max-h-[300px] overflow-y-auto">
                <NewsFeed maxItems={5} compact />
              </div>
            </div>

            {/* Yesterday's Weather Summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <span>📅</span> Yesterday&apos;s Weather Summary
                {loadingYesterdayStats && <span className="text-xs text-slate-400 font-normal">(Loading...)</span>}
              </h2>

              {yesterdayStats ? (
                <div className="space-y-3">
                  {/* Summary Stats */}
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-orange-600">{fmt(yesterdayStats.max_rainfall_mm)}</div>
                    <div className="text-[10px] text-orange-700 font-medium">Max Rainfall (mm)</div>
                  </div>

                  {/* Max rainfall district */}
                  {yesterdayStats.max_rainfall_district && yesterdayStats.max_rainfall_mm > 0 && (
                    <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-lg p-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-slate-600 font-medium">Highest Rainfall</div>
                          <div className="text-xs font-bold text-slate-900">{yesterdayStats.max_rainfall_district}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-orange-600">{fmt(yesterdayStats.max_rainfall_mm)}</div>
                          <div className="text-[10px] text-orange-700 font-medium">mm</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Footer with date */}
                  <div className="text-[10px] text-slate-500 text-center">
                    Data for {formatDate(yesterdayStats.date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                </div>
              ) : loadingYesterdayStats ? (
                <div className="text-center py-6">
                  <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                </div>
              ) : (
                <div className="text-center text-slate-500 py-6 text-xs">
                  Unable to load yesterday&apos;s stats
                </div>
              )}
            </div>

            {/* Windy Link */}
            <a
              href="/windy"
              className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between group hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🌀</span>
                <div>
                  <div className="text-sm font-bold text-slate-900">Windy Weather Map</div>
                  <div className="text-xs text-slate-600 font-medium">Real-time wind & rain visualization</div>
                </div>
              </div>
              <svg className="w-5 h-5 text-purple-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
