// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect } from 'react';

interface MapControlsProps {
  comparisonMode: 'split' | 'before' | 'after';
  onComparisonModeChange: (mode: 'split' | 'before' | 'after') => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
}

export function MapControls({
  comparisonMode,
  onComparisonModeChange,
  onZoomIn,
  onZoomOut,
  onResetView,
}: MapControlsProps) {
  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'a') {
        onComparisonModeChange('before');
      } else if (key === 'd') {
        onComparisonModeChange('after');
      } else if (key === 's') {
        onComparisonModeChange('split');
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onComparisonModeChange]);

  return (
    <div className="absolute top-20 right-4 z-[1000] flex flex-col gap-2">
      {/* Comparison mode selector */}
      <div className="bg-white rounded-lg shadow-lg p-2">
        <div className="text-xs font-semibold text-slate-700 mb-2 px-1">View Mode</div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => onComparisonModeChange('split')}
            className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
              comparisonMode === 'split'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            Split (S)
          </button>
          <button
            onClick={() => onComparisonModeChange('before')}
            className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
              comparisonMode === 'before'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Before (A)
          </button>
          <button
            onClick={() => onComparisonModeChange('after')}
            className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
              comparisonMode === 'after'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            After (D)
          </button>
        </div>
      </div>

      {/* Additional controls */}
      <div className="bg-white rounded-lg shadow-lg p-2">
        <button
          onClick={onResetView}
          className="w-full px-3 py-2 rounded text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          title="Reset to initial view"
        >
          <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Reset View
        </button>
      </div>
    </div>
  );
}
