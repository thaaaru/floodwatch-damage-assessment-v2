// SPDX-License-Identifier: Apache-2.0

'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { api, IrrigationStation, MetStation, MetStationsResponse } from '@/lib/api';
import { ui } from '@/lib/ui';
import BasinStatusTable from '@/components/BasinStatusTable';

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
  const [gauges, setGauges] = useState<IrrigationStation[]>([]);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await api.getMetStations();
      setData(res);
      setLastFetched(new Date());
      // River gauges are a secondary layer: a failure must not blank the rainfall map.
      api.getIrrigationData()
        .then((g) => setGauges(g?.stations ?? []))
        .catch((e) => console.error('Failed to fetch river gauges:', e));
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

  const onAlert = gauges.filter((g) => g.status === 'alert' || g.status === 'minor' || g.status === 'major').length;
  const updated = lastFetched?.toLocaleTimeString('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit' });

  return (
    <div className={ui.page}>
      {/* Header strip */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <h1 className={`${ui.h1} flex items-center gap-2`}>
                <span>🌧️</span>
                <span>Rainfall &amp; rivers now</span>
              </h1>
              <p className={`${ui.intro} mt-0.5`}>
                Rainfall measured at {summary?.station_count ?? 0} stations of the{' '}
                <a
                  href="https://meteo.gov.lk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ui.link}
                >
                  Sri Lanka Department of Meteorology
                </a>
                {gauges.length > 0 && <>, and water levels at {gauges.length} Irrigation Department river gauges</>}.
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

      <div className={`max-w-7xl ${ui.container} space-y-4`}>
      {/* Map box: part of the page flow, not full-screen. */}
      <div className={`relative ${ui.card} overflow-hidden`}>
        <div className="h-[max(360px,55vh)] sm:h-[clamp(420px,60vh,640px)]">
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
              gauges={gauges}
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

      {/* Status strip */}
      <div className={`${ui.card} ${ui.cardPad} flex flex-wrap items-center gap-x-4 gap-y-1 ${ui.body}`}>
        <span>
          <span className="font-semibold text-white">{gauges.length} gauges</span>
          {gauges.length > 0 && (
            <>
              {' · '}
              {onAlert === 0 ? (
                <span className="text-emerald-300">all normal</span>
              ) : (
                <span className="text-amber-300">{onAlert} on alert</span>
              )}
            </>
          )}
        </span>
        {reportTimeLocal && <span>Met rainfall {reportTimeLocal}</span>}
        {updated && <span className="sm:ml-auto">Updated {updated}</span>}
      </div>

      <BasinStatusTable stations={gauges} />

      <p className={ui.muted}>
        Measured rainfall from 24 Sri Lanka Department of Meteorology stations. The optional Rain forecast layer
        is a model (Open-Meteo), not measured.
      </p>
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
