// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface RiverLevelsResponse {
  count: number;
  summary: {
    normal: number;
    alert: number;
    rising: number;
    falling: number;
  };
  stations: any[];
}

interface RiverStatusSummary {
  total: number;
  alert: number;
  rising: number;
  falling: number;
  normal: number;
}

export default function RiverNetworkStatus() {
  const [data, setData] = useState<RiverLevelsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRiverData = async () => {
      try {
        const riverData = await api.getRiverLevels();
        setData(riverData);
      } catch (err) {
        console.error('Failed to fetch river data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRiverData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchRiverData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col" style={{ height: '320px' }}>
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-blue-50">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌊</span>
            <h2 className="text-sm font-bold text-slate-900">River Network Status</h2>
          </div>
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

  // Data for status display (rising is most critical)
  const chartData = [
    {
      name: 'Rising',
      value: summary.rising,
      color: 'rose',
    },
    {
      name: 'Alert',
      value: summary.alert,
      color: 'amber',
    },
    {
      name: 'Falling',
      value: summary.falling,
      color: 'blue',
    },
    {
      name: 'Normal',
      value: summary.normal,
      color: 'emerald',
    },
  ].filter(item => item.value > 0);

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'rising': return 'bg-rose-100 text-rose-700 border-rose-300';
      case 'alert': return 'bg-amber-100 text-amber-700 border-amber-300';
      case 'falling': return 'bg-blue-100 text-blue-700 border-blue-300';
      default: return 'bg-emerald-100 text-emerald-700 border-emerald-300';
    }
  };

  const criticalCount = summary.rising + summary.alert;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col" style={{ height: '320px' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-blue-50">
        <div className="flex items-center gap-2">
          <span className="text-lg">🌊</span>
          <h2 className="text-sm font-bold text-slate-900">River Network Status</h2>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/rivers"
            className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full hover:bg-blue-200 transition-colors cursor-pointer"
          >
            {data.count} stations
          </a>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-2.5 space-y-2">
        {/* Critical Alert Banner */}
        {criticalCount > 0 && (
          <a
            href="/rivers"
            className="bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-center gap-2 w-full text-left hover:bg-rose-100 transition-colors cursor-pointer"
          >
            <span className="text-lg flex-shrink-0">⚠️</span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-rose-900 truncate">
                {summary.rising > 0 && `${summary.rising} Rising`}{summary.rising > 0 && summary.alert > 0 && ', '}{summary.alert > 0 && `${summary.alert} Alert`}
              </div>
              <div className="text-[10px] text-rose-700">Click to view</div>
            </div>
          </a>
        )}

        {/* Status Grid */}
        <div className="grid grid-cols-2 gap-1.5">
          <a
            href="/rivers"
            className={`border rounded-lg p-2 ${getStatusBgColor('rising')} hover:opacity-80 transition-opacity cursor-pointer text-left block`}
          >
            <div className="text-[10px] opacity-75">Rising</div>
            <div className="text-lg font-bold">{summary.rising}</div>
          </a>
          <a
            href="/rivers"
            className={`border rounded-lg p-2 ${getStatusBgColor('alert')} hover:opacity-80 transition-opacity cursor-pointer text-left block`}
          >
            <div className="text-[10px] opacity-75">Alert</div>
            <div className="text-lg font-bold">{summary.alert}</div>
          </a>
          <a
            href="/rivers"
            className={`border rounded-lg p-2 ${getStatusBgColor('falling')} hover:opacity-80 transition-opacity cursor-pointer text-left block`}
          >
            <div className="text-[10px] opacity-75">Falling</div>
            <div className="text-lg font-bold">{summary.falling}</div>
          </a>
          <a
            href="/rivers"
            className={`border rounded-lg p-2 ${getStatusBgColor('normal')} hover:opacity-80 transition-opacity cursor-pointer text-left block`}
          >
            <div className="text-[10px] opacity-75">Normal</div>
            <div className="text-lg font-bold">{summary.normal}</div>
          </a>
        </div>

        {/* View All Button */}
        <a
          href="/rivers"
          className="block w-full text-center text-[10px] text-blue-700 hover:text-blue-900 font-bold py-1.5 hover:bg-blue-50 rounded-lg transition-colors border border-slate-200"
        >
          View all {data.count} stations →
        </a>
      </div>
    </div>
  );
}
