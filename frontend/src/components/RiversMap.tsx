// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { IrrigationStation } from '@/lib/api';

interface RiversMapProps {
  stations: IrrigationStation[];
  onStationSelect: (station: IrrigationStation | null) => void;
  selectedStation: IrrigationStation | null;
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'major_flood': return '#ef4444'; // red-500
    case 'minor_flood': return '#f97316'; // orange-500
    case 'alert': return '#eab308'; // yellow-500
    default: return '#22c55e'; // green-500
  }
};

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'major_flood': return 'MAJOR FLOOD';
    case 'minor_flood': return 'MINOR FLOOD';
    case 'alert': return 'ALERT';
    default: return 'NORMAL';
  }
};

export default function RiversMap({ stations, onStationSelect, selectedStation }: RiversMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Initialize map centered on Sri Lanka
    const map = L.map(containerRef.current, {
      center: [7.8731, 80.7718],
      zoom: 8,
      zoomControl: false,
      attributionControl: false,
    });

    // Add zoom control to top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Bright basemap. CARTO Voyager keeps water/road colors saturated so
    // the river network is easy to read at country zoom. Free, no API key.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Add attribution
    L.control.attribution({ position: 'bottomright' })
      .addAttribution('&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org/copyright">OSM</a>')
      .addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when stations change
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Group stations by river to draw connecting lines
    const riverGroups: Record<string, IrrigationStation[]> = {};
    stations.forEach(station => {
      if (!riverGroups[station.river]) {
        riverGroups[station.river] = [];
      }
      riverGroups[station.river].push(station);
    });

    // Draw river lines (connecting stations on same river)
    Object.values(riverGroups).forEach(riverStations => {
      if (riverStations.length > 1) {
        // Sort by latitude (north to south) for a reasonable line order
        const sorted = [...riverStations].sort((a, b) => b.lat - a.lat);
        const points: L.LatLngTuple[] = sorted.map(s => [s.lat, s.lon]);

        L.polyline(points, {
          color: '#1d4ed8', // blue-700 - stands out on the bright basemap
          weight: 2.5,
          opacity: 0.55,
          dashArray: '6, 6',
        }).addTo(mapRef.current!);
      }
    });

    // Add station markers
    stations.forEach(station => {
      const color = getStatusColor(station.status);
      const isSelected = selectedStation?.station === station.station;

      // Create pulsing effect for flood stations
      const isPulsing = station.status === 'major_flood' || station.status === 'minor_flood';

      const marker = L.circleMarker([station.lat, station.lon], {
        radius: isSelected ? 14 : (isPulsing ? 10 : 8),
        fillColor: color,
        color: '#ffffff',
        weight: isSelected ? 3 : 2,
        opacity: 1,
        fillOpacity: 0.9,
      });

      // Create popup content (styled to read clearly against the bright basemap)
      const popupContent = `
        <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 180px; color: #1f2937;">
          <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${station.station}</div>
          <div style="color: #6b7280; font-size: 12px; margin-bottom: 8px;">${station.river}</div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="background: ${color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">
              ${getStatusLabel(station.status)}
            </span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
            <div>
              <div style="color: #6b7280;">Level</div>
              <div style="font-weight: bold; color: ${color};">${station.water_level_m.toFixed(2)}m</div>
            </div>
            <div>
              <div style="color: #6b7280;">Threshold</div>
              <div style="font-weight: bold; color: #111827;">${station.major_flood_level_m.toFixed(2)}m</div>
            </div>
          </div>
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
            <div style="background: #e5e7eb; border-radius: 4px; height: 6px; overflow: hidden;">
              <div style="background: ${color}; height: 100%; width: ${Math.min(station.pct_to_major_flood, 100)}%;"></div>
            </div>
            <div style="text-align: center; font-size: 11px; color: #6b7280; margin-top: 4px;">
              ${station.pct_to_major_flood.toFixed(0)}% to major flood
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        className: 'rivers-map-popup',
        closeButton: true,
      });

      marker.on('click', () => {
        onStationSelect(station);
      });

      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });

  }, [stations, selectedStation, onStationSelect]);

  // Pan to selected station
  useEffect(() => {
    if (mapRef.current && selectedStation) {
      mapRef.current.setView([selectedStation.lat, selectedStation.lon], 10, {
        animate: true,
        duration: 0.5,
      });
    }
  }, [selectedStation]);

  return (
    <>
      <style jsx global>{`
        .rivers-map-popup .leaflet-popup-content-wrapper {
          background: #ffffff;
          color: #1f2937;
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(15, 23, 42, 0.25);
        }
        .rivers-map-popup .leaflet-popup-tip {
          background: #ffffff;
        }
        .rivers-map-popup .leaflet-popup-close-button {
          color: #6b7280 !important;
        }
        .rivers-map-popup .leaflet-popup-close-button:hover {
          color: #111827 !important;
        }

        /* Pulsing animation for flood markers */
        @keyframes pulse-ring {
          0% {
            transform: scale(1);
            opacity: 0.8;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
    </>
  );
}
