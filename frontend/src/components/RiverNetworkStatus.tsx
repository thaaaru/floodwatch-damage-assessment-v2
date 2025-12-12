// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const fetchRiverData = async () => {
      try {
        const riverData = await api.getIrrigationData();
        setData(riverData);
      } catch (err) {
        // Failed to fetch river data
      } finally {
        setLoading(false);
      }
    };
    fetchRiverData();
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
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col" style={{ height: '320px' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-blue-50">
        <div className="flex items-center gap-2">
          <span className="text-lg">🌊</span>
          <h2 className="text-sm font-bold text-slate-900">River Network Status</h2>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/flood-info"
            className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full hover:bg-blue-200 transition-colors cursor-pointer"
          >
            {summary.total_stations} stations
          </a>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Critical Alert Banner */}
        {criticalCount > 0 && (
          <a
            href="/flood-info"
            className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-center gap-3 w-full text-left hover:bg-rose-100 transition-colors cursor-pointer"
          >
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="text-sm font-bold text-rose-900">
                {criticalCount} {criticalCount === 1 ? 'River' : 'Rivers'} in Flood
              </div>
              <div className="text-xs text-rose-700">Immediate attention required</div>
            </div>
          </a>
        )}

        {/* Status Grid */}
        <div className="grid grid-cols-2 gap-2">
          <a
            href="/flood-info"
            className={`border rounded-lg p-2.5 ${getStatusBgColor('major_flood')} hover:opacity-80 transition-opacity cursor-pointer text-left block`}
          >
            <div className="text-xs opacity-75">Major Flood</div>
            <div className="text-xl font-bold">{summary.major_flood}</div>
          </a>
          <a
            href="/flood-info"
            className={`border rounded-lg p-2.5 ${getStatusBgColor('minor_flood')} hover:opacity-80 transition-opacity cursor-pointer text-left block`}
          >
            <div className="text-xs opacity-75">Minor Flood</div>
            <div className="text-xl font-bold">{summary.minor_flood}</div>
          </a>
          <a
            href="/flood-info"
            className={`border rounded-lg p-2.5 ${getStatusBgColor('alert')} hover:opacity-80 transition-opacity cursor-pointer text-left block`}
          >
            <div className="text-xs opacity-75">Alert</div>
            <div className="text-xl font-bold">{summary.alert}</div>
          </a>
          <a
            href="/flood-info"
            className={`border rounded-lg p-2.5 ${getStatusBgColor('normal')} hover:opacity-80 transition-opacity cursor-pointer text-left block`}
          >
            <div className="text-xs opacity-75">Normal</div>
            <div className="text-xl font-bold">{summary.normal}</div>
          </a>
        </div>

        {/* View All Button */}
        <a
          href="/flood-info"
          className="block w-full text-center text-xs text-blue-700 hover:text-blue-900 font-bold py-2 hover:bg-blue-50 rounded-lg transition-colors border border-slate-200"
        >
          View all stations →
        </a>
      </div>
    </div>
  );
}
