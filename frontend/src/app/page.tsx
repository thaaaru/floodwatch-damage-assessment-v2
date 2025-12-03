'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { api, Alert } from '@/lib/api';
import AlertList from '@/components/AlertList';
import { MapLayer } from '@/components/Map';

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-slate-100 rounded-2xl flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
        <span className="text-sm text-slate-500">Loading map...</span>
      </div>
    </div>
  )
});

const layerOptions: { id: MapLayer; label: string; icon: string; description: string; group: string }[] = [
  { id: 'danger', label: 'Flood Risk', icon: '⚠️', description: 'Danger level based on multiple factors', group: 'current' },
  { id: 'rainfall', label: 'Rainfall', icon: '🌧️', description: 'Accumulated rainfall', group: 'current' },
  { id: 'temperature', label: 'Temp', icon: '🌡️', description: 'Current temperature', group: 'current' },
  { id: 'humidity', label: 'Humidity', icon: '💧', description: 'Relative humidity', group: 'current' },
  { id: 'wind', label: 'Wind', icon: '💨', description: 'Wind speed', group: 'current' },
  { id: 'pressure', label: 'Pressure', icon: '📊', description: 'Atmospheric pressure', group: 'current' },
  { id: 'clouds', label: 'Clouds', icon: '☁️', description: 'Cloud cover', group: 'current' },
  { id: 'gtraffic', label: 'Traffic', icon: '🚗', description: 'Live traffic from Google', group: 'current' },
  { id: 'forecast1', label: '+1 Day', icon: '📅', description: 'Tomorrow forecast', group: 'forecast' },
  { id: 'forecast2', label: '+2 Days', icon: '📅', description: 'Day 2 forecast', group: 'forecast' },
  { id: 'forecast3', label: '+3 Days', icon: '📅', description: 'Day 3 forecast', group: 'forecast' },
  { id: 'forecast4', label: '+4 Days', icon: '📅', description: 'Day 4 forecast', group: 'forecast' },
  { id: 'forecast5', label: '+5 Days', icon: '📅', description: 'Day 5 forecast', group: 'forecast' },
];

const layerLegends: Record<MapLayer, { colors: { color: string; label: string }[] }> = {
  danger: {
    colors: [
      { color: '#10b981', label: 'Low' },
      { color: '#f59e0b', label: 'Medium' },
      { color: '#ef4444', label: 'High' },
    ]
  },
  rainfall: {
    colors: [
      { color: '#f8fafc', label: '0mm' },
      { color: '#bfdbfe', label: '5mm' },
      { color: '#60a5fa', label: '10mm' },
      { color: '#2563eb', label: '15mm' },
      { color: '#1e3a8a', label: '20mm+' },
    ]
  },
  temperature: {
    colors: [
      { color: '#6366f1', label: '<20°' },
      { color: '#22c55e', label: '24-28°' },
      { color: '#f97316', label: '32-35°' },
      { color: '#dc2626', label: '>35°' },
    ]
  },
  humidity: {
    colors: [
      { color: '#dbeafe', label: '<50%' },
      { color: '#60a5fa', label: '60-70%' },
      { color: '#2563eb', label: '80-90%' },
      { color: '#1e40af', label: '>90%' },
    ]
  },
  wind: {
    colors: [
      { color: '#86efac', label: '<10km/h' },
      { color: '#eab308', label: '20-30km/h' },
      { color: '#dc2626', label: '>40km/h' },
    ]
  },
  pressure: {
    colors: [
      { color: '#dc2626', label: '<1000hPa' },
      { color: '#22c55e', label: '1010-1015' },
      { color: '#1e40af', label: '>1020hPa' },
    ]
  },
  clouds: {
    colors: [
      { color: '#f9fafb', label: 'Clear' },
      { color: '#9ca3af', label: 'Partly' },
      { color: '#374151', label: 'Overcast' },
    ]
  },
  gtraffic: {
    colors: [
      { color: '#30ac3e', label: 'Normal' },
      { color: '#f5a623', label: 'Slow' },
      { color: '#e34133', label: 'Heavy' },
    ]
  },
  forecast1: { colors: [{ color: '#22c55e', label: 'Normal' }, { color: '#eab308', label: 'Watch' }, { color: '#dc2626', label: 'Warning' }] },
  forecast2: { colors: [{ color: '#22c55e', label: 'Normal' }, { color: '#eab308', label: 'Watch' }, { color: '#dc2626', label: 'Warning' }] },
  forecast3: { colors: [{ color: '#22c55e', label: 'Normal' }, { color: '#eab308', label: 'Watch' }, { color: '#dc2626', label: 'Warning' }] },
  forecast4: { colors: [{ color: '#22c55e', label: 'Normal' }, { color: '#eab308', label: 'Watch' }, { color: '#dc2626', label: 'Warning' }] },
  forecast5: { colors: [{ color: '#22c55e', label: 'Normal' }, { color: '#eab308', label: 'Watch' }, { color: '#dc2626', label: 'Warning' }] },
};

