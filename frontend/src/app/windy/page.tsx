'use client';

import { useState } from 'react';

type OverlayType = 'rain' | 'wind' | 'temp' | 'clouds' | 'gust';

const overlays: { id: OverlayType; label: string; icon: string }[] = [
  { id: 'rain', label: 'Rain', icon: '🌧️' },
  { id: 'wind', label: 'Wind', icon: '💨' },
  { id: 'temp', label: 'Temperature', icon: '🌡️' },
  { id: 'clouds', label: 'Clouds', icon: '☁️' },
  { id: 'gust', label: 'Gusts', icon: '🌬️' },
];

export default function WindyPage() {
  const [activeOverlay, setActiveOverlay] = useState<OverlayType>('rain');
  const [showPanel, setShowPanel] = useState(true);

  const embedUrl = `https://embed.windy.com/embed2.html?lat=7.8731&lon=80.7718&detailLat=6.889&detailLon=79.956&zoom=7&level=surface&overlay=${activeOverlay}&product=ecmwf&menu=&message=true&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1`;

  return (
    <div className="min-h-screen bg-slate-900 relative">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-slate-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </a>
            <h1 className="text-xl font-semibold text-white">Windy Weather Map</h1>
          </div>
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2"
          >
            <span>Layers</span>
            <svg className={`w-4 h-4 transition-transform ${showPanel ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Floating Layer Panel */}
      {showPanel && (
        <div className="absolute top-16 right-4 z-10 bg-slate-800/95 backdrop-blur-sm rounded-lg border border-slate-700 shadow-xl p-2">
          <div className="text-xs text-slate-400 px-2 pb-2 border-b border-slate-700 mb-2">Select Layer</div>
          <div className="flex flex-col gap-1">
            {overlays.map((overlay) => (
              <button
                key={overlay.id}
                onClick={() => setActiveOverlay(overlay.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all ${
                  activeOverlay === overlay.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                <span>{overlay.icon}</span>
                <span>{overlay.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Windy Embed - Full Height */}
      <div className="w-full" style={{ height: 'calc(100vh - 56px)' }}>
        <iframe
          key={activeOverlay}
          src={embedUrl}
          width="100%"
          height="100%"
          frameBorder="0"
          allowFullScreen
          title="Windy Weather Map - Sri Lanka"
        />
      </div>
    </div>
  );
}
