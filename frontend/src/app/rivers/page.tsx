// SPDX-License-Identifier: Apache-2.0

'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback } from 'react';
import { api, IrrigationStation, RiverStation } from '@/lib/api';

// Leaflet only runs in the browser; load lazily to avoid SSR `window is undefined`.
const RiversMap = dynamic(() => import('@/components/RiversMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[600px] sm:h-[720px] w-full bg-slate-100 rounded-2xl flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <span className="text-sm text-slate-500">Loading map...</span>
      </div>
    </div>
  ),
});

// Safe number formatting helper.
const fmt = (v: any, d: number = 0): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return '0';
  return Number(v).toFixed(d);
};

export default function RiversPage() {
  // Irrigation stations (primary - have lat/lon for the map + flood thresholds).
  const [irrigationStations, setIrrigationStations] = useState<IrrigationStation[]>([]);
  // Navy/intel river stations (used by the table - more granular per-river status).
  const [riverStations, setRiverStations] = useState<RiverStation[]>([]);
  const [selectedStation, setSelectedStation] = useState<IrrigationStation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [irrigationResult, riverResult] = await Promise.allSettled([
        api.getIrrigationData(),
        api.getRiverLevels(),
      ]);

      if (irrigationResult.status === 'fulfilled') {
        setIrrigationStations(irrigationResult.value?.stations || []);
      } else {
        console.error('Failed to fetch irrigation data:', irrigationResult.reason);
      }

      if (riverResult.status === 'fulfilled') {
        setRiverStations(riverResult.value?.stations || []);
      } else {
        console.error('Failed to fetch river data:', riverResult.reason);
      }

      // Only show an error if BOTH sources failed.
      if (irrigationResult.status !== 'fulfilled' && riverResult.status !== 'fulfilled') {
        setError('Unable to load river data. Please try again later.');
      }
    } catch (err) {
      console.error('Failed to fetch river data:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Map river-station "trend" status to a sort weight for the table.
  const getStatusToPercentage = (status: string): number => {
    switch (status) {
      case 'rising':
        return 65;
      case 'alert':
        return 45;
      case 'falling':
        return 25;
      case 'normal':
        return 10;
      default:
        return 0;
    }
  };

  const getRiverStatusColor = (status: string) => {
    switch (status) {
      case 'rising':
        return 'bg-orange-500 text-white';
      case 'alert':
        return 'bg-yellow-500 text-black';
      case 'falling':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-green-600 text-white';
    }
  };

  const getRiverStatusLabel = (status: string) => {
    switch (status) {
      case 'rising':
        return 'RISING';
      case 'alert':
        return 'ALERT';
      case 'falling':
        return 'FALLING';
      default:
        return 'NORMAL';
    }
  };

  // Irrigation status -> pill colors (the map uses the same palette).
  const irrigationStatusBadge = (status: string) => {
    switch (status) {
      case 'major_flood':
        return 'bg-red-600 text-white';
      case 'minor_flood':
        return 'bg-orange-500 text-white';
      case 'alert':
        return 'bg-yellow-500 text-black';
      default:
        return 'bg-green-600 text-white';
    }
  };

  const irrigationStatusLabel = (status: string) => {
    switch (status) {
      case 'major_flood':
        return 'MAJOR FLOOD';
      case 'minor_flood':
        return 'MINOR FLOOD';
      case 'alert':
        return 'ALERT';
      default:
        return 'NORMAL';
    }
  };

  // Summary counts from the irrigation feed (used in the status strip above the map).
  const summary = {
    total: irrigationStations.length,
    normal: irrigationStations.filter((s) => s.status === 'normal').length,
    alert: irrigationStations.filter((s) => s.status === 'alert').length,
    minor: irrigationStations.filter((s) => s.status === 'minor_flood').length,
    major: irrigationStations.filter((s) => s.status === 'major_flood').length,
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <a href="/" className="text-slate-600 hover:text-slate-900 transition-colors flex-shrink-0">
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </a>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold truncate">Rivers</h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5 hidden sm:block">
                River water level monitoring
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">
        {loading ? (
          <div className="flex items-center justify-center" style={{ minHeight: '400px' }}>
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Error Banner */}
            {error && (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
                <p className="text-sm text-yellow-700">{error}</p>
              </div>
            )}

            {/* Map + summary */}
            {irrigationStations.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                <div className="p-3 sm:p-4 border-b border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                        <span className="text-xl sm:text-2xl">🗺️</span>
                        <span>Live Gauging Station Map</span>
                      </h2>
                      <p className="text-[10px] sm:text-xs text-slate-600 mt-1">
                        {summary.total} stations from Sri Lanka Irrigation Department - click a marker for details.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-50 border border-red-200 text-red-700">
                        <span className="w-2 h-2 rounded-full bg-red-500" /> Major {summary.major}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-50 border border-orange-200 text-orange-700">
                        <span className="w-2 h-2 rounded-full bg-orange-500" /> Minor {summary.minor}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-700">
                        <span className="w-2 h-2 rounded-full bg-yellow-500" /> Alert {summary.alert}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-50 border border-green-200 text-green-700">
                        <span className="w-2 h-2 rounded-full bg-green-500" /> Normal {summary.normal}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="relative h-[600px] sm:h-[720px]">
                  <RiversMap
                    stations={irrigationStations}
                    selectedStation={selectedStation}
                    onStationSelect={setSelectedStation}
                  />
                </div>

                {selectedStation && (
                  <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {selectedStation.station}
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            ({selectedStation.river})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5">
                          {selectedStation.districts.join(', ')} - updated{' '}
                          {new Date(selectedStation.last_updated).toLocaleString()}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-[10px] sm:text-xs font-bold ${irrigationStatusBadge(
                          selectedStation.status,
                        )}`}
                      >
                        {irrigationStatusLabel(selectedStation.status)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
                      <div className="bg-white rounded-lg p-2 border border-slate-200">
                        <div className="text-slate-500">Water level</div>
                        <div className="font-mono font-semibold text-slate-900">
                          {fmt(selectedStation.water_level_m, 2)} m
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-slate-200">
                        <div className="text-slate-500">Alert level</div>
                        <div className="font-mono text-slate-900">
                          {fmt(selectedStation.alert_level_m, 2)} m
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-slate-200">
                        <div className="text-slate-500">Minor flood</div>
                        <div className="font-mono text-orange-700">
                          {fmt(selectedStation.minor_flood_level_m, 2)} m
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-slate-200">
                        <div className="text-slate-500">Major flood</div>
                        <div className="font-mono text-red-700">
                          {fmt(selectedStation.major_flood_level_m, 2)} m
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* River Network Status (Navy/intel feed grouped by river) */}
            {riverStations.length > 0 && (
              <div className="bg-white rounded-2xl p-3 sm:p-4 shadow-lg border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 sm:mb-4">
                  <h2 className="text-base sm:text-lg font-semibold flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl sm:text-2xl">🌊</span>
                      <span>River Network Status</span>
                    </div>
                    <span className="text-xs sm:text-sm font-normal text-slate-600">
                      ({riverStations.length} stations monitored)
                    </span>
                  </h2>
                  <a
                    href="https://www.arcgis.com/apps/dashboards/2cffe83c9ff5497d97375498bdf3ff38"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:shadow-lg text-white text-xs sm:text-sm font-semibold rounded-xl transition-all shadow-md"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>Live Dashboard</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>

                <div className="mb-3 sm:mb-4">
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-1 sm:mb-2">Status by River</h3>
                  <p className="text-[10px] sm:text-xs text-slate-600 mb-2">
                    Data source: Sri Lanka Department of Meteorology (updated every 5 mins)
                  </p>
                  <div className="overflow-x-auto -mx-3 sm:mx-0">
                    <div className="inline-block min-w-full px-3 sm:px-0">
                      <table className="w-full text-xs sm:text-sm min-w-[640px]">
                        <thead>
                          <tr className="bg-slate-50 text-slate-700 border-b border-slate-300 text-[10px] sm:text-xs">
                            <th className="text-left py-2 px-1 sm:px-2">River</th>
                            <th
                              className="text-center py-2 px-1 cursor-help"
                              title="Number of gauging stations monitored on this river"
                            >
                              Stations
                            </th>
                            <th
                              className="text-center py-2 px-1 text-red-700 cursor-help"
                              title="Stations with rising water levels"
                            >
                              Rising
                            </th>
                            <th
                              className="text-center py-2 px-1 text-orange-700 cursor-help"
                              title="Stations in alert status"
                            >
                              Alert
                            </th>
                            <th
                              className="text-center py-2 px-1 text-blue-700 cursor-help"
                              title="Stations with falling water levels"
                            >
                              Falling
                            </th>
                            <th
                              className="text-center py-2 px-1 text-green-700 cursor-help"
                              title="Stations at normal water levels"
                            >
                              Normal
                            </th>
                            <th
                              className="text-center py-2 px-1 cursor-help"
                              title="Overall status based on worst station condition on this river"
                            >
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            // Group stations by river and surface the worst status.
                            const riverGroups = riverStations.reduce((acc, station) => {
                              if (!acc[station.river]) acc[station.river] = [];
                              acc[station.river].push(station);
                              return acc;
                            }, {} as Record<string, RiverStation[]>);

                            return Object.entries(riverGroups)
                              .map(([river, stations]) => {
                                const rising = stations.filter((s) => s.status === 'rising').length;
                                const alert = stations.filter((s) => s.status === 'alert').length;
                                const falling = stations.filter((s) => s.status === 'falling').length;
                                const normal = stations.filter((s) => s.status === 'normal').length;
                                const highestPct = Math.max(
                                  ...stations.map((s) => getStatusToPercentage(s.status)),
                                );
                                const worstStatus =
                                  rising > 0
                                    ? 'rising'
                                    : alert > 0
                                    ? 'alert'
                                    : falling > 0
                                    ? 'falling'
                                    : 'normal';
                                return {
                                  river,
                                  stations,
                                  rising,
                                  alert,
                                  falling,
                                  normal,
                                  highestPct,
                                  worstStatus,
                                };
                              })
                              .sort((a, b) => b.highestPct - a.highestPct)
                              .map((row, idx) => (
                                <tr
                                  key={idx}
                                  className="border-b border-slate-200 hover:bg-slate-50 group/row relative transition-colors"
                                >
                                  <td className="py-2 px-1 sm:px-2 font-medium cursor-help relative">
                                    {row.river}
                                    {/* Hover tooltip with station details */}
                                    <div className="absolute left-0 top-full mt-1 px-3 py-2 bg-slate-900 text-xs text-gray-200 rounded-lg opacity-0 group-hover/row:opacity-100 transition-opacity pointer-events-none w-80 z-20 shadow-lg border border-gray-700">
                                      <div className="font-semibold text-white mb-2">
                                        {row.river} - Gauging Stations
                                      </div>
                                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                        {row.stations
                                          .slice()
                                          .sort(
                                            (a, b) =>
                                              getStatusToPercentage(b.status) -
                                              getStatusToPercentage(a.status),
                                          )
                                          .map((s, i) => (
                                            <div
                                              key={i}
                                              className={`flex justify-between items-center py-1 border-b border-gray-800 ${
                                                s.status === 'rising'
                                                  ? 'text-orange-400'
                                                  : s.status === 'alert'
                                                  ? 'text-yellow-400'
                                                  : s.status === 'falling'
                                                  ? 'text-blue-400'
                                                  : 'text-gray-400'
                                              }`}
                                            >
                                              <span className="font-medium">{s.station}</span>
                                              <span className="font-mono text-right">
                                                {fmt(s.water_level_m, 2)}m
                                                <span className="text-gray-500 ml-1">({s.status})</span>
                                              </span>
                                            </div>
                                          ))}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="text-center py-2 px-1 text-slate-600">{row.stations.length}</td>
                                  <td className="text-center py-2 px-1">
                                    {row.rising > 0 ? (
                                      <span className="text-red-600 font-bold">{row.rising}</span>
                                    ) : (
                                      <span className="text-slate-300">0</span>
                                    )}
                                  </td>
                                  <td className="text-center py-2 px-1">
                                    {row.alert > 0 ? (
                                      <span className="text-orange-600 font-bold">{row.alert}</span>
                                    ) : (
                                      <span className="text-slate-300">0</span>
                                    )}
                                  </td>
                                  <td className="text-center py-2 px-1">
                                    {row.falling > 0 ? (
                                      <span className="text-blue-600 font-bold">{row.falling}</span>
                                    ) : (
                                      <span className="text-slate-300">0</span>
                                    )}
                                  </td>
                                  <td className="text-center py-2 px-1">
                                    <span className="text-green-600">{row.normal}</span>
                                  </td>
                                  <td className="text-center py-2 px-1">
                                    <span
                                      className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-bold ${getRiverStatusColor(
                                        row.worstStatus,
                                      )}`}
                                    >
                                      {getRiverStatusLabel(row.worstStatus)}
                                    </span>
                                  </td>
                                </tr>
                              ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Empty state */}
            {irrigationStations.length === 0 && riverStations.length === 0 && !error && (
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-200 text-center text-slate-500">
                No river data available right now. Try refreshing in a few moments.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