export type DangerFilter = 'all' | 'low' | 'medium' | 'high';

export default function Dashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [selectedHours, setSelectedHours] = useState<number>(24);
  const [selectedLayer, setSelectedLayer] = useState<MapLayer>('danger');
  const [loading, setLoading] = useState(true);
  const [dangerFilter, setDangerFilter] = useState<DangerFilter>('all');

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const data = await api.getActiveAlerts();
        setAlerts(data);
      } catch (err) {
        console.error('Failed to fetch alerts:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, []);

  const currentLegend = layerLegends[selectedLayer];
  const currentLayers = layerOptions.filter(l => l.group === 'current');
  const forecastLayers = layerOptions.filter(l => l.group === 'forecast');

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-slate-50">
      {/* Map Controls - Floating on top of map */}
      <div className="flex-1 relative">
        {/* Map */}
        <div className="absolute inset-0 p-4 pb-4 lg:pr-88">
          <div className="h-full card overflow-hidden">
            <Map
              onDistrictSelect={setSelectedDistrict}
              hours={selectedHours}
              layer={selectedLayer}
              dangerFilter={dangerFilter}
            />
          </div>
        </div>

        {/* Top Controls Overlay */}
        <div className="absolute top-6 left-6 right-6 lg:right-[calc(22rem+1.5rem)] z-[1000] flex flex-col gap-3">
          {/* Layer Selection */}
          <div className="map-control p-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Current Layers */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 hidden sm:inline">Current</span>
                <div className="flex flex-wrap gap-1">
                  {currentLayers.map((layer) => (
                    <button
                      key={layer.id}
                      onClick={() => setSelectedLayer(layer.id)}
                      title={layer.description}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                        selectedLayer === layer.id
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <span>{layer.icon}</span>
                      <span className="hidden sm:inline">{layer.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="h-6 w-px bg-slate-200 hidden sm:block" />

              {/* Time Period */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 hidden sm:inline">Period</span>
                <div className="flex rounded-lg overflow-hidden border border-slate-200">
                  {[24, 48, 72].map((hours) => (
                    <button
                      key={hours}
                      onClick={() => setSelectedHours(hours)}
                      className={`px-2.5 py-1.5 text-xs font-semibold transition-all ${
                        selectedHours === hours
                          ? 'bg-brand-600 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {hours}h
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="h-6 w-px bg-slate-200 hidden md:block" />

              {/* Forecast Layers */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 hidden md:inline">Forecast</span>
                <div className="flex flex-wrap gap-1">
                  {forecastLayers.map((layer) => (
                    <button
                      key={layer.id}
                      onClick={() => setSelectedLayer(layer.id)}
                      title={layer.description}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                        selectedLayer === layer.id
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {layer.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="map-control p-2.5 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-slate-600">
              {layerOptions.find(l => l.id === selectedLayer)?.label}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {selectedLayer === 'danger' && (
                <button
                  onClick={() => setDangerFilter('all')}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all ${
                    dangerFilter === 'all' ? 'bg-slate-200 ring-1 ring-slate-400' : 'hover:bg-slate-100'
                  }`}
                >
                  <span className="w-3 h-3 rounded-sm bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500" />
                  <span className="text-slate-600">All</span>
                </button>
              )}
              {currentLegend.colors.map((item, idx) => {
                const filterValue = selectedLayer === 'danger'
                  ? (idx === 0 ? 'low' : idx === 1 ? 'medium' : 'high')
                  : null;
                return (
                  <button
                    key={idx}
                    onClick={() => filterValue && setDangerFilter(dangerFilter === filterValue ? 'all' : filterValue as DangerFilter)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all ${
                      selectedLayer === 'danger' && dangerFilter === filterValue
                        ? 'bg-slate-200 ring-1 ring-brand-500'
                        : selectedLayer === 'danger' ? 'hover:bg-slate-100 cursor-pointer' : ''
                    }`}
                    disabled={selectedLayer !== 'danger'}
                  >
                    <span
                      className="w-3 h-3 rounded-sm border border-slate-200"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-slate-600">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Alerts Sidebar - Desktop */}
        <div className="hidden lg:block absolute top-4 right-4 bottom-4 w-80">
          <div className="h-full card overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200/60">
              <h2 className="section-title">Active Alerts</h2>
              <p className="section-subtitle mt-0.5">
                {selectedDistrict ? `Showing ${selectedDistrict}` : 'All districts'}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <AlertList
                alerts={selectedDistrict ? alerts.filter(a => a.district === selectedDistrict) : alerts}
                compact
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
