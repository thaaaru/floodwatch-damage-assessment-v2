// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapControls } from './MapControls';
import { LayerPanel } from './LayerPanel';

// Fix Leaflet default marker icon issue with Next.js
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });
}

interface DamageMapProps {
  initialCenter?: [number, number];
  initialZoom?: number;
}

export default function DamageMap({
  initialCenter = [6.9271, 79.8612], // Colombo, Sri Lanka
  initialZoom = 12,
}: DamageMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const beforeLayerRef = useRef<L.TileLayer | null>(null);
  const afterLayerRef = useRef<L.TileLayer | null>(null);
  const sideBySideRef = useRef<any>(null);
  const [mounted, setMounted] = useState(false);

  const [comparisonMode, setComparisonMode] = useState<'split' | 'before' | 'after'>('split');
  const [beforeOpacity, setBeforeOpacity] = useState(1);
  const [afterOpacity, setAfterOpacity] = useState(1);
  const [showDamageLayer, setShowDamageLayer] = useState(false);
  const [showFloodLayer, setShowFloodLayer] = useState(false);
  const [damageOpacity, setDamageOpacity] = useState(0.7);
  const [floodOpacity, setFloodOpacity] = useState(0.7);

  // Set mounted flag
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !mapContainerRef.current || mapRef.current) return;

    // Initialize the map
    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      minZoom: 10,
      maxZoom: 18,
      zoomControl: false, // We'll add custom controls
    });

    mapRef.current = map;

    // Add zoom control in bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Before imagery layer (Sentinel-2 Cloudless 2020 via EOX/s2maps.eu)
    const beforeLayer = L.tileLayer(
      'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg',
      {
        attribution: '&copy; <a href="https://s2maps.eu">Sentinel-2 cloudless</a> by <a href="https://eox.at">EOX</a> | &copy; ESA',
        maxZoom: 16,
        subdomains: ['a', 'b', 'c', 'd'],
      }
    );
    beforeLayerRef.current = beforeLayer;

    // After imagery layer (Sentinel-2 Cloudless 2021 via EOX - for comparison)
    const afterLayer = L.tileLayer(
      'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg',
      {
        attribution: '&copy; <a href="https://s2maps.eu">Sentinel-2 cloudless</a> by <a href="https://eox.at">EOX</a> | &copy; ESA',
        maxZoom: 16,
        subdomains: ['a', 'b', 'c', 'd'],
      }
    );
    afterLayerRef.current = afterLayer;

    // Add both layers initially
    beforeLayer.addTo(map);

    // Try to load leaflet-side-by-side
    const loadSideBySide = async () => {
      try {
        // Use require for leaflet-side-by-side as it's a commonjs module
        const L_SideBySide = require('leaflet-side-by-side');
        afterLayer.addTo(map);
        const sideBySide = L_SideBySide(beforeLayer, afterLayer);
        sideBySideRef.current = sideBySide;
      } catch (error) {
        console.warn('Failed to load side-by-side, using simple layers:', error);
        // Fallback: just show before layer
        beforeLayer.addTo(map);
      }
    };

    loadSideBySide();

    // Add scale control
    L.control.scale({ position: 'bottomleft' }).addTo(map);

    // Cleanup
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mounted, initialCenter, initialZoom]);

  // Handle comparison mode changes
  useEffect(() => {
    if (!mapRef.current || !beforeLayerRef.current || !afterLayerRef.current) return;

    const map = mapRef.current;
    const beforeLayer = beforeLayerRef.current;
    const afterLayer = afterLayerRef.current;

    // Remove side-by-side if it exists
    if (sideBySideRef.current && sideBySideRef.current.remove) {
      try {
        sideBySideRef.current.remove();
        sideBySideRef.current = null;
      } catch (e) {
        console.warn('Error removing side-by-side:', e);
      }
    }

    // Remove all tile layers first
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    if (comparisonMode === 'split') {
      // Add both layers and re-initialize side-by-side
      beforeLayer.addTo(map);
      afterLayer.addTo(map);
      try {
        const L_SideBySide = require('leaflet-side-by-side');
        const sideBySide = L_SideBySide(beforeLayer, afterLayer);
        sideBySideRef.current = sideBySide;
      } catch (error) {
        console.warn('Side-by-side not available in split mode');
      }
    } else if (comparisonMode === 'before') {
      beforeLayer.addTo(map);
    } else if (comparisonMode === 'after') {
      afterLayer.addTo(map);
    }
  }, [comparisonMode]);

  // Handle opacity changes
  useEffect(() => {
    if (beforeLayerRef.current) {
      beforeLayerRef.current.setOpacity(beforeOpacity);
    }
  }, [beforeOpacity]);

  useEffect(() => {
    if (afterLayerRef.current) {
      afterLayerRef.current.setOpacity(afterOpacity);
    }
  }, [afterOpacity]);

  if (!mounted) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Initializing map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Map container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Map controls overlay */}
      <MapControls
        comparisonMode={comparisonMode}
        onComparisonModeChange={setComparisonMode}
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        onResetView={() => mapRef.current?.setView(initialCenter, initialZoom)}
      />

      {/* Layer control panel */}
      <LayerPanel
        beforeOpacity={beforeOpacity}
        afterOpacity={afterOpacity}
        onBeforeOpacityChange={setBeforeOpacity}
        onAfterOpacityChange={setAfterOpacity}
        showDamageLayer={showDamageLayer}
        showFloodLayer={showFloodLayer}
        onToggleDamageLayer={setShowDamageLayer}
        onToggleFloodLayer={setShowFloodLayer}
        damageOpacity={damageOpacity}
        floodOpacity={floodOpacity}
        onDamageOpacityChange={setDamageOpacity}
        onFloodOpacityChange={setFloodOpacity}
      />

      {/* Info banner */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-lg px-6 py-3 z-[1000] max-w-2xl">
        <h1 className="text-lg font-semibold text-slate-900">
          Satellite Damage Assessment - Sri Lanka
        </h1>
        <p className="text-sm text-slate-600">
          Real Sentinel-2 satellite imagery (10m resolution) - Compare 2020 vs 2021
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="bg-green-100 text-green-800 px-2 py-1 rounded">✓ Live Sentinel-2</span>
          <span className="text-slate-500">Cloudless composite by EOX/ESA</span>
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="absolute bottom-20 left-4 bg-slate-900/80 text-white rounded-lg px-4 py-2 text-xs z-[1000]">
        <div className="font-semibold mb-1">Keyboard Shortcuts:</div>
        <div className="space-y-0.5">
          <div><kbd className="bg-slate-700 px-1.5 py-0.5 rounded">A</kbd> Before</div>
          <div><kbd className="bg-slate-700 px-1.5 py-0.5 rounded">D</kbd> After</div>
          <div><kbd className="bg-slate-700 px-1.5 py-0.5 rounded">S</kbd> Split</div>
        </div>
      </div>
    </div>
  );
}
