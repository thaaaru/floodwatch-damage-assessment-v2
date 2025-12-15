// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  api,
  EarlyWarningResponse,
  EarlyWarningDistrict,
} from '@/lib/api';

const EarlyWarningMap = dynamic(() => import('@/components/EarlyWarningMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-slate-100 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
        <span className="text-sm text-slate-500">Loading map...</span>
      </div>
    </div>
  )
});

const getRiskStyles = (risk: string) => {
  switch (risk) {
    case 'extreme':
      return { bg: 'bg-violet-600', text: 'text-violet-600', light: 'bg-violet-50', border: 'border-violet-200' };
    case 'high':
      return { bg: 'bg-red-500', text: 'text-red-600', light: 'bg-red-50', border: 'border-red-200' };
    case 'medium':
      return { bg: 'bg-amber-500', text: 'text-amber-600', light: 'bg-amber-50', border: 'border-amber-200' };
    case 'low':
      return { bg: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200' };
    default:
      return { bg: 'bg-slate-400', text: 'text-slate-600', light: 'bg-slate-50', border: 'border-slate-200' };
  }
};

const getWeatherIcon = (iconCode: string) => {
  return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
};

// Cache
const CACHE_KEY = 'early_warning_data';
const CACHE_DURATION_MS = 30 * 60 * 1000;

interface CachedData {
  data: EarlyWarningResponse;
  timestamp: number;
}

function getCachedData(): CachedData | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed: CachedData = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_DURATION_MS) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Cache read error:', e);
  }
  return null;
}

function setCachedData(data: EarlyWarningResponse): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (e) {
    console.error('Cache write error:', e);
  }
}

