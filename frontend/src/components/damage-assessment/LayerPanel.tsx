// SPDX-License-Identifier: Apache-2.0

'use client';

import { useState } from 'react';

interface LayerPanelProps {
  beforeOpacity: number;
  afterOpacity: number;
  onBeforeOpacityChange: (opacity: number) => void;
  onAfterOpacityChange: (opacity: number) => void;
  showDamageLayer: boolean;
  showFloodLayer: boolean;
  onToggleDamageLayer: (show: boolean) => void;
  onToggleFloodLayer: (show: boolean) => void;
  damageOpacity: number;
  floodOpacity: number;
  onDamageOpacityChange: (opacity: number) => void;
  onFloodOpacityChange: (opacity: number) => void;
}

export function LayerPanel({
  beforeOpacity,
  afterOpacity,
  onBeforeOpacityChange,
  onAfterOpacityChange,
  showDamageLayer,
  showFloodLayer,
  onToggleDamageLayer,
  onToggleFloodLayer,
  damageOpacity,
  floodOpacity,
  onDamageOpacityChange,
  onFloodOpacityChange,
}: LayerPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="absolute top-4 left-4 z-[1000] w-72">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-3 bg-slate-800 text-white flex items-center justify-between hover:bg-slate-700 transition-colors"
        >
          <span className="font-semibold flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            Layers & Controls
          </span>
          <svg
            className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Content */}
        {isExpanded && (
          <div className="p-4 space-y-4">
            {/* Base imagery opacity */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Base Imagery</h3>

              <div className="space-y-3">
                {/* Before imagery opacity */}
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">
                    Before Image Opacity
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={beforeOpacity}
                    onChange={(e) => onBeforeOpacityChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-0.5">
                    <span>0%</span>
                    <span>{Math.round(beforeOpacity * 100)}%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* After imagery opacity */}
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">
                    After Image Opacity
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={afterOpacity}
                    onChange={(e) => onAfterOpacityChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-0.5">
                    <span>0%</span>
                    <span>{Math.round(afterOpacity * 100)}%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Overlay Layers</h3>
              <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-3">
                <p className="text-xs text-blue-800">
                  <strong>Phase 2:</strong> Damage and flood overlays require satellite imagery processing and AI models (not yet implemented).
                </p>
              </div>

              {/* Damage layer */}
              <div className="mb-3">
                <label className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-700 flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-red-500"></div>
                    Building Damage
                  </span>
                  <input
                    type="checkbox"
                    checked={showDamageLayer}
                    onChange={(e) => onToggleDamageLayer(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                {showDamageLayer && (
                  <div className="ml-5">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={damageOpacity}
                      onChange={(e) => onDamageOpacityChange(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="text-xs text-slate-500 text-right mt-0.5">
                      {Math.round(damageOpacity * 100)}%
                    </div>
                  </div>
                )}
              </div>

              {/* Flood layer */}
              <div>
                <label className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-700 flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-blue-500"></div>
                    Flood Extent
                  </span>
                  <input
                    type="checkbox"
                    checked={showFloodLayer}
                    onChange={(e) => onToggleFloodLayer(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                {showFloodLayer && (
                  <div className="ml-5">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={floodOpacity}
                      onChange={(e) => onFloodOpacityChange(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="text-xs text-slate-500 text-right mt-0.5">
                      {Math.round(floodOpacity * 100)}%
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Legend */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Damage Legend</h3>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#10b981' }}></div>
                  <span className="text-slate-600">No Damage</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#fbbf24' }}></div>
                  <span className="text-slate-600">Minor Damage</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#f97316' }}></div>
                  <span className="text-slate-600">Major Damage</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ef4444' }}></div>
                  <span className="text-slate-600">Destroyed</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
