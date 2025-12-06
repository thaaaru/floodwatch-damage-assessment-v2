'use client';

import { useState, useEffect } from 'react';

type OverlayType =
  // Weather
  | 'rain' | 'wind' | 'temp' | 'clouds' | 'rh'
  // Precipitation & Radar
  | 'thunder' | 'radar' | 'satellite'
  // Clouds & Atmosphere
  | 'cBase' | 'lclouds' | 'mclouds' | 'hclouds' | 'cape'
  // Marine/Ocean
  | 'waves' | 'swell1' | 'swell2' | 'swell3' | 'wwaves' | 'currents';

interface OverlayConfig {
  id: OverlayType;
  label: string;
  icon: string;
  category: string;
  description: string;
}

const overlays: OverlayConfig[] = [
  // Weather Essentials
  { id: 'rain', label: 'Rain & Thunder', icon: '🌧️', category: 'Weather', description: 'Precipitation forecast' },
  { id: 'wind', label: 'Wind Speed', icon: '💨', category: 'Weather', description: 'Wind speed & direction' },
  { id: 'temp', label: 'Temperature', icon: '🌡️', category: 'Weather', description: 'Air temperature' },
  { id: 'clouds', label: 'Cloud Cover', icon: '☁️', category: 'Weather', description: 'Total cloud coverage' },
  { id: 'rh', label: 'Humidity', icon: '💧', category: 'Weather', description: 'Relative humidity' },

  // Storms & Severe Weather
  { id: 'thunder', label: 'Lightning', icon: '⚡', category: 'Storms', description: 'Thunderstorm probability' },
  { id: 'radar', label: 'Radar', icon: '📡', category: 'Storms', description: 'Weather radar imagery' },
  { id: 'satellite', label: 'Satellite', icon: '🛰️', category: 'Storms', description: 'Satellite imagery' },
  { id: 'cape', label: 'CAPE', icon: '🌪️', category: 'Storms', description: 'Storm energy potential' },

  // Cloud Layers
  { id: 'cBase', label: 'Cloud Base', icon: '☁️', category: 'Clouds', description: 'Cloud base height' },
  { id: 'lclouds', label: 'Low Clouds', icon: '☁️', category: 'Clouds', description: 'Low-level clouds' },
  { id: 'mclouds', label: 'Mid Clouds', icon: '☁️', category: 'Clouds', description: 'Mid-level clouds' },
  { id: 'hclouds', label: 'High Clouds', icon: '☁️', category: 'Clouds', description: 'High-level clouds' },

  // Marine & Ocean
  { id: 'waves', label: 'Wave Height', icon: '🌊', category: 'Marine', description: 'Significant wave height' },
  { id: 'swell1', label: 'Primary Swell', icon: '🌊', category: 'Marine', description: 'Primary swell waves' },
  { id: 'swell2', label: 'Secondary Swell', icon: '🌊', category: 'Marine', description: 'Secondary swell waves' },
  { id: 'swell3', label: 'Tertiary Swell', icon: '🌊', category: 'Marine', description: 'Tertiary swell waves' },
  { id: 'wwaves', label: 'Wind Waves', icon: '🌊', category: 'Marine', description: 'Wind-generated waves' },
  { id: 'currents', label: 'Ocean Currents', icon: '🌊', category: 'Marine', description: 'Sea surface currents' },
];

