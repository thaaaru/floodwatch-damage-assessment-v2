// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MetStation } from '@/lib/api';

interface MetStationsMapProps {
  stations: MetStation[];
  selectedWmoId: number | null;
  onStationSelect: (s: MetStation | null) => void;
}

/**
 * Map of Sri Lanka Department of Meteorology measured rainfall stations.
 *
 * Intentionally minimal: bright basemap, one rain-drop marker per WMO
 * station, label always showing measured mm. No modeled / forecast data.
 */

// Color scale based on TODAY's accumulated rainfall (since 08:30 local).
// Thresholds match Met Dept's daily-bulletin alert tiers.
function colorFor(mm: number): string {
  if (mm >= 150) return '#7c2d12'; // brown-900 - extreme
  if (mm >= 100) return '#dc2626'; // red-600 - very heavy
  if (mm >= 50)  return '#f97316'; // orange-500 - heavy
  if (mm >= 25)  return '#eab308'; // yellow-500 - moderate
  if (mm >= 5)   return '#3b82f6'; // blue-500 - light
  if (mm > 0)    return '#93c5fd'; // blue-300 - very light / trace
  return '#cbd5e1';                // slate-300 - dry
}

function makeIcon(station: MetStation): L.DivIcon {
  const mm = station.rainfall_since_830am_mm ?? 0;
  const color = colorFor(mm);
  const labelText = mm > 0 ? `${mm.toFixed(1)}mm` : '0';
  const labelBg = mm > 0 ? color : '#e2e8f0';
  const labelColor = mm >= 25 ? '#ffffff' : '#0f172a';
  // SVG raindrop. Inline so we don't need an asset pipeline.
  return L.divIcon({
    className: 'met-station-marker',
    html: `
      <div style="display:flex; flex-direction:column; align-items:center; pointer-events:auto; cursor:pointer;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
             style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
          <path d="M12 2C12 2 6 8 6 13C6 17.4183 9.58172 21 14 21C18.4183 21 22 17.4183 22 13C22 8 16 2 16 2L12 2Z"
                fill="${color}" stroke="#0f172a" stroke-width="1.5"/>
          <path d="M12 2C12 2 6 8 6 13C6 17.4183 9.58172 21 14 21C18.4183 21 22 17.4183 22 13C22 8 16 2 16 2L12 2Z"
                fill="url(#shine-${station.wmo_id})" opacity="0.6"/>
          <defs>
            <linearGradient id="shine-${station.wmo_id}" x1="0%" y1="0%" x2="40%" y2="0%">
              <stop offset="0%" style="stop-color:rgba(255,255,255,0.6)" />
              <stop offset="100%" style="stop-color:rgba(255,255,255,0)" />
            </linearGradient>
          </defs>
        </svg>
        <div style="
          margin-top: 3px;
          padding: 2px 6px;
          border-radius: 4px;
          background: ${labelBg};
          color: ${labelColor};
          font-family: -apple-system, system-ui, sans-serif;
          font-size: 11px;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
          box-shadow: 0 1px 2px rgba(0,0,0,0.25);
        ">${labelText}</div>
      </div>
    `,
    iconSize: [60, 48],
    iconAnchor: [30, 24],
  });
}

function buildPopupHtml(s: MetStation): string {
  const mm = s.rainfall_since_830am_mm ?? 0;
  const c = colorFor(mm);
  const tempStr = s.temperature_c !== null ? `${s.temperature_c.toFixed(1)}&deg;C` : '—';
  const rhStr = s.relative_humidity_pct !== null ? `${s.relative_humidity_pct}%` : '—';
  const reportLocal = new Date(s.report_time_utc).toLocaleString('en-LK', {
    timeZone: 'Asia/Colombo',
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif; min-width:200px; color:#1f2937;">
      <div style="font-weight:700; font-size:14px; margin-bottom:2px;">${s.name}</div>
      <div style="color:#6b7280; font-size:11px; margin-bottom:6px;">
        ${s.district} &middot; WMO ${s.wmo_id}
      </div>
      <div style="display:inline-block; background:${c}; color:white; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; margin-bottom:8px;">
        ${s.weather_type ? s.weather_type.toUpperCase() : 'NO REPORT'}
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:11px;">
        <div>
          <div style="color:#6b7280;">Today's rain<br>(since 08:30)</div>
          <div style="font-weight:700; color:${c}; font-size:14px;">${mm.toFixed(1)} mm</div>
        </div>
        <div>
          <div style="color:#6b7280;">Last 3h</div>
          <div style="font-weight:600;">${(s.rainfall_3h_mm ?? 0).toFixed(1)} mm</div>
        </div>
        <div>
          <div style="color:#6b7280;">Temperature</div>
          <div style="font-weight:600;">${tempStr}</div>
        </div>
        <div>
          <div style="color:#6b7280;">Humidity</div>
          <div style="font-weight:600;">${rhStr}</div>
        </div>
      </div>
      <div style="margin-top:8px; padding-top:6px; border-top:1px solid #e5e7eb; font-size:10px; color:#6b7280;">
        Report: ${reportLocal} &middot;
        Source: <a href="https://meteo.gov.lk" target="_blank" style="color:#2563eb;">Sri Lanka DoM</a>
      </div>
    </div>
  `;
}

export default function MetStationsMap({
  stations,
  selectedWmoId,
  onStationSelect,
}: MetStationsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  // --- one-time map init -------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [7.8731, 80.7718],
      zoom: 8,
      zoomControl: false,
      attributionControl: false,
    });
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);
    L.control
      .attribution({ position: 'bottomright' })
      .addAttribution(
        '&copy; <a href="https://carto.com/">CARTO</a> &middot; ' +
          'Rainfall: <a href="https://meteo.gov.lk">Sri Lanka DoM</a>',
      )
      .addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // --- markers ----------------------------------------------------------
  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    stations.forEach((s) => {
      const marker = L.marker([s.latitude, s.longitude], { icon: makeIcon(s) });
      marker.bindPopup(buildPopupHtml(s), { className: 'met-station-popup', closeButton: true });
      marker.on('click', () => onStationSelect(s));
      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });
  }, [stations, onStationSelect]);

  // --- pan to selected station ------------------------------------------
  useEffect(() => {
    if (!mapRef.current || selectedWmoId === null) return;
    const s = stations.find((x) => x.wmo_id === selectedWmoId);
    if (s) {
      mapRef.current.setView([s.latitude, s.longitude], 10, { animate: true, duration: 0.5 });
    }
  }, [selectedWmoId, stations]);

  return (
    <>
      <style jsx global>{`
        .met-station-popup .leaflet-popup-content-wrapper {
          background: #ffffff;
          color: #1f2937;
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(15, 23, 42, 0.25);
        }
        .met-station-popup .leaflet-popup-tip {
          background: #ffffff;
        }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
    </>
  );
}
