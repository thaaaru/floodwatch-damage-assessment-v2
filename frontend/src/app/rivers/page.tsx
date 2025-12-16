// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, FloodThreatResponse, RiverStation } from '@/lib/api';

// Safe number formatting helper
const fmt = (v: any, d: number = 0): string => {
  if (v === null || v === undefined || isNaN(Number(v))) return '0';
  return Number(v).toFixed(d);
};

export default function FloodInformationPage() {
  const [floodThreat, setFloodThreat] = useState<FloodThreatResponse | null>(null);
  const [riverStations, setRiverStations] = useState<RiverStation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [threatData, riverData] = await Promise.all([
        api.getFloodThreat(),
        api.getRiverLevels(),
      ]);
      setFloodThreat(threatData);
      setRiverStations(riverData?.stations || []);
    } catch (err) {
      console.error('Failed to fetch flood data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 minutes
    const interval = setInterval(fetchData, 1800000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getThreatLevelColor = (level: string): string => {
    switch (level.toLowerCase()) {
      case 'critical':
        return 'bg-red-600';
      case 'high':
        return 'bg-orange-600';
      case 'moderate':
        return 'bg-yellow-600';
      case 'low':
        return 'bg-green-600';
      default:
        return 'bg-gray-600';
    }
  };

  const getThreatLevelBorder = (level: string) => {
    switch (level) {
      case 'CRITICAL': return 'border-red-500';
      case 'HIGH': return 'border-orange-500';
      case 'MEDIUM': return 'border-yellow-500';
      default: return 'border-green-500';
    }
  };

  // Map river station status to percentage and colors
  const getStatusToPercentage = (status: string): number => {
    switch (status) {
      case 'rising':
        return 65; // Rising water - elevated risk
      case 'alert':
        return 45; // Alert status
      case 'falling':
        return 25; // Falling water - lower risk
      case 'normal':
        return 10; // Normal conditions
      default:
        return 0; // Unknown
    }
  };

  const getRiverStatusColor = (status: string) => {
    switch (status) {
      case 'rising': return 'bg-orange-500 text-white';
      case 'alert': return 'bg-yellow-500 text-black';
      case 'falling': return 'bg-blue-500 text-white';
      default:
        return 'bg-green-600 text-white';
    }
  };

  const getRiverStatusLabel = (status: string) => {
    switch (status) {
      case 'rising': return 'RISING';
      case 'alert': return 'ALERT';
      case 'falling': return 'FALLING';
      default:
        return 'NORMAL';
    }
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
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5 hidden sm:block">River water level monitoring</p>
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
            {/* National Threat Level Banner */}
            {floodThreat && (
              <div className={`bg-white rounded-2xl p-6 border-2 shadow-lg ${getThreatLevelBorder(floodThreat.national_threat_level)}`}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-r from-red-600 to-orange-500 text-white px-6 py-3 rounded-xl shadow-md">
                      <div className="text-sm font-medium opacity-90">NATIONAL THREAT</div>
                      <div className="text-3xl font-bold">{floodThreat.national_threat_level}</div>
                    </div>
                    <div>
                      <div className="text-5xl font-bold text-slate-900">{fmt(floodThreat.national_threat_score)}<span className="text-2xl text-slate-500">/100</span></div>
                      <div className="text-sm text-slate-600">Composite Threat Score</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-red-50 rounded-xl p-3 border border-red-200 shadow-md">
                      <div className="text-2xl font-bold text-red-700">{floodThreat.summary.critical_districts}</div>
                      <div className="text-xs text-slate-700">Critical Districts</div>
                    </div>
                    <div className="bg-orange-50 rounded-xl p-3 border border-orange-200 shadow-md">
                      <div className="text-2xl font-bold text-orange-700">{floodThreat.summary.high_risk_districts}</div>
                      <div className="text-xs text-slate-700">High Risk</div>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-3 border border-yellow-200 shadow-sm">
                      <div className="text-2xl font-bold text-yellow-700">{floodThreat.summary.medium_risk_districts}</div>
                      <div className="text-xs text-slate-700">Medium Risk</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* River Network Status */}
            {riverStations.length > 0 && (
              <div className="bg-white rounded-2xl p-3 sm:p-4 shadow-lg border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 sm:mb-4">
                  <h2 className="text-base sm:text-lg font-semibold flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl sm:text-2xl">🌊</span>
                      <span>River Network Status</span>
                    </div>
                    <span className="text-xs sm:text-sm font-normal text-slate-600">({riverStations.length} stations monitored)</span>
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

                {/* River Summary by River Name */}
                <div className="mb-3 sm:mb-4">
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-1 sm:mb-2">Status by River</h3>
                  <p className="text-[10px] sm:text-xs text-slate-600 mb-2">Data source: Sri Lanka Department of Meteorology (updated every 5 mins)</p>
                  <div className="overflow-x-auto -mx-3 sm:mx-0">
                    <div className="inline-block min-w-full px-3 sm:px-0">
                    <table className="w-full text-xs sm:text-sm min-w-[640px]">
                      <thead>
                        <tr className="bg-slate-50 text-slate-700 border-b border-slate-300 text-[10px] sm:text-xs">
                          <th className="text-left py-2 px-1 sm:px-2">River</th>
                          <th className="text-center py-2 px-1 cursor-help" title="Number of gauging stations monitored on this river">Stations</th>
                          <th className="text-center py-2 px-1 text-red-700 cursor-help" title="Stations with rising water levels">Rising</th>
                          <th className="text-center py-2 px-1 text-orange-700 cursor-help" title="Stations in alert status">Alert</th>
                          <th className="text-center py-2 px-1 text-blue-700 cursor-help" title="Stations with falling water levels">Falling</th>
                          <th className="text-center py-2 px-1 text-green-700 cursor-help" title="Stations at normal water levels">Normal</th>
                          <th className="text-center py-2 px-1 cursor-help" title="Risk level indicator based on worst station condition on this river">Highest Risk</th>
                          <th className="text-center py-2 px-1 cursor-help" title="Overall status based on worst station condition on this river">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          // Group stations by river
                          const riverGroups = riverStations.reduce((acc, station) => {
                            if (!acc[station.river]) {
                              acc[station.river] = [];
                            }
                            acc[station.river].push(station);
                            return acc;
                          }, {} as Record<string, RiverStation[]>);

                          // Convert to array and sort by highest risk
                          return Object.entries(riverGroups)
                            .map(([river, stations]) => {
                              const rising = stations.filter(s => s.status === 'rising').length;
                              const alert = stations.filter(s => s.status === 'alert').length;
                              const falling = stations.filter(s => s.status === 'falling').length;
                              const normal = stations.filter(s => s.status === 'normal').length;
                              const highestPct = Math.max(...stations.map(s => getStatusToPercentage(s.status)));
                              const worstStatus = rising > 0 ? 'rising' : alert > 0 ? 'alert' : falling > 0 ? 'falling' : 'normal';
                              return { river, stations, rising, alert, falling, normal, highestPct, worstStatus };
                            })
                            .sort((a, b) => b.highestPct - a.highestPct)
                            .map((row, idx) => (
                              <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50 group/row relative transition-colors">
                                <td className="py-2 px-1 sm:px-2 font-medium cursor-help relative">
                                  {row.river}
                                  {/* Hover tooltip with station details */}
                                  <div className="absolute left-0 top-full mt-1 px-3 py-2 bg-slate-900 text-xs text-gray-200 rounded-lg opacity-0 group-hover/row:opacity-100 transition-opacity pointer-events-none w-80 z-20 shadow-lg border border-gray-700">
                                    <div className="font-semibold text-white mb-2">{row.river} - Gauging Stations</div>
                                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                      {row.stations
                                        .sort((a, b) => getStatusToPercentage(b.status) - getStatusToPercentage(a.status))
                                        .map((s, i) => (
                                        <div key={i} className={`flex justify-between items-center py-1 border-b border-gray-800 ${
                                          s.status === 'rising' ? 'text-orange-400' :
                                          s.status === 'alert' ? 'text-yellow-400' :
                                          s.status === 'falling' ? 'text-blue-400' : 'text-gray-400'
                                        }`}>
                                          <span className="font-medium">{s.station}</span>
                                          <span className="font-mono text-right">
                                            {fmt(s.water_level_m, 2)}m
                                            <span className="text-gray-500 ml-1">({s.status})</span>
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-gray-700 text-gray-500 text-[10px]">
                                      Format: Current Level (status code)
                                    </div>
                                  </div>
                                </td>
                                <td className="text-center py-2 px-1 text-slate-600">{row.stations.length}</td>
                                <td className="text-center py-2 px-1">
                                  {row.rising > 0 ? <span className="text-red-600 font-bold">{row.rising}</span> : <span className="text-slate-300">0</span>}
                                </td>
                                <td className="text-center py-2 px-1">
                                  {row.alert > 0 ? <span className="text-orange-600 font-bold">{row.alert}</span> : <span className="text-slate-300">0</span>}
                                </td>
                                <td className="text-center py-2 px-1">
                                  {row.falling > 0 ? <span className="text-blue-600 font-bold">{row.falling}</span> : <span className="text-slate-300">0</span>}
                                </td>
                                <td className="text-center py-2 px-1">
                                  <span className="text-green-600">{row.normal}</span>
                                </td>
                                <td className="text-center py-2 px-1">
                                  <div className="flex items-center justify-center gap-1 sm:gap-2">
                                    <div className="w-12 sm:w-16 bg-slate-200 rounded-full h-1.5 sm:h-2">
                                      <div
                                        className={`h-1.5 sm:h-2 rounded-full ${
                                          row.highestPct >= 65 ? 'bg-orange-500' :
                                          row.highestPct >= 45 ? 'bg-yellow-500' :
                                          row.highestPct >= 25 ? 'bg-blue-500' : 'bg-green-500'
                                        }`}
                                        style={{ width: `${Math.min(row.highestPct, 100)}%` }}
                                      ></div>
                                    </div>
                                    <span className="font-mono text-[10px] sm:text-xs">{fmt(row.highestPct)}%</span>
                                  </div>
                                </td>
                                <td className="text-center py-2 px-1">
                                  <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-bold ${getRiverStatusColor(row.worstStatus)}`}>
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

            {/* Top Risk Districts */}
            {floodThreat && floodThreat.top_risk_districts.length > 0 && (
              <div className="bg-white rounded-2xl p-3 sm:p-4 shadow-lg border border-slate-200">
                <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Top Risk Districts</h2>
                <div className="overflow-x-auto -mx-3 sm:mx-0">
                  <div className="inline-block min-w-full px-3 sm:px-0">
                  <table className="w-full text-xs sm:text-sm min-w-[640px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-700 border-b border-slate-300 text-[10px] sm:text-xs">
                        <th className="text-left py-2 px-1 sm:px-2">District</th>
                        <th className="text-center py-2 px-1">Threat Score</th>
                        <th className="text-center py-2 px-1">Level</th>
                        <th className="text-center py-2 px-1">Rain</th>
                        <th className="text-center py-2 px-1">River</th>
                        <th className="text-center py-2 px-1">Forecast</th>
                        <th className="text-left py-2 px-1 sm:px-2">Key Factors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {floodThreat.top_risk_districts.slice(0, 10).map((d, idx) => (
                        <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-1 sm:px-2 font-medium">{d.district}</td>
                          <td className="text-center py-2 px-1">
                            <div className="flex items-center justify-center gap-1 sm:gap-2">
                              <div className="w-12 sm:w-16 bg-slate-200 rounded-full h-1.5 sm:h-2">
                                <div
                                  className={`h-1.5 sm:h-2 rounded-full ${getThreatLevelColor(d.threat_level)}`}
                                  style={{ width: `${d.threat_score}%` }}
                                ></div>
                              </div>
                              <span className="font-mono font-bold text-[10px] sm:text-xs">{fmt(d.threat_score)}</span>
                            </div>
                          </td>
                          <td className="text-center py-2 px-1">
                            <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-bold ${getThreatLevelColor(d.threat_level)} text-white`}>
                              {d.threat_level}
                            </span>
                          </td>
                          <td className="text-center py-2 px-1 font-mono text-blue-600 text-[10px] sm:text-xs">{fmt(d.rainfall_score)}</td>
                          <td className="text-center py-2 px-1 font-mono text-cyan-600 text-[10px] sm:text-xs">{fmt(d.river_score)}</td>
                          <td className="text-center py-2 px-1 font-mono text-purple-600 text-[10px] sm:text-xs">{fmt(d.forecast_score)}</td>
                          <td className="py-2 px-1 sm:px-2 text-[10px] sm:text-xs text-slate-600">
                            {d.factors.slice(0, 2).map((f, i) => (
                              <div key={i} className="truncate max-w-[120px] sm:max-w-none">{f.value}</div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
