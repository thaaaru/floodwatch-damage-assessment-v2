// SPDX-License-Identifier: Apache-2.0

'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { api, MetStation, MetStationsResponse } from '@/lib/api';

const MetStationsMap = dynamic(() => import('@/components/MetStationsMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-slate-900 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-blue-700/50 border-t-blue-600 rounded-full animate-spin" />
        <span className="text-sm text-slate-400">Loading map...</span>
      </div>
    </div>
  ),
});

const fmt = (v: number | null | undefined, d: number = 1): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return '—';
  return Number(v).toFixed(d);
};

export default function Dashboard() {
  const [data, setData] = useState<MetStationsResponse | null>(null);
  const [selected, setSelected] = useState<MetStation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await api.getMetStations();
      setData(res);
      setLastFetched(new Date());
    } catch (err) {
      console.error('Failed to fetch Met Dept data:', err);
      setError('Unable to load Met Dept data. Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // The Met Dept publishes a new bulletin every 3 hours; our backend
    // refreshes every 15 min. Poll every 5 min so we see new data
    // within ~minutes of release without burning rate budget.
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const stations = data?.stations ?? [];
  const summary = data?.summary;

  // Categorise stations for the legend strip.
  const counts = stations.reduce(
    (acc, s) => {
      const mm = s.rainfall_since_830am_mm ?? 0;
      if (mm >= 100) acc.veryHeavy++;
      else if (mm >= 50) acc.heavy++;
      else if (mm >= 25) acc.moderate++;
      else if (mm >= 5) acc.light++;
      else if (mm > 0) acc.trace++;
      else acc.dry++;
      return acc;
    },
    { veryHeavy: 0, heavy: 0, moderate: 0, light: 0, trace: 0, dry: 0 },
  );

  const reportTimeLocal = summary?.report_time_utc
    ? new Date(summary.report_time_utc).toLocaleString('en-LK', {
        timeZone: 'Asia/Colombo',
        hour: '2-digit',
        minute: '2-digit',
        day: 'numeric',
        month: 'short',
      })
    : null;

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col bg-slate-900">
      {/* Header strip */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2">
                <span>🌧️</span>
                <span>Rainfall</span>
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
                Measured at {summary?.station_count ?? 0} official weather stations.{' '}
                <a
                  href="https://meteo.gov.lk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-blue-600 hover:text-blue-300"
                >
                  Sri Lanka Department of Meteorology
                </a>
                {reportTimeLocal && (
                  <span className="text-slate-400"> &middot; report {reportTimeLocal}</span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <Chip n={counts.veryHeavy} label="≥100mm" color="bg-red-600/20 text-red-300 border-red-700/50" dot="bg-red-600" />
              <Chip n={counts.heavy} label="50-99mm" color="bg-orange-600/20 text-orange-300 border-orange-700/50" dot="bg-orange-500" />
              <Chip n={counts.moderate} label="25-49mm" color="bg-yellow-600/20 text-yellow-300 border-yellow-700/50" dot="bg-yellow-500" />
              <Chip n={counts.light} label="5-24mm" color="bg-blue-600/20 text-blue-300 border-blue-700/50" dot="bg-blue-500" />
              <Chip n={counts.trace + counts.dry} label="0-5mm" color="bg-slate-700/40 text-slate-300 border-slate-600/50" dot="bg-slate-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Map area */}
      <div className="relative flex-1">
        <div className="h-[calc(100vh-200px)] min-h-[480px] sm:min-h-[600px]">
          {loading && stations.length === 0 ? (
            <div className="h-full w-full bg-slate-900 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-blue-700/50 border-t-blue-600 rounded-full animate-spin" />
                <span className="text-sm text-slate-400">Loading measured rainfall...</span>
              </div>
            </div>
          ) : stations.length === 0 ? (
            <div className="h-full w-full bg-slate-900 flex items-center justify-center px-4">
              <div className="text-center max-w-md">
                <div className="text-2xl mb-2">📡</div>
                <div className="font-semibold text-slate-200">No Met Department data available right now</div>
                <div className="text-sm text-slate-400 mt-1">
                  We only publish measured ground-gauge data. The upstream bulletin will refresh shortly.
                </div>
                {error && (
                  <div className="mt-3 text-xs text-yellow-200 bg-yellow-900/40 border border-yellow-700/50 rounded p-2">
                    {error}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <MetStationsMap
              stations={stations}
              selectedWmoId={selected?.wmo_id ?? null}
              onStationSelect={setSelected}
            />
          )}
        </div>

        {/* Floating details card for the selected station */}
        {selected && (
          <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:bottom-3 sm:max-w-sm z-10">
            <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">{selected.name}</div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {selected.district} &middot; WMO {selected.wmo_id}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0"
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <Stat label="Since 08:30" value={`${fmt(selected.rainfall_since_830am_mm)} mm`} highlight />
                <Stat label="Last 3h" value={`${fmt(selected.rainfall_3h_mm)} mm`} />
                <Stat
                  label="Temperature"
                  value={selected.temperature_c !== null ? `${fmt(selected.temperature_c)}°C` : '—'}
                />
                <Stat
                  label="Humidity"
                  value={
                    selected.relative_humidity_pct !== null
                      ? `${selected.relative_humidity_pct}%`
                      : '—'
                  }
                />
              </div>
              {selected.weather_type && (
                <div className="mt-3 text-[11px] text-slate-300">
                  Conditions: <span className="font-medium text-slate-100">{selected.weather_type}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer attribution */}
      <div className="bg-slate-800 border-t border-slate-700">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-2 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
          <span>
            Source: Sri Lanka Department of Meteorology - measured rainfall from 24 WMO stations.
            We publish only directly-measured data; no models or forecasts on this page.
          </span>
          {lastFetched && (
            <span>Fetched {lastFetched.toLocaleTimeString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// --- small UI primitives -----------------------------------------------

function Chip({
  n,
  label,
  color,
  dot,
}: {
  n: number;
  label: string;
  color: string;
  dot: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${color}`}>
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <span className="font-semibold">{n}</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-2 border ${
        highlight ? 'bg-slate-900 border-slate-600' : 'bg-slate-800 border-slate-700'
      }`}
    >
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="font-mono font-semibold text-white">{value}</div>
    </div>
  );
}
