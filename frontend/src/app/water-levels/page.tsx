// SPDX-License-Identifier: Apache-2.0

'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { api, IrrigationStation } from '@/lib/api';

const WaterLevelMap = dynamic(() => import('@/components/WaterLevelMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-slate-100 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <span className="text-sm text-slate-500">Loading map...</span>
      </div>
    </div>
  ),
});

const fmt = (v: number | null | undefined, d: number = 2): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return '—';
  return Number(v).toFixed(d);
};

export default function WaterLevelsPage() {
  const [stations, setStations] = useState<IrrigationStation[]>([]);
  const [selected, setSelected] = useState<IrrigationStation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await api.getIrrigationData();
      const next = res?.stations ?? [];
      setStations(next);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch water-level data:', err);
      setError('Unable to load water levels. Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Refresh every 5 minutes (backend cache TTL is 5 min upstream).
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Counts by status (drive the legend chip pills + summary text).
  const counts = stations.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    { major_flood: 0, minor_flood: 0, alert: 0, normal: 0 } as Record<string, number>,
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header strip */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <a
                href="/"
                className="text-slate-600 hover:text-slate-900 transition-colors flex-shrink-0"
                aria-label="Back to home"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </a>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold truncate">
                  💧 Rivers & Water Levels
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                  Sri Lanka river network and live gauging station levels
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Chip label={`Major ${counts.major_flood}`} color="bg-red-50 text-red-700 border-red-200" dot="bg-red-600" />
              <Chip label={`Minor ${counts.minor_flood}`} color="bg-orange-50 text-orange-700 border-orange-200" dot="bg-orange-500" />
              <Chip label={`Alert ${counts.alert}`} color="bg-yellow-50 text-yellow-700 border-yellow-200" dot="bg-yellow-500" />
              <Chip label={`Normal ${counts.normal}`} color="bg-green-50 text-green-700 border-green-200" dot="bg-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Full-bleed map area */}
      <div className="relative">
        {/* Map */}
        <div className="h-[calc(100vh-200px)] min-h-[520px] sm:min-h-[640px]">
          {loading && stations.length === 0 ? (
            <div className="h-full w-full bg-slate-100 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <span className="text-sm text-slate-500">Loading water levels...</span>
              </div>
            </div>
          ) : (
            <WaterLevelMap stations={stations} selectedStation={selected} onStationSelect={setSelected} />
          )}
        </div>

        {/* Error banner overlay */}
        {error && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-yellow-50 border border-yellow-300 text-yellow-800 text-xs sm:text-sm px-3 py-2 rounded-lg shadow-md">
            {error}
          </div>
        )}

        {/* Selected station details panel (slides up from bottom on mobile, floating on desktop) */}
        {selected && (
          <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:bottom-3 sm:max-w-md z-10">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{selected.station}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {selected.river}
                    {selected.districts?.length ? ` · ${selected.districts.join(', ')}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
                  aria-label="Close station details"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                <Stat label="Current" value={`${fmt(selected.water_level_m)} m`} colorClass={statusTextClass(selected.status)} highlight />
                <Stat label="Alert" value={`${fmt(selected.alert_level_m)} m`} colorClass="text-slate-700" />
                <Stat label="Minor" value={`${fmt(selected.minor_flood_level_m)} m`} colorClass="text-orange-700" />
                <Stat label="Major" value={`${fmt(selected.major_flood_level_m)} m`} colorClass="text-red-700" />
              </div>

              <div className="mt-3">
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${statusBgClass(selected.status)}`}
                    style={{ width: `${Math.min(Math.max(selected.pct_to_major_flood ?? 0, 0), 100)}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-500 text-center mt-1">
                  {(selected.pct_to_major_flood ?? 0).toFixed(0)}% of major flood threshold
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer / data attribution */}
        <div className="px-3 sm:px-4 lg:px-8 py-3 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>
            Data: Sri Lanka Irrigation Department gauging stations (24 nationwide). Map: CARTO / OpenStreetMap.
          </span>
          {lastUpdated && (
            <span>
              Updated {lastUpdated.toLocaleTimeString()} - auto-refreshes every 5 min
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ----- Small UI primitives kept inline so the page stays self-contained --

function Chip({ label, color, dot }: { label: string; color: string; dot: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${color}`}>
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function Stat({
  label,
  value,
  colorClass,
  highlight = false,
}: {
  label: string;
  value: string;
  colorClass: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-2 border ${highlight ? 'bg-slate-50 border-slate-300' : 'bg-white border-slate-200'}`}
    >
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`font-mono font-semibold ${colorClass}`}>{value}</div>
    </div>
  );
}

function statusTextClass(status: string): string {
  switch (status) {
    case 'major_flood':
      return 'text-red-700';
    case 'minor_flood':
      return 'text-orange-700';
    case 'alert':
      return 'text-yellow-700';
    default:
      return 'text-green-700';
  }
}

function statusBgClass(status: string): string {
  switch (status) {
    case 'major_flood':
      return 'bg-red-600';
    case 'minor_flood':
      return 'bg-orange-500';
    case 'alert':
      return 'bg-yellow-500';
    default:
      return 'bg-green-600';
  }
}
