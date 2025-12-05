'use client';

import { useEffect, useState } from 'react';
import { Card, DonutChart, BarList } from '@tremor/react';
import { api, IrrigationResponse } from '@/lib/api';

interface RiverStatusSummary {
  total: number;
  major_flood: number;
  minor_flood: number;
  alert: number;
  normal: number;
}

export default function RiverNetworkStatus() {
  const [data, setData] = useState<IrrigationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllStations, setShowAllStations] = useState(false);

  useEffect(() => {
    const fetchRiverData = async () => {
      try {
        const riverData = await api.getIrrigationData();
        setData(riverData);
      } catch (err) {
        console.error('Failed to fetch river data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRiverData();
  }, []);

  if (loading) {
    return (
      <div className="bg-white/20 backdrop-blur-sm rounded-xl border border-white/30 overflow-hidden flex flex-col" style={{ height: '320px' }}>
        <div className="px-4 py-3 border-b border-white/30 flex items-center gap-2 bg-blue-500/20">
          <span className="text-lg">🌊</span>
          <h2 className="text-sm font-bold text-slate-900">River Network Status</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const summary = data.summary;

  // Data for donut chart
  const chartData = [
    {
      name: 'Major Flood',
      value: summary.major_flood,
      color: 'rose',
    },
    {
      name: 'Minor Flood',
      value: summary.minor_flood,
      color: 'orange',
    },
    {
      name: 'Alert',
      value: summary.alert,
      color: 'amber',
    },
    {
      name: 'Normal',
      value: summary.normal,
      color: 'emerald',
    },
  ].filter(item => item.value > 0);

  // Data for bar list (top risk rivers)
  const topRiskRivers = data.stations
    .sort((a, b) => {
      const statusPriority: Record<string, number> = {
        'major_flood': 4,
        'minor_flood': 3,
        'alert': 2,
        'normal': 1,
      };
      return (statusPriority[b.status] || 0) - (statusPriority[a.status] || 0);
    })
    .slice(0, 5)
    .map(station => ({
      name: station.station,
      value: station.pct_to_alert,
      color: station.status === 'major_flood' ? 'rose' :
             station.status === 'minor_flood' ? 'orange' :
             station.status === 'alert' ? 'amber' : 'emerald',
    }));

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'major_flood': return 'bg-rose-100 text-rose-700 border-rose-300';
      case 'minor_flood': return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'alert': return 'bg-amber-100 text-amber-700 border-amber-300';
      default: return 'bg-emerald-100 text-emerald-700 border-emerald-300';
    }
  };

  const criticalCount = summary.major_flood + summary.minor_flood;

  return (
    <div className="bg-white/20 backdrop-blur-sm rounded-xl border border-white/30 overflow-hidden flex flex-col" style={{ height: '380px' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/30 flex items-center justify-between bg-blue-500/20">
        <div className="flex items-center gap-2">
          <span className="text-lg">🌊</span>
          <h2 className="text-sm font-bold text-slate-900">River Network Status</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-blue-900 bg-blue-200 px-2 py-0.5 rounded-full">
            {summary.total_stations} stations
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Critical Alert Banner */}
        {criticalCount > 0 && (
          <div className="bg-rose-500/20 border border-rose-300/50 rounded-lg p-3 flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="text-sm font-bold text-rose-900">
                {criticalCount} {criticalCount === 1 ? 'River' : 'Rivers'} in Flood
              </div>
              <div className="text-xs text-rose-700">Immediate attention required</div>
            </div>
          </div>
        )}

        {/* Status Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className={`border rounded-lg p-2.5 ${getStatusBgColor('major_flood')}`}>
            <div className="text-xs opacity-75">Major Flood</div>
            <div className="text-xl font-bold">{summary.major_flood}</div>
          </div>
          <div className={`border rounded-lg p-2.5 ${getStatusBgColor('minor_flood')}`}>
            <div className="text-xs opacity-75">Minor Flood</div>
            <div className="text-xl font-bold">{summary.minor_flood}</div>
          </div>
          <div className={`border rounded-lg p-2.5 ${getStatusBgColor('alert')}`}>
            <div className="text-xs opacity-75">Alert</div>
            <div className="text-xl font-bold">{summary.alert}</div>
          </div>
          <div className={`border rounded-lg p-2.5 ${getStatusBgColor('normal')}`}>
            <div className="text-xs opacity-75">Normal</div>
            <div className="text-xl font-bold">{summary.normal}</div>
          </div>
        </div>

        {/* Top Risk Stations */}
        {topRiskRivers.length > 0 && (
          <div>
            <div className="text-xs font-bold text-slate-900 mb-2">Top Risk Stations</div>
            <div className="space-y-1">
              {topRiskRivers.map((river, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs py-1 px-2 bg-white/30 rounded">
                  <span className="text-slate-900 font-medium truncate flex-1">{river.name}</span>
                  <span className={`font-bold ml-2 ${
                    river.value >= 100 ? 'text-rose-700' :
                    river.value >= 80 ? 'text-orange-700' :
                    river.value >= 60 ? 'text-amber-700' : 'text-emerald-700'
                  }`}>
                    {river.value.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* View All Button */}
        <button
          onClick={() => setShowAllStations(true)}
          className="block w-full text-center text-xs text-blue-800 hover:text-blue-900 font-bold py-2 hover:bg-white/30 rounded-lg transition-colors"
        >
          View all stations →
        </button>
      </div>

      {/* Floating All Stations Panel */}
      {showAllStations && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-[3000] animate-in fade-in duration-200"
            onClick={() => setShowAllStations(false)}
          />

          {/* Panel */}
          <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[600px] md:max-h-[80vh] z-[3001] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-300 flex flex-col animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-blue-500/10">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🌊</span>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">All River Stations</h2>
                  <p className="text-xs text-slate-600 mt-0.5">{summary.total_stations} monitoring stations</p>
                </div>
              </div>
              <button
                onClick={() => setShowAllStations(false)}
                className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-2">
                {data.stations
                  .sort((a, b) => {
                    const statusPriority: Record<string, number> = {
                      'major_flood': 4,
                      'minor_flood': 3,
                      'alert': 2,
                      'normal': 1,
                    };
                    return (statusPriority[b.status] || 0) - (statusPriority[a.status] || 0);
                  })
                  .map((station, idx) => {
                    const statusColor =
                      station.status === 'major_flood' ? 'bg-rose-100 border-rose-300 text-rose-800' :
                      station.status === 'minor_flood' ? 'bg-orange-100 border-orange-300 text-orange-800' :
                      station.status === 'alert' ? 'bg-amber-100 border-amber-300 text-amber-800' :
                      'bg-emerald-100 border-emerald-300 text-emerald-800';

                    const pctColor =
                      station.pct_to_alert >= 100 ? 'text-rose-700' :
                      station.pct_to_alert >= 80 ? 'text-orange-700' :
                      station.pct_to_alert >= 60 ? 'text-amber-700' : 'text-emerald-700';

                    return (
                      <div key={idx} className={`border rounded-lg p-3 ${statusColor}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="font-bold text-sm">{station.station}</div>
                            <div className="text-xs opacity-75 mt-0.5">{station.river}</div>
                            <div className="text-xs mt-1">
                              Districts: {station.districts.join(', ')}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-2xl font-bold ${pctColor}`}>{station.pct_to_alert.toFixed(0)}%</div>
                            <div className="text-xs opacity-75 mt-0.5">
                              {station.water_level_m.toFixed(2)}m / {station.alert_level_m.toFixed(2)}m
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