export default function WindyPage() {
  const [activeOverlay, setActiveOverlay] = useState<OverlayType>('rain');
  const [showPanel, setShowPanel] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('Weather');

  // Get categories
  const categories = Array.from(new Set(overlays.map(o => o.category)));

  // Prevent body scrolling and mobile bounce
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  // Center of Sri Lanka for full island view
  const lat = 7.8731; // Central Sri Lanka latitude
  const lon = 80.7718; // Central Sri Lanka longitude
  const zoom = 7; // Zoom level to show entire island

  const embedUrl = `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&zoom=${zoom}&level=surface&overlay=${activeOverlay}&product=ecmwf&menu=&message=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1`;

  return (
    <div className="h-screen bg-slate-900 relative overflow-hidden" style={{ touchAction: 'none' }}>
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-slate-800/10 backdrop-blur-md border-b border-slate-700/50 px-3 py-1.5 flex-shrink-0" style={{ touchAction: 'auto' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-nowrap min-w-0">
            <a href="/" className="text-slate-400 hover:text-white transition-colors flex-shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </a>
            <h1 className="text-sm font-semibold text-white whitespace-nowrap flex-shrink-0">FloodWatch Sri Lanka</h1>
            <span className="text-slate-400 flex-shrink-0 hidden sm:inline">•</span>
            <span className="text-xs text-blue-400 flex items-center gap-1 flex-shrink-0 hidden sm:flex">
              {overlays.find(o => o.id === activeOverlay)?.icon}
              <span className="whitespace-nowrap">{overlays.find(o => o.id === activeOverlay)?.label}</span>
            </span>
          </div>

          {/* Layers Button - Mobile Only */}
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="lg:hidden px-2.5 py-1.5 text-xs font-bold rounded-lg bg-white/10 text-white hover:bg-white/20 border border-white/20 flex items-center gap-1.5 transition-all"
            style={{ touchAction: 'auto' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
            </svg>
            <span>Layers</span>
          </button>
        </div>
      </div>

      {/* Floating Action Button - Layers - Desktop Only */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="hidden lg:flex fixed bottom-6 right-6 z-[2000] w-16 h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl items-center justify-center transition-all active:scale-95 ring-4 ring-blue-300/40"
        title="Weather Layers"
        style={{ touchAction: 'auto', pointerEvents: 'auto' }}
      >
        {showPanel ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
          </svg>
        )}
      </button>

      {/* Floating Panel */}
      {showPanel && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-[1500] animate-in fade-in duration-200"
            onClick={() => setShowPanel(false)}
            style={{ touchAction: 'auto' }}
          />

          {/* Panel Content - Right side on desktop, bottom on mobile */}
          <div className="fixed lg:top-20 lg:right-6 lg:bottom-6 lg:w-96 inset-x-0 bottom-0 lg:inset-x-auto z-[1600] bg-slate-800/95 backdrop-blur-xl lg:rounded-2xl rounded-t-3xl shadow-2xl lg:max-h-none max-h-[85vh] flex flex-col border border-slate-700/50 animate-in lg:slide-in-from-right slide-in-from-bottom duration-300" style={{ touchAction: 'auto' }}>
            {/* Handle for mobile */}
            <div className="flex items-center justify-center pt-3 pb-2 lg:hidden">
              <div className="w-12 h-1.5 bg-slate-600 rounded-full" />
            </div>

            {/* Panel Header */}
            <div className="px-4 pb-3 border-b border-slate-700">
              <h2 className="text-lg font-bold text-white">Weather Layers</h2>
              <p className="text-xs text-slate-400 mt-1 font-medium">Select weather visualization layer</p>
            </div>

            {/* Category Tabs */}
            <div className="px-4 pt-3 border-b border-slate-700 flex-shrink-0">
              <div className="flex gap-2 flex-wrap pb-3">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-all ${
                      activeCategory === category
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Layer List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {overlays
                .filter(o => o.category === activeCategory)
                .map((overlay) => (
                  <button
                    key={overlay.id}
                    onClick={() => {
                      setActiveOverlay(overlay.id);
                      setShowPanel(false);
                    }}
                    className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl text-sm transition-all ${
                      activeOverlay === overlay.id
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-slate-300 hover:bg-slate-700/50 border border-slate-700'
                    }`}
                  >
                    <span className="text-2xl flex-shrink-0">{overlay.icon}</span>
                    <div className="flex-1 text-left">
                      <div className="font-bold">{overlay.label}</div>
                      <div className={`text-xs mt-1 ${
                        activeOverlay === overlay.id ? 'text-blue-100' : 'text-slate-400'
                      }`}>
                        {overlay.description}
                      </div>
                    </div>
                    {activeOverlay === overlay.id && (
                      <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
            </div>

            {/* Footer Info */}
            <div className="px-4 py-3 border-t border-slate-700 text-xs text-slate-400 flex items-center justify-between flex-shrink-0">
              <span>{overlays.filter(o => o.category === activeCategory).length} layers in {activeCategory}</span>
              <span className="text-slate-500">{overlays.length} total</span>
            </div>
          </div>
        </>
      )}

      {/* Windy Embed - Full Height */}
      <div className="w-full h-screen overflow-hidden" style={{ touchAction: 'auto' }}>
        <iframe
          key={activeOverlay}
          src={embedUrl}
          width="100%"
          height="100%"
          frameBorder="0"
          allowFullScreen
          title="Sri Lanka Weather Map - Full Island View"
          style={{ touchAction: 'auto' }}
        />
      </div>
    </div>
  );
}
