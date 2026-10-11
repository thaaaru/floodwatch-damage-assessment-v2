// SPDX-License-Identifier: Apache-2.0

'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback } from 'react';
import { api, GaugeStatus, IrrigationStation } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader';
import Section from '@/components/ui/Section';
import { ui } from '@/lib/ui';
import { BASIN_CREDIT, GAUGE_CREDIT, STATUS_COLOR, STATUS_LABEL, colomboTime, worstStatus } from '@/lib/gaugeStatus';

// Leaflet only runs in the browser; load lazily to avoid SSR `window is undefined`.
const RiversMap = dynamic(() => import('@/components/RiversMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[600px] sm:h-[720px] w-full bg-slate-900 rounded-2xl flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-blue-700/50 border-t-blue-600 rounded-full animate-spin" />
        <span className="text-sm text-slate-400">Loading map...</span>
      </div>
    </div>
  ),
});

const fmtM = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toFixed(2)} m`);
const ARROW = { rising: '↑', falling: '↓', steady: '→' } as const;

function StatusPill({ status }: { status: GaugeStatus }) {
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold text-white"
      style={{ background: STATUS_COLOR[status] }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function RiversPage() {
  const [stations, setStations] = useState<IrrigationStation[]>([]);
  const [selectedStation, setSelectedStation] = useState<IrrigationStation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await api.getIrrigationData();
      setStations(res?.stations ?? []);
    } catch (err) {
      console.error('Failed to fetch river gauges:', err);
      setError('Unable to load river gauge data. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Gauges are synced server-side every 15 min; polling faster adds nothing.
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const count = (s: GaugeStatus) => stations.filter((g) => g.status === s).length;
  const staleCount = stations.filter((g) => g.stale).length;

  // Basin table: worst status first, then most gauges.
  const basins = Object.entries(
    stations.reduce<Record<string, IrrigationStation[]>>((acc, g) => {
      (acc[g.basin ?? g.river ?? 'Unknown'] ??= []).push(g);
      return acc;
    }, {}),
  )
    .map(([basin, gs]) => ({ basin, gauges: gs, worst: worstStatus(gs) as GaugeStatus }))
    .sort((a, b) =>
      ['major', 'minor', 'alert', 'normal', 'unknown'].indexOf(a.worst) -
        ['major', 'minor', 'alert', 'normal', 'unknown'].indexOf(b.worst) || b.gauges.length - a.gauges.length,
    );

  return (
    <div className={ui.page}>
      <PageHeader title="Rivers" subtitle="Live river gauges and basins" />

      <div className={`max-w-7xl ${ui.container}`}>
        {loading ? (
          <div className="flex items-center justify-center" style={{ minHeight: '400px' }}>
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {error && (
              <div className="bg-yellow-600/20 border-l-4 border-yellow-600 p-4 rounded-lg">
                <p className="text-sm text-yellow-300">{error}</p>
              </div>
            )}

            {stations.length > 0 && (
              <div className={`${ui.card} overflow-hidden`}>
                <div className="p-3 sm:p-4 border-b border-slate-700">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h2 className={ui.h2}>Live gauging stations</h2>
                      <p className={`${ui.meta} mt-1`}>
                        {stations.length} gauges, coloured by status with a trend arrow. Faded, dashed markers are stale (no
                        reading for over 6 h). Click a gauge or basin for details.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {(['major', 'minor', 'alert', 'normal', 'unknown'] as GaugeStatus[]).map((s) => (
                        <span key={s} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900 border border-slate-700 text-slate-200">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                          {STATUS_LABEL[s]} {count(s)}
                        </span>
                      ))}
                      {staleCount > 0 && (
                        <span className="px-2 py-1 rounded-md bg-red-900/40 border border-red-700/60 text-red-200">
                          Stale {staleCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="relative h-[600px] sm:h-[720px]">
                  <RiversMap
                    stations={stations}
                    selectedStation={selectedStation}
                    onStationSelect={setSelectedStation}
                  />
                </div>

                {selectedStation && (
                  <div className="p-3 sm:p-4 border-t border-slate-700 bg-slate-900">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {selectedStation.station}
                          <span className="ml-2 text-xs font-normal text-slate-400">({selectedStation.basin})</span>
                        </div>
                        <div className="text-[11px] text-slate-300 mt-0.5">
                          Reading {colomboTime(selectedStation.observed_at)} (Colombo)
                          {selectedStation.trend && ` · ${ARROW[selectedStation.trend]} ${selectedStation.trend}`}
                          {selectedStation.stale && <span className="ml-2 text-red-300 font-semibold">stale</span>}
                        </div>
                      </div>
                      <StatusPill status={selectedStation.status} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
                      {[
                        ['Water level', selectedStation.water_level_m],
                        ['Alert level', selectedStation.alert_level_m],
                        ['Minor flood', selectedStation.minor_flood_level_m],
                        ['Major flood', selectedStation.major_flood_level_m],
                      ].map(([label, v]) => (
                        <div key={label as string} className="bg-slate-800 rounded-lg p-2 border border-slate-700">
                          <div className="text-slate-400">{label}</div>
                          <div className="font-mono font-semibold text-white">{fmtM(v as number | null)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Status by basin (replaces the retired Navy WLRS table) */}
            {stations.length > 0 && (
              <Section title="Status by river basin">
                <div className="overflow-x-auto -mx-3 sm:mx-0">
                  <table className="w-full text-xs sm:text-sm min-w-[600px]">
                    <thead>
                      <tr className={ui.th}>
                        <th className="text-left py-2 px-2">Basin</th>
                        <th className="text-left py-2 px-2">Gauges (level, trend)</th>
                        <th className="text-center py-2 px-2">Rising</th>
                        <th className="text-center py-2 px-2">Stale</th>
                        <th className="text-center py-2 px-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {basins.map((b) => (
                        <tr key={b.basin} className={`${ui.tr} align-top`}>
                          <td className="py-2 px-2 font-medium">{b.basin}</td>
                          <td className="py-2 px-2 text-slate-300">
                            {b.gauges.map((g) => (
                              <span key={g.station} className="inline-block mr-3 whitespace-nowrap">
                                <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: STATUS_COLOR[g.status] }} />
                                {g.station} {fmtM(g.water_level_m)} {g.trend ? ARROW[g.trend] : ''}
                                {g.stale && <span className="text-red-300"> (stale)</span>}
                              </span>
                            ))}
                          </td>
                          <td className="text-center py-2 px-2">{b.gauges.filter((g) => g.trend === 'rising').length}</td>
                          <td className="text-center py-2 px-2">{b.gauges.filter((g) => g.stale).length}</td>
                          <td className="text-center py-2 px-2"><StatusPill status={b.worst} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={`${ui.muted} mt-3`}>
                  {GAUGE_CREDIT}. {BASIN_CREDIT}. Updated every 15 minutes.
                </p>
              </Section>
            )}

            {stations.length === 0 && !error && (
              <div className={`${ui.card} p-8 text-center text-slate-400`}>
                No river gauge data stored yet. The first sync runs a few minutes after start-up.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
