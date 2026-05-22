// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { IrrigationStation } from '@/lib/api';
import { riverPaths } from '@/lib/rivers';

interface FloodsMapProps {
  stations: IrrigationStation[];
  selectedStation: IrrigationStation | null;
  onStationSelect: (s: IrrigationStation | null) => void;
}

/**
 * Clean flood map: rivers + 24 Irrigation Dept gauging stations.
 * Bright CARTO Voyager basemap. No HydroSHEDS basins, no AIG tiles,
 * no Google Floods placeholders.
 */

const statusColor = (status: string): string => {
  switch (status) {
    case 'major_flood': return '#dc2626'; // red-600
    case 'minor_flood': return '#f97316'; // orange-500
    case 'alert':       return '#eab308'; // yellow-500
    default:            return '#16a34a'; // green-600
  }
};

const statusLabel = (status: string): string => {
  switch (status) {
    case 'major_flood': return 'MAJOR FLOOD';
    case 'minor_flood': return 'MINOR FLOOD';
    case 'alert':       return 'ALERT';
    default:            return 'NORMAL';
  }
};

function buildPopupHtml(s: IrrigationStation): string {
  const color = statusColor(s.status);
  const pct = Math.min(Math.max(s.pct_to_major_flood ?? 0, 0), 100);
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif; min-width:220px; color:#1f2937;">
      <div style="font-weight:700; font-size:13px; margin-bottom:2px;">${s.station}</div>
      <div style="color:#6b7280; font-size:11px; margin-bottom:6px;">
        ${s.river}${s.districts?.length ? ` &middot; ${s.districts.join(', ')}` : ''}
      </div>
      <div style="display:inline-block; background:${color}; color:white; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; margin-bottom:8px;">
        ${statusLabel(s.status)}
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:11px;">
        <div>
          <div style="color:#6b7280;">Current</div>
          <div style="font-weight:700; color:${color}; font-size:13px;">${(s.water_level_m ?? 0).toFixed(2)} m</div>
        </div>
        <div>
          <div style="color:#6b7280;">Alert</div>
          <div style="font-weight:600;">${(s.alert_level_m ?? 0).toFixed(2)} m</div>
        </div>
        <div>
          <div style="color:#6b7280;">Minor flood</div>
          <div style="font-weight:600; color:#f97316;">${(s.minor_flood_level_m ?? 0).toFixed(2)} m</div>
        </div>
        <div>
          <div style="color:#6b7280;">Major flood</div>
          <div style="font-weight:600; color:#dc2626;">${(s.major_flood_level_m ?? 0).toFixed(2)} m</div>
        </div>
      </div>
      <div style="margin-top:8px; padding-top:6px; border-top:1px solid #e5e7eb;">
        <div style="background:#e5e7eb; border-radius:4px; height:6px; overflow:hidden;">
          <div style="background:${color}; height:100%; width:${pct}%;"></div>
        </div>
        <div style="text-align:center; font-size:10px; color:#6b7280; margin-top:3px;">
          ${pct.toFixed(0)}% of major flood threshold
        </div>
      </div>
    </div>
  `;
}

export default function FloodsMap({
  stations,
  selectedStation,
  onStationSelect,
}: FloodsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);

  // --- one-time map init ----------------------------------------------
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
          'Gauges: <a href="https://github.com/nuuuwan/lk_irrigation">Sri Lanka Irrigation Dept</a>',
      )
      .addTo(map);

    // Draw the river paths once; they're reference geometry, not live data.
    riverPaths.forEach((river) => {
      // White halo + colored core for legibility on the bright basemap.
      L.polyline(river.coordinates as L.LatLngTuple[], {
        color: '#ffffff',
        weight: 6,
        opacity: 0.65,
        lineCap: 'round',
      }).addTo(map);
      L.polyline(river.coordinates as L.LatLngTuple[], {
        color: river.color,
        weight: 3,
        opacity: 0.95,
        lineCap: 'round',
      })
        .bindTooltip(river.name, { sticky: true, direction: 'top' })
        .addTo(map);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // --- station markers ------------------------------------------------
  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    stations.forEach((s) => {
      const color = statusColor(s.status);
      const isSelected = selectedStation?.station === s.station;
      const isFlood = s.status === 'major_flood' || s.status === 'minor_flood';

      const marker = L.circleMarker([s.lat, s.lon], {
        radius: isSelected ? 13 : isFlood ? 10 : 8,
        fillColor: color,
        color: '#ffffff',
        weight: isSelected ? 3 : 2,
        opacity: 1,
        fillOpacity: 0.95,
      });
      marker.bindPopup(buildPopupHtml(s), { className: 'floods-map-popup', closeButton: true });
      marker.on('click', () => onStationSelect(s));
      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });
  }, [stations, selectedStation, onStationSelect]);

  // --- pan to selected -----------------------------------------------
  useEffect(() => {
    if (!mapRef.current || !selectedStation) return;
    mapRef.current.setView([selectedStation.lat, selectedStation.lon], 10, {
      animate: true,
      duration: 0.5,
    });
  }, [selectedStation]);

  return (
    <>
      <style jsx global>{`
        .floods-map-popup .leaflet-popup-content-wrapper {
          background: #ffffff;
          color: #1f2937;
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(15, 23, 42, 0.25);
        }
        .floods-map-popup .leaflet-popup-tip {
          background: #ffffff;
        }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
    </>
  );
}
