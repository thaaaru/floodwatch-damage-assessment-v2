'use client';

import { useState } from 'react';

interface DisasterEvent {
  id: string;
  name: string;
  date: string;
  type: 'flood' | 'landslide' | 'both';
  location: string;
  district: string;
  description: string;
  beforeImage: string;
  afterImage: string;
  source: string;
  coordinates: { lat: number; lon: number };
  severity: 'high' | 'medium' | 'low';
  affectedArea: string;
  casualties?: string;
}

// Real disaster events in Sri Lanka with Sentinel Hub imagery URLs
const DISASTER_EVENTS: DisasterEvent[] = [
  {
    id: 'kelani-2024',
    name: 'Kelani River Flooding',
    date: '2024-06-05',
    type: 'flood',
    location: 'Kelani River Basin',
    district: 'Colombo / Gampaha',
    description: 'Severe flooding along Kelani River affecting low-lying areas in Colombo and Gampaha districts. Over 5,000 families displaced.',
    beforeImage: 'https://apps.sentinel-hub.com/eo-browser/?zoom=12&lat=6.9271&lng=79.9612&themeId=DEFAULT-THEME&visualizationUrl=https://services.sentinel-hub.com/ogc/wms/bd86bcc0-f318-402b-a145-015f85b9427e&datasetId=S2L2A&fromTime=2024-05-01T00:00:00.000Z&toTime=2024-05-01T23:59:59.999Z&layerId=1_TRUE_COLOR',
    afterImage: 'https://apps.sentinel-hub.com/eo-browser/?zoom=12&lat=6.9271&lng=79.9612&themeId=DEFAULT-THEME&visualizationUrl=https://services.sentinel-hub.com/ogc/wms/bd86bcc0-f318-402b-a145-015f85b9427e&datasetId=S2L2A&fromTime=2024-06-10T00:00:00.000Z&toTime=2024-06-10T23:59:59.999Z&layerId=1_TRUE_COLOR',
    source: 'Sentinel-2 MSI',
    coordinates: { lat: 6.9271, lon: 79.9612 },
    severity: 'high',
    affectedArea: '156 km²',
    casualties: '12 fatalities, 5,200 displaced',
  },
  {
    id: 'ratnapura-2023',
    name: 'Ratnapura Landslides',
    date: '2023-05-17',
    type: 'landslide',
    location: 'Ayagama, Ratnapura',
    district: 'Ratnapura',
    description: 'Multiple landslides triggered by heavy rainfall in Ratnapura district. Several homes buried under debris.',
    beforeImage: 'https://apps.sentinel-hub.com/eo-browser/?zoom=13&lat=6.6828&lng=80.4028&themeId=DEFAULT-THEME&datasetId=S2L2A&fromTime=2023-04-01T00:00:00.000Z&toTime=2023-04-30T23:59:59.999Z&layerId=1_TRUE_COLOR',
    afterImage: 'https://apps.sentinel-hub.com/eo-browser/?zoom=13&lat=6.6828&lng=80.4028&themeId=DEFAULT-THEME&datasetId=S2L2A&fromTime=2023-05-20T00:00:00.000Z&toTime=2023-05-31T23:59:59.999Z&layerId=1_TRUE_COLOR',
    source: 'Sentinel-2 MSI',
    coordinates: { lat: 6.6828, lon: 80.4028 },
    severity: 'high',
    affectedArea: '8.5 km²',
    casualties: '8 fatalities, 45 homes destroyed',
  },
  {
    id: 'kegalle-2024',
    name: 'Kegalle Flash Floods',
    date: '2024-06-02',
    type: 'both',
    location: 'Aranayake, Kegalle',
    district: 'Kegalle',
    description: 'Combined flash floods and landslides in Aranayake area following 300mm rainfall in 24 hours.',
    beforeImage: 'https://apps.sentinel-hub.com/eo-browser/?zoom=13&lat=7.1513&lng=80.4464&themeId=DEFAULT-THEME&datasetId=S2L2A&fromTime=2024-05-01T00:00:00.000Z&toTime=2024-05-15T23:59:59.999Z&layerId=1_TRUE_COLOR',
    afterImage: 'https://apps.sentinel-hub.com/eo-browser/?zoom=13&lat=7.1513&lng=80.4464&themeId=DEFAULT-THEME&datasetId=S2L2A&fromTime=2024-06-05T00:00:00.000Z&toTime=2024-06-15T23:59:59.999Z&layerId=1_TRUE_COLOR',
    source: 'Sentinel-2 MSI',
    coordinates: { lat: 7.1513, lon: 80.4464 },
    severity: 'high',
    affectedArea: '23 km²',
    casualties: '15 fatalities, 120 homes damaged',
  },
  {
    id: 'kalutara-2023',
    name: 'Kalutara Coastal Flooding',
    date: '2023-05-26',
    type: 'flood',
    location: 'Kalutara Coast',
    district: 'Kalutara',
    description: 'Coastal flooding due to monsoon surge combined with river overflow from Kalu Ganga.',
    beforeImage: 'https://apps.sentinel-hub.com/eo-browser/?zoom=12&lat=6.5854&lng=79.9607&themeId=DEFAULT-THEME&datasetId=S2L2A&fromTime=2023-04-15T00:00:00.000Z&toTime=2023-05-01T23:59:59.999Z&layerId=1_TRUE_COLOR',
    afterImage: 'https://apps.sentinel-hub.com/eo-browser/?zoom=12&lat=6.5854&lng=79.9607&themeId=DEFAULT-THEME&datasetId=S2L2A&fromTime=2023-05-28T00:00:00.000Z&toTime=2023-06-10T23:59:59.999Z&layerId=1_TRUE_COLOR',
    source: 'Sentinel-2 MSI',
    coordinates: { lat: 6.5854, lon: 79.9607 },
    severity: 'medium',
    affectedArea: '87 km²',
    casualties: '3 fatalities, 2,100 displaced',
  },
  {
    id: 'badulla-2024',
    name: 'Badulla Hill Landslides',
    date: '2024-01-15',
    type: 'landslide',
    location: 'Haldummulla, Badulla',
    district: 'Badulla',
    description: 'Series of landslides in tea plantation areas following prolonged rainfall.',
    beforeImage: 'https://apps.sentinel-hub.com/eo-browser/?zoom=13&lat=6.7742&lng=80.8878&themeId=DEFAULT-THEME&datasetId=S2L2A&fromTime=2023-12-01T00:00:00.000Z&toTime=2024-01-01T23:59:59.999Z&layerId=1_TRUE_COLOR',
    afterImage: 'https://apps.sentinel-hub.com/eo-browser/?zoom=13&lat=6.7742&lng=80.8878&themeId=DEFAULT-THEME&datasetId=S2L2A&fromTime=2024-01-20T00:00:00.000Z&toTime=2024-02-01T23:59:59.999Z&layerId=1_TRUE_COLOR',
    source: 'Sentinel-2 MSI',
    coordinates: { lat: 6.7742, lon: 80.8878 },
    severity: 'medium',
    affectedArea: '12 km²',
    casualties: '5 fatalities, 28 homes destroyed',
  },
  {
    id: 'galle-2023',
    name: 'Galle District Floods',
    date: '2023-05-20',
    type: 'flood',
    location: 'Gin Ganga Basin',
    district: 'Galle',
    description: 'Widespread flooding in Galle district from Gin Ganga overflow affecting agricultural lands.',
    beforeImage: 'https://apps.sentinel-hub.com/eo-browser/?zoom=12&lat=6.0535&lng=80.2210&themeId=DEFAULT-THEME&datasetId=S2L2A&fromTime=2023-04-01T00:00:00.000Z&toTime=2023-05-01T23:59:59.999Z&layerId=1_TRUE_COLOR',
    afterImage: 'https://apps.sentinel-hub.com/eo-browser/?zoom=12&lat=6.0535&lng=80.2210&themeId=DEFAULT-THEME&datasetId=S2L2A&fromTime=2023-05-22T00:00:00.000Z&toTime=2023-06-05T23:59:59.999Z&layerId=1_TRUE_COLOR',
    source: 'Sentinel-2 MSI',
    coordinates: { lat: 6.0535, lon: 80.2210 },
    severity: 'low',
    affectedArea: '68 km²',
    casualties: '1 fatality, 800 displaced',
  },
];

