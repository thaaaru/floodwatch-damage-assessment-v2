'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { api, IrrigationResponse, IrrigationStation } from '@/lib/api';

const RiversMap = dynamic(() => import('@/components/RiversMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-slate-900 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin"></div>
        <span className="text-sm text-slate-400">Loading map...</span>
      </div>
    </div>
  )
});

const API_BASE = process.env.NODE_ENV === 'production'
  ? 'https://api.hackandbuild.dev'
  : 'http://localhost:8000';

const getStatusStyles = (status: string) => {
  switch (status) {
    case 'major_flood':
      return { bg: 'bg-red-500', text: 'text-red-400', light: 'bg-red-500/20', border: 'border-red-500/30' };
    case 'minor_flood':
      return { bg: 'bg-amber-500', text: 'text-amber-400', light: 'bg-amber-500/20', border: 'border-amber-500/30' };
    case 'alert':
      return { bg: 'bg-yellow-500', text: 'text-yellow-400', light: 'bg-yellow-500/20', border: 'border-yellow-500/30' };
    default:
      return { bg: 'bg-emerald-500', text: 'text-emerald-400', light: 'bg-emerald-500/20', border: 'border-emerald-500/30' };
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'major_flood': return 'MAJOR FLOOD';
    case 'minor_flood': return 'MINOR FLOOD';
    case 'alert': return 'ALERT';
    default: return 'NORMAL';
  }
};

