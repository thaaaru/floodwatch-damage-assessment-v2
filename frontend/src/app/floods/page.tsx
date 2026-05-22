// SPDX-License-Identifier: Apache-2.0

'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { api, IrrigationStation } from '@/lib/api';

const FloodsMap = dynamic(() => import('@/components/FloodsMap'), {
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

/**
 * Clean Flood Hub page.
 *
 * Shows ONLY:
 *   - Sri Lanka river network (named paths from lib/rivers.ts)
 *   - The 24 Irrigation Department gauging stations with measured
 *     water levels and official alert / minor / major flood thresholds.
 *
 * Intentionally drops the HydroSHEDS basin layer, the AIG damage tile
 * overlays, and the Google Floods placeholder markers (no API key
 * available => 0 gauges, only clutter). Per the directive: 'only publish
 * solid data from trusted sources'.
 */
export default function FloodsPage() {
  const [stations, setStations] = useState<IrrigationStation[]>([]);
  const [selected, setSelected] = useState<IrrigationStation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await api.getIrrigationData();
      setStations(res?.stations ?? []);
      setLastFetched(new Date());
    } catch (err) {
      console.error('Failed to fetch irrigation data:', err);
      setError('Unable to load river gauges. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const counts = stations.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    { major_flood: 0, minor_flood: 0, alert: 0, normal: 0 } as Record<string, number>,
  );

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2">
                <span>🌊</span>
                <span>Floods</span>
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-600 mt-0.5">
                Measured river water levels from{' '}
                <a
                  href="https://github.com/nuuuwan/lk_irrigation"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-blue-600 hover:text-blue-700"
                >
                  Sri Lanka Irrigation Department
                </a>{' '}
                gauging stations with official alert / flood thresholds.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <Chip n={counts.major_flood} label="Major flood" color="bg-red-50 text-red-700 border-red-300" dot="bg-red-600" />
              <Chip n={counts.minor_flood} label="Minor flood" color="bg-orange-50 text-orange-700 border-orange-300" dot="bg-orange-500" />
              <Chip n={counts.alert} label="Alert" color="bg-yellow-50 text-yellow-700 border-yellow-300" dot="bg-yellow-500" />
              <Chip n={counts.normal} label="Normal" color="bg-green-50 text-green-700 border-green-300" dot="bg-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <div className="h-[calc(100vh-200px)] min-h-[480px] sm:min-h-[600px]">
          {loading && stations.length === 0 ? (
            <div className="h-full w-full bg-slate-100 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <span className="text-sm text-slate-500">Loading river gauges...</span>
              </div>
            </div>
          ) : stations.length === 0 ? (
            <div className="h-full w-full bg-slate-100 flex items-center justify-center px-4 text-center">
              <div className="max-w-md">
                <div className="text-2xl mb-2">📡</div>
                <div className="font-semibold text-slate-700">No gauge data available right now</div>
                {error && (
                  <div className="mt-3 text-xs text-yellow-700 bg-yellow-50 border border-yellow-300 rounded p-2">
                    {error}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <FloodsMap
              stations={stations}
              selectedStation={selected}
              onStationSelect={setSelected}
            />
          )}
        </div>

        {/* Floating details panel */}
        {selected && (
          <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:bottom-3 sm:max-w-sm z-10">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{selected.station}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {selected.river}
                    {selected.districts?.length ? ` · ${selected.districts.join(', ')}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
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
                  {selected.last_updated && (
                    <>
                      {' · updated '}
                      {new Date(selected.last_updated).toLocaleTimeString('en-LK', {
                        timeZone: 'Asia/Colombo',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer attribution */}
      <div className="bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-2 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>
            Source: Sri Lanka Irrigation Department (24 gauging stations). Rivers: simplified country reference geometry. We publish only directly-measured data.
          </span>
          {lastFetched && (
            <span>Fetched {lastFetched.toLocaleTimeString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// --- small primitives -------------------------------------------------

function Chip({ n, label, color, dot }: { n: number; label: string; color: string; dot: string }) {
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
  colorClass,
  highlight = false,
}: {
  label: string;
  value: string;
  colorClass: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg p-2 border ${highlight ? 'bg-slate-50 border-slate-300' : 'bg-white border-slate-200'}`}>
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`font-mono font-semibold ${colorClass}`}>{value}</div>
    </div>
  );
}

function statusTextClass(status: string): string {
  switch (status) {
    case 'major_flood': return 'text-red-700';
    case 'minor_flood': return 'text-orange-700';
    case 'alert':       return 'text-yellow-700';
    default:            return 'text-green-700';
  }
}

function statusBgClass(status: string): string {
  switch (status) {
    case 'major_flood': return 'bg-red-600';
    case 'minor_flood': return 'bg-orange-500';
    case 'alert':       return 'bg-yellow-500';
    default:            return 'bg-green-600';
  }
}