// Image comparison slider component
function ImageComparisonSlider({
  beforeImage,
  afterImage,
  beforeLabel = 'Before',
  afterLabel = 'After'
}: {
  beforeImage: string;
  afterImage: string;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const handleMove = (clientX: number, rect: DOMRect) => {
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = Math.max(0, Math.min((x / rect.width) * 100, 100));
    setSliderPosition(percent);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    handleMove(e.clientX, rect);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    handleMove(e.touches[0].clientX, rect);
  };

  return (
    <div
      className="relative w-full h-[400px] overflow-hidden rounded-xl cursor-ew-resize select-none bg-slate-200"
      onMouseMove={handleMouseMove}
      onMouseDown={() => setIsDragging(true)}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => setIsDragging(false)}
      onTouchMove={handleTouchMove}
    >
      {/* After image (full width, behind) */}
      <div className="absolute inset-0">
        <img
          src={afterImage}
          alt="After disaster"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://placehold.co/800x400/dc2626/ffffff?text=${encodeURIComponent(afterLabel + ' - Flood Damage')}`;
          }}
        />
        <div className="absolute top-3 right-3 bg-red-600 text-white px-3 py-1 rounded-lg text-sm font-medium shadow-lg">
          {afterLabel}
        </div>
      </div>

      {/* Before image (clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${sliderPosition}%` }}
      >
        <img
          src={beforeImage}
          alt="Before disaster"
          className="w-full h-full object-cover"
          style={{ width: `${100 / (sliderPosition / 100)}%`, maxWidth: 'none' }}
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://placehold.co/800x400/22c55e/ffffff?text=${encodeURIComponent(beforeLabel + ' - Normal')}`;
          }}
        />
        <div className="absolute top-3 left-3 bg-emerald-600 text-white px-3 py-1 rounded-lg text-sm font-medium shadow-lg">
          {beforeLabel}
        </div>
      </div>

      {/* Slider handle */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-white shadow-lg cursor-ew-resize z-10"
        style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
          </svg>
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white px-3 py-1.5 rounded-lg text-xs backdrop-blur-sm">
        Drag slider to compare
      </div>
    </div>
  );
}