function InfoPanelContent({ district }: { district: EarlyWarningDistrict }) {
  const styles = getRiskStyles(district.risk_level);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={`p-4 ${styles.bg} text-white`}>
        <div className="flex items-center gap-3">
          {district.current.weather_icon && (
            <img
              src={getWeatherIcon(district.current.weather_icon)}
              alt={district.current.weather}
              className="w-14 h-14 -ml-2"
            />
          )}
          <div className="flex-1">
            <h3 className="text-lg font-semibold">{district.district}</h3>
            <p className="text-sm opacity-90 capitalize">{district.current.weather}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <span className="text-3xl font-bold">{district.current.temp_c?.toFixed(0)}°</span>
          <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium backdrop-blur-sm">
            {district.risk_level.toUpperCase()} RISK
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* AI Summary */}
        {district.overview && (
          <div className="glass p-3 rounded-xl shadow-md">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-slate-700">AI Summary</span>
            </div>
            <p className="text-sm text-slate-800 leading-relaxed">{district.overview}</p>
          </div>
        )}

        {/* Precipitation */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Expected Rain</h4>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '1h', value: district.precipitation.next_1h_mm },
              { label: '24h', value: district.precipitation.next_24h_mm },
              { label: '48h', value: district.precipitation.next_48h_mm },
            ].map((item) => (
              <div key={item.label} className="glass rounded-xl p-3 text-center shadow-sm">
                <div className="text-xs text-slate-500 mb-1">{item.label}</div>
                <div className="text-lg font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">{item.value.toFixed(0)}<span className="text-xs font-normal">mm</span></div>
              </div>
            ))}
          </div>
        </div>

        {/* Conditions */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Conditions</h4>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Humidity', value: `${district.current.humidity}%`, icon: '💧' },
              { label: 'Wind', value: `${district.current.wind_speed_ms ? (district.current.wind_speed_ms * 3.6).toFixed(0) : '-'} km/h`, icon: '💨' },
              { label: 'Pressure', value: `${district.current.pressure} hPa`, icon: '📊' },
              { label: 'UV Index', value: district.current.uvi?.toFixed(0) || '-', icon: '☀️' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 p-2 glass rounded-lg shadow-sm">
                <span className="text-sm">{item.icon}</span>
                <div>
                  <div className="text-xs text-slate-500">{item.label}</div>
                  <div className="text-sm font-semibold text-slate-700">{item.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Factors */}
        {district.risk_factors.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Risk Factors</h4>
              <span className="text-xs font-bold text-slate-600">{district.risk_score}/100</span>
            </div>
            <div className="space-y-1.5">
              {district.risk_factors.slice(0, 3).map((factor, idx) => {
                const severityStyles = {
                  high: 'glass border-red-300 text-red-700 shadow-md',
                  medium: 'glass border-amber-300 text-amber-700 shadow-md',
                  low: 'glass border-yellow-300 text-yellow-700 shadow-sm',
                };
                return (
                  <div key={idx} className={`px-3 py-2 rounded-lg border text-sm ${severityStyles[factor.severity as keyof typeof severityStyles] || severityStyles.low}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{factor.factor}</span>
                      <span className="text-xs uppercase font-semibold opacity-75">{factor.severity}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Government Alerts */}
        {district.alerts.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">
              Government Alerts ({district.alerts.length})
            </h4>
            <div className="space-y-2">
              {district.alerts.map((alert, idx) => (
                <div key={idx} className="glass p-3 rounded-xl border border-red-300 shadow-md">
                  <div className="font-medium text-red-800 text-sm">{alert.event}</div>
                  <p className="text-xs text-red-700 mt-1 line-clamp-2">{alert.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 8-Day Forecast */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">8-Day Forecast</h4>
          <div className="grid grid-cols-8 gap-1">
            {district.daily_forecast.map((day, idx) => {
              const alertColors = {
                red: 'glass border-red-300 shadow-md',
                orange: 'glass border-amber-300 shadow-md',
                yellow: 'glass border-yellow-300 shadow-sm',
                green: 'glass border-emerald-300 shadow-sm',
              };
              const gradientClasses = {
                red: 'bg-gradient-to-r from-red-600 to-red-500',
                orange: 'bg-gradient-to-r from-amber-600 to-amber-500',
                yellow: 'bg-gradient-to-r from-yellow-600 to-yellow-500',
                green: 'bg-gradient-to-r from-emerald-600 to-emerald-500',
              };
              return (
                <div key={idx} className={`p-1.5 rounded-lg border text-center ${alertColors[day.alert_level as keyof typeof alertColors] || alertColors.green}`}>
                  <div className="text-xs font-medium text-slate-600">{day.day_name.slice(0, 2)}</div>
                  {day.weather_icon && (
                    <img src={getWeatherIcon(day.weather_icon)} alt="" className="w-6 h-6 mx-auto" />
                  )}
                  <div className={`text-xs font-bold ${gradientClasses[day.alert_level as keyof typeof gradientClasses] || gradientClasses.green} bg-clip-text text-transparent`}>{day.rain_mm.toFixed(0)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EarlyWarningPage() {
  const [data, setData] = useState<EarlyWarningResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [shouldZoomToDistrict, setShouldZoomToDistrict] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async (forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = getCachedData();
        if (cached) {
          setData(cached.data);
          setLoading(false);
          return;
        }
      }
      try {
        setLoading(true);
        const result = await api.getEarlyWarning();
        setData(result);
        setCachedData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(() => fetchData(true), CACHE_DURATION_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDistrictSelect = (districtName: string) => {
    setSelectedDistrict(districtName);
    setShouldZoomToDistrict(true);
    setIsDropdownOpen(false);
  };

  const selectedDistrictData = data?.districts.find(d => d.district === selectedDistrict);
  const sortedDistricts = data?.districts
    .filter(d => !d.error)
    .sort((a, b) => {
      const riskOrder = { extreme: 0, high: 1, medium: 2, low: 3, unknown: 4 };
      return (riskOrder[a.risk_level] || 4) - (riskOrder[b.risk_level] || 4);
    }) || [];

  const displayDistrict = selectedDistrictData || sortedDistricts[0];

  if (loading) {
    return (
      <div className="h-[calc(100vh-64px)] bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500">Loading early warning data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[calc(100vh-64px)] bg-slate-50 flex items-center justify-center p-4">
        <div className="card p-6 max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="font-medium text-slate-900">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="h-[calc(100vh-64px)] flex bg-slate-50">
      {/* Map Area */}
      <div className="flex-1 relative p-4 md:pr-0">
        <div className="h-full card overflow-hidden">
          <EarlyWarningMap
            districts={data.districts}
            onDistrictSelect={handleDistrictSelect}
            selectedDistrict={selectedDistrict || displayDistrict?.district || null}
            shouldZoom={shouldZoomToDistrict}
          />
        </div>

        {/* District Dropdown Overlay */}
        <div className="absolute top-6 left-6 z-[1000]" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="glass px-4 py-3 flex items-center gap-3 hover:shadow-lg transition-all min-w-[260px] rounded-xl"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="flex-1 text-left">
              <div className="text-xs text-slate-500">District</div>
              <div className="font-semibold text-slate-900 text-sm">
                {selectedDistrict || displayDistrict?.district || 'Select'}
              </div>
            </div>
            <svg className={`w-5 h-5 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 glass rounded-xl shadow-lg max-h-[60vh] overflow-y-auto animate-fade-in">
              <div className="p-2 border-b border-slate-200">
                <span className="text-xs text-slate-600 font-medium">25 Districts</span>
              </div>
              <div className="p-1">
                {sortedDistricts.map((district) => {
                  const styles = getRiskStyles(district.risk_level);
                  return (
                    <button
                      key={district.district}
                      onClick={() => handleDistrictSelect(district.district)}
                      className={`w-full px-3 py-2 text-left rounded-lg transition-colors flex items-center justify-between ${
                        (selectedDistrict || displayDistrict?.district) === district.district
                          ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md'
                          : 'hover:bg-white/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-md ${styles.bg} text-white text-xs font-bold flex items-center justify-center`}>
                          {district.risk_level.slice(0, 1).toUpperCase()}
                        </span>
                        <span className={`font-medium text-sm ${(selectedDistrict || displayDistrict?.district) === district.district ? 'text-white' : 'text-slate-700'}`}>{district.district}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${(selectedDistrict || displayDistrict?.district) === district.district ? 'text-white' : 'text-cyan-600'}`}>
                          {district.precipitation.next_24h_mm.toFixed(0)}mm
                        </span>
                        {district.current.weather_icon && (
                          <img src={getWeatherIcon(district.current.weather_icon)} alt="" className="w-6 h-6" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Mobile Info Panel */}
        {selectedDistrictData && (
          <div className="absolute bottom-4 left-4 right-4 glass rounded-2xl max-h-[50vh] overflow-hidden z-[999] md:hidden animate-slide-up shadow-lg">
            <div className="relative">
              <button
                onClick={() => setSelectedDistrict(null)}
                className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <InfoPanelContent district={selectedDistrictData} />
            </div>
          </div>
        )}
      </div>

      {/* Desktop Sidebar */}
      {displayDistrict && (
        <div className="hidden md:block w-96 p-4 pl-4">
          <div className="h-full glass rounded-2xl overflow-hidden shadow-lg">
            <InfoPanelContent district={displayDistrict} />
          </div>
        </div>
      )}
    </div>
  );
}