export default function RiversPage() {
  const [riverData, setRiverData] = useState<IrrigationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [selectedStation, setSelectedStation] = useState<IrrigationStation | null>(null);
  const [mapView, setMapView] = useState<'interactive' | 'schematic'>('schematic');
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await api.getIrrigationData();
        setRiverData(data);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (error) {
        console.error('Failed to fetch river data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="h-[calc(100vh-64px)] bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">Loading river data...</p>
        </div>
      </div>
    );
  }

  if (!riverData) {
    return (
      <div className="h-[calc(100vh-64px)] bg-slate-900 flex items-center justify-center">
        <div className="card p-6 max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-red-400">Failed to load river data</p>
        </div>
      </div>
    );
  }

  const floodMapUrl = `${API_BASE}/api/flood-map/image?show_labels=true&dpi=150&use_live_data=true&t=${Math.floor(Date.now() / 300000)}`;

  return (
    <div className="h-[calc(100vh-64px)] relative bg-slate-900">
      {/* Map Area */}
      <div className="absolute inset-0">
        {mapView === 'interactive' ? (
          <RiversMap
            stations={riverData.stations}
            onStationSelect={setSelectedStation}
            selectedStation={selectedStation}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white overflow-auto">
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
                <div className="text-center">
                  <div className="w-12 h-12 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-slate-600">Generating flood map...</p>
                </div>
              </div>
            )}
            {imageError ? (
              <div className="text-center p-8">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-slate-600 mb-4">Failed to load flood map</p>
                <button
                  onClick={() => { setImageError(false); setImageLoading(true); }}
                  className="btn-primary btn-md"
                >
                  Retry
                </button>
              </div>
            ) : (
              <img
                src={floodMapUrl}
                alt="Sri Lanka Flood Map"
                className="max-w-full max-h-full object-contain"
                onLoad={() => setImageLoading(false)}
                onError={() => { setImageLoading(false); setImageError(true); }}
                style={{ display: imageLoading ? 'none' : 'block' }}
              />
            )}
          </div>
        )}
      </div>

      {/* Controls Panel */}
      <div className="absolute top-4 left-4 z-[1000]">
        <div className="bg-slate-800/95 backdrop-blur-sm rounded-2xl shadow-soft-lg p-4 border border-slate-700/50 w-72">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-brand-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-semibold text-sm">River Water Levels</h1>
              <p className="text-slate-400 text-xs">{riverData.count} stations</p>
            </div>
          </div>

          {/* View Toggle */}
          <div className="flex rounded-xl overflow-hidden border border-slate-600 mb-4">
            <button
              onClick={() => setMapView('schematic')}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-all ${
                mapView === 'schematic'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Schematic
            </button>
            <button
              onClick={() => setMapView('interactive')}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-all ${
                mapView === 'interactive'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Interactive
            </button>
          </div>

          {/* Status Summary */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-2.5 text-center">
              <div className="text-xl font-bold text-red-400">{riverData.summary.major_flood}</div>
              <div className="text-[10px] text-red-300/80 font-medium">Major</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 text-center">
              <div className="text-xl font-bold text-amber-400">{riverData.summary.minor_flood}</div>
              <div className="text-[10px] text-amber-300/80 font-medium">Minor</div>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-2.5 text-center">
              <div className="text-xl font-bold text-yellow-400">{riverData.summary.alert}</div>
              <div className="text-[10px] text-yellow-300/80 font-medium">Alert</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2.5 text-center">
              <div className="text-xl font-bold text-emerald-400">{riverData.summary.normal}</div>
              <div className="text-[10px] text-emerald-300/80 font-medium">Normal</div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between">
            <span className="text-xs text-slate-500">Updated {lastUpdated}</span>
            <span className="text-xs text-slate-500">Irrigation Dept.</span>
          </div>
        </div>
      </div>

      {/* Legend - Interactive view only */}
      {mapView === 'interactive' && (
        <div className="absolute bottom-4 left-4 z-[1000]">
          <div className="bg-slate-800/95 backdrop-blur-sm rounded-xl shadow-soft-lg p-3 border border-slate-700/50">
            <div className="text-xs text-slate-400 font-medium mb-2">Status Legend</div>
            <div className="space-y-1.5">
              {[
                { label: 'Major Flood (≥100%)', color: 'bg-red-500' },
                { label: 'Minor Flood', color: 'bg-amber-500' },
                { label: 'Alert Level', color: 'bg-yellow-500' },
                { label: 'Normal', color: 'bg-emerald-500' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
                  <span className="text-xs text-slate-300">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Station Detail Panel */}
      {mapView === 'interactive' && selectedStation && (
        <div className="absolute bottom-4 right-4 left-4 md:left-auto md:w-80 z-[1000] animate-slide-up">
          <div className="bg-slate-800/95 backdrop-blur-sm rounded-2xl shadow-soft-lg overflow-hidden border border-slate-700/50">
            {/* Header */}
            <div className={`p-4 ${getStatusStyles(selectedStation.status).bg} text-white`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{selectedStation.station}</h3>
                  <p className="text-sm opacity-90">{selectedStation.river}</p>
                </div>
                <button
                  onClick={() => setSelectedStation(null)}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="px-2.5 py-1 bg-white/20 rounded-full text-xs font-bold backdrop-blur-sm">
                  {getStatusLabel(selectedStation.status)}
                </span>
                <span className="text-sm opacity-90">
                  {selectedStation.pct_to_major_flood.toFixed(0)}% to major
                </span>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Water Level */}
              <div>
                <div className="text-xs text-slate-400 mb-1">Water Level</div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-bold ${getStatusStyles(selectedStation.status).text}`}>
                    {selectedStation.water_level_m.toFixed(2)}m
                  </span>
                  <span className="text-xs text-slate-500">
                    / {selectedStation.major_flood_level_m.toFixed(2)}m threshold
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all ${getStatusStyles(selectedStation.status).bg}`}
                  style={{ width: `${Math.min(selectedStation.pct_to_major_flood, 100)}%` }}
                ></div>
              </div>

              {/* Thresholds */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Alert', value: selectedStation.alert_level_m, color: 'text-yellow-400' },
                  { label: 'Minor', value: selectedStation.minor_flood_level_m, color: 'text-amber-400' },
                  { label: 'Major', value: selectedStation.major_flood_level_m, color: 'text-red-400' },
                ].map((item) => (
                  <div key={item.label} className="bg-slate-700/50 p-2 rounded-lg text-center">
                    <div className="text-xs text-slate-400">{item.label}</div>
                    <div className={`font-mono text-sm ${item.color}`}>{item.value.toFixed(2)}m</div>
                  </div>
                ))}
              </div>

              {/* Districts */}
              <div>
                <div className="text-xs text-slate-400 mb-2">Affected Districts</div>
                <div className="flex flex-wrap gap-1">
                  {selectedStation.districts.map((district, idx) => (
                    <span key={idx} className="px-2 py-1 bg-slate-700/50 rounded-lg text-xs text-slate-300">
                      {district}
                    </span>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="text-xs text-slate-500 pt-3 border-t border-slate-700">
                Last updated: {new Date(selectedStation.last_updated).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