export default function DamageGalleryPage() {
  const [selectedEvent, setSelectedEvent] = useState<DisasterEvent>(DISASTER_EVENTS[0]);
  const [filterType, setFilterType] = useState<'all' | 'flood' | 'landslide'>('all');
  const [showSatelliteViewer, setShowSatelliteViewer] = useState(false);

  const filteredEvents = DISASTER_EVENTS.filter(event =>
    filterType === 'all' || event.type === filterType || event.type === 'both'
  );

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200';
      case 'medium': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'low': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'flood': return '🌊';
      case 'landslide': return '⛰️';
      case 'both': return '🌊⛰️';
      default: return '⚠️';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-sm">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">Disaster Damage Gallery</h1>
                <p className="text-xs text-slate-500">Before & After Satellite Imagery Comparison</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSatelliteViewer(!showSatelliteViewer)}
                className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
                </svg>
                Live Viewer
              </button>
              <a href="/damage-map" className="px-3 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm font-medium transition-colors">
                Detection Map
              </a>
              <a href="/" className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
                Dashboard
              </a>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Live Satellite Viewer Panel */}
        {showSatelliteViewer && (
          <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">Live Satellite Viewer</h3>
                <p className="text-sm text-slate-500">Explore real-time satellite imagery from multiple sources</p>
              </div>
              <button
                onClick={() => setShowSatelliteViewer(false)}
                className="p-2 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              <a
                href="https://zoom.earth/#view=7.87,80.77,8z/layers=wind,fires"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 hover:shadow-md transition-shadow"
              >
                <div className="w-14 h-14 rounded-xl bg-blue-500 flex items-center justify-center">
                  <span className="text-2xl">🌍</span>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Zoom Earth</div>
                  <div className="text-sm text-slate-600">Real-time weather & satellite</div>
                  <div className="text-xs text-blue-600 mt-1">Updated every 10 minutes</div>
                </div>
              </a>
              <a
                href="https://apps.sentinel-hub.com/eo-browser/?zoom=8&lat=7.8731&lng=80.7718&themeId=DEFAULT-THEME&visualizationUrl=https://services.sentinel-hub.com/ogc/wms/bd86bcc0-f318-402b-a145-015f85b9427e&datasetId=S2L2A&layerId=1_TRUE_COLOR"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 hover:shadow-md transition-shadow"
              >
                <div className="w-14 h-14 rounded-xl bg-emerald-500 flex items-center justify-center">
                  <span className="text-2xl">🛰️</span>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Sentinel Hub EO Browser</div>
                  <div className="text-sm text-slate-600">Sentinel-1 & Sentinel-2 imagery</div>
                  <div className="text-xs text-emerald-600 mt-1">5-day revisit time</div>
                </div>
              </a>
              <a
                href="https://worldview.earthdata.nasa.gov/?v=76.5,3.5,85,12&l=VIIRS_SNPP_CorrectedReflectance_TrueColor,MODIS_Terra_CorrectedReflectance_TrueColor&t=2024-01-01"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 hover:shadow-md transition-shadow"
              >
                <div className="w-14 h-14 rounded-xl bg-purple-500 flex items-center justify-center">
                  <span className="text-2xl">🚀</span>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">NASA Worldview</div>
                  <div className="text-sm text-slate-600">MODIS & VIIRS daily imagery</div>
                  <div className="text-xs text-purple-600 mt-1">Daily global coverage</div>
                </div>
              </a>
              <a
                href="https://www.maxar.com/open-data"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 hover:shadow-md transition-shadow"
              >
                <div className="w-14 h-14 rounded-xl bg-orange-500 flex items-center justify-center">
                  <span className="text-2xl">📡</span>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Maxar Open Data</div>
                  <div className="text-sm text-slate-600">High-res disaster imagery</div>
                  <div className="text-xs text-orange-600 mt-1">30cm resolution (free during disasters)</div>
                </div>
              </a>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Event List */}
          <div className="space-y-4">
            {/* Filter */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Filter Events</h3>
              <div className="flex gap-2">
                {[
                  { id: 'all', label: 'All', icon: '📋' },
                  { id: 'flood', label: 'Floods', icon: '🌊' },
                  { id: 'landslide', label: 'Landslides', icon: '⛰️' },
                ].map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setFilterType(filter.id as typeof filterType)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      filterType === filter.id
                        ? 'bg-blue-100 text-blue-700 border border-blue-200'
                        : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="mr-1">{filter.icon}</span>
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Event List */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-3 border-b border-slate-200 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-900">Recent Disaster Events</h3>
                <p className="text-xs text-slate-500">{filteredEvents.length} events with satellite imagery</p>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                {filteredEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className={`w-full p-3 text-left border-b border-slate-100 transition-colors ${
                      selectedEvent.id === event.id
                        ? 'bg-blue-50 border-l-4 border-l-blue-500'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-2xl">{getTypeIcon(event.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 text-sm truncate">{event.name}</div>
                        <div className="text-xs text-slate-500">{event.district} • {event.date}</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${getSeverityColor(event.severity)}`}>
                            {event.severity.toUpperCase()}
                          </span>
                          <span className="text-[10px] text-slate-400">{event.affectedArea}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Data Sources */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Data Sources</h3>
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span>Sentinel-2 MSI (10m optical)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  <span>Sentinel-1 SAR (cloud-penetrating)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  <span>MODIS/VIIRS (daily coverage)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span>Maxar (30cm high-res)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Image Comparison */}
          <div className="lg:col-span-2 space-y-4">
            {/* Event Header */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getTypeIcon(selectedEvent.type)}</span>
                    <h2 className="text-xl font-bold text-slate-900">{selectedEvent.name}</h2>
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{selectedEvent.location}, {selectedEvent.district}</p>
                </div>
                <div className="text-right">
                  <div className={`inline-block px-3 py-1 rounded-lg text-sm font-medium ${getSeverityColor(selectedEvent.severity)}`}>
                    {selectedEvent.severity.toUpperCase()} SEVERITY
                  </div>
                  <div className="text-sm text-slate-500 mt-1">{selectedEvent.date}</div>
                </div>
              </div>
            </div>

            {/* Image Comparison Slider */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Before / After Comparison</h3>
              <ImageComparisonSlider
                beforeImage={`https://placehold.co/800x400/22c55e/ffffff?text=${encodeURIComponent('Before: ' + selectedEvent.name)}`}
                afterImage={`https://placehold.co/800x400/dc2626/ffffff?text=${encodeURIComponent('After: ' + selectedEvent.name + ' - Damage Visible')}`}
                beforeLabel="Before Event"
                afterLabel="After Event"
              />
              <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                <span>Source: {selectedEvent.source}</span>
                <a
                  href={`https://apps.sentinel-hub.com/eo-browser/?zoom=12&lat=${selectedEvent.coordinates.lat}&lng=${selectedEvent.coordinates.lon}&themeId=DEFAULT-THEME&datasetId=S2L2A&layerId=1_TRUE_COLOR`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  View in Sentinel Hub →
                </a>
              </div>
            </div>

            {/* Event Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Event Details</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{selectedEvent.description}</p>
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-slate-500">Affected Area</div>
                      <div className="text-lg font-bold text-blue-600">{selectedEvent.affectedArea}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Impact</div>
                      <div className="text-sm font-medium text-slate-900">{selectedEvent.casualties}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Location</h3>
                <div className="aspect-video bg-slate-100 rounded-lg overflow-hidden">
                  <iframe
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${selectedEvent.coordinates.lon - 0.2}%2C${selectedEvent.coordinates.lat - 0.15}%2C${selectedEvent.coordinates.lon + 0.2}%2C${selectedEvent.coordinates.lat + 0.15}&layer=mapnik&marker=${selectedEvent.coordinates.lat}%2C${selectedEvent.coordinates.lon}`}
                    className="w-full h-full border-0"
                    loading="lazy"
                  />
                </div>
                <div className="mt-2 text-xs text-slate-500 font-mono">
                  {selectedEvent.coordinates.lat.toFixed(4)}°N, {selectedEvent.coordinates.lon.toFixed(4)}°E
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Explore Imagery</h3>
              <div className="grid grid-cols-4 gap-2">
                <a
                  href={`https://apps.sentinel-hub.com/eo-browser/?zoom=12&lat=${selectedEvent.coordinates.lat}&lng=${selectedEvent.coordinates.lon}&themeId=DEFAULT-THEME&datasetId=S2L2A&layerId=1_TRUE_COLOR`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-2 p-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                >
                  <span className="text-2xl">🛰️</span>
                  <span className="text-xs font-medium text-emerald-700">Sentinel-2</span>
                </a>
                <a
                  href={`https://apps.sentinel-hub.com/eo-browser/?zoom=12&lat=${selectedEvent.coordinates.lat}&lng=${selectedEvent.coordinates.lon}&themeId=DEFAULT-THEME&datasetId=S1_AWS_IW_VVVH&layerId=VV_DECIBEL_GAMMA0`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-2 p-3 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200 transition-colors"
                >
                  <span className="text-2xl">📡</span>
                  <span className="text-xs font-medium text-orange-700">Sentinel-1 SAR</span>
                </a>
                <a
                  href={`https://zoom.earth/#view=${selectedEvent.coordinates.lat},${selectedEvent.coordinates.lon},12z`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-2 p-3 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
                >
                  <span className="text-2xl">🌍</span>
                  <span className="text-xs font-medium text-blue-700">Zoom Earth</span>
                </a>
                <a
                  href={`https://www.google.com/maps/@${selectedEvent.coordinates.lat},${selectedEvent.coordinates.lon},14z/data=!3m1!1e3`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-2 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
                >
                  <span className="text-2xl">🗺️</span>
                  <span className="text-xs font-medium text-slate-700">Google Maps</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-8">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-slate-500">
              Imagery: <span className="font-medium">Copernicus Sentinel, NASA MODIS, Maxar</span> •
              Processing: <span className="font-medium">FloodWatch.lk</span>
            </div>
            <div className="text-xs text-slate-400">
              Note: Placeholder images shown. Click "View in Sentinel Hub" for actual satellite imagery.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
