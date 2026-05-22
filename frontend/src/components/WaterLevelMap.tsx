// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { IrrigationStation } from '@/lib/api';
import { riverPaths } from '@/lib/rivers';

interface WaterLevelMapProps {
  stations: IrrigationStation[];
  selectedStation: IrrigationStation | null;
  onStationSelect: (station: IrrigationStation | null) => void;
}

// Single-purpose palette: physically-measured water-level status -> color.
const statusColor = (status: string): string => {
  switch (status) {
    case 'major_flood':
      return '#dc2626'; // red-600
    case 'minor_flood':
      return '#f97316'; // orange-500
    case 'alert':
      return '#eab308'; // yellow-500
    default:
      return '#16a34a'; // green-600
  }
};

const statusLabel = (status: string): string => {
  switch (status) {
    case 'major_flood':
      return 'MAJOR FLOOD';
    case 'minor_flood':
      return 'MINOR FLOOD';
    case 'alert':
      return 'ALERT';
    default:
      return 'NORMAL';
  }
};

/**
 * Minimal "rivers + water-level stations" map.
 *
 * Intentionally simpler than the Flood Hub map: bright basemap, the
 * pre-built Sri Lanka river paths (lib/rivers.ts) drawn as colored
 * polylines, and the live Irrigation Dept gauging stations on top as
 * status-colored markers. No HydroSHEDS basins, no AIG tile overlays.
 *
 * The map is created once (on mount) and only the marker layer is
 * re-rendered when station data refreshes.
 */
export default function WaterLevelMap({
  stations,
  selectedStation,
  onStationSelect,
}: WaterLevelMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const riverLayerRef = useRef<L.LayerGroup | null>(null);

  // --- one-time map initialisation -----------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [7.8731, 80.7718], // Sri Lanka centroid
      zoom: 8,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Bright basemap (CARTO Voyager - free, no API key).
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    L.control
      .attribution({ position: 'bottomright' })
      .addAttribution(
        '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org/copyright">OSM</a>',
      )
      .addTo(map);

    // Draw the pre-built river paths once. They are reference geometry
    // (not live data), so they live in a permanent layer group that is
    // never cleared.
    const rivers = L.layerGroup().addTo(map);
    riverPaths.forEach((river) => {
      // White halo + colored core makes the line readable on top of any
      // basemap shade.
      L.polyline(river.coordinates as L.LatLngTuple[], {
        color: '#ffffff',
        weight: 6,
        opacity: 0.7,
        lineCap: 'round',
      }).addTo(rivers);
      L.polyline(river.coordinates as L.LatLngTuple[], {
        color: river.color,
        weight: 3,
        opacity: 0.95,
        lineCap: 'round',
      })
        .bindTooltip(river.name, { sticky: true, direction: 'top' })
        .addTo(rivers);
    });
    riverLayerRef.current = rivers;

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      riverLayerRef.current = null;
    };
  }, []);

  // --- marker layer: re-render whenever stations change --------------
  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    stations.forEach((station) => {
      const color = statusColor(station.status);
      const isSelected = selectedStation?.station === station.station;
      const isFlood = station.status === 'major_flood' || station.status === 'minor_flood';

      const marker = L.circleMarker([station.lat, station.lon], {
        radius: isSelected ? 13 : isFlood ? 10 : 8,
        fillColor: color,
        color: '#ffffff',
        weight: isSelected ? 3 : 2,
        opacity: 1,
        fillOpacity: 0.95,
      });

      const pctBar = Math.min(Math.max(station.pct_to_major_flood ?? 0, 0), 100);
      const popupContent = `
        <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 200px; color: #1f2937;">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 2px;">${station.station}</div>
          <div style="color: #6b7280; font-size: 11px; margin-bottom: 6px;">${station.river}${
        station.districts?.length ? ` &middot; ${station.districts.join(', ')}` : ''
      }</div>
          <div style="display: inline-block; background: ${color}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; margin-bottom: 8px;">
            ${statusLabel(station.status)}
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px;">
            <div>
              <div style="color: #6b7280;">Current</div>
              <div style="font-weight: 700; color: ${color}; font-size: 13px;">${station.water_level_m?.toFixed(2) ?? '—'} m</div>
            </div>
            <div>
              <div style="color: #6b7280;">Alert</div>
              <div style="font-weight: 600;">${station.alert_level_m?.toFixed(2) ?? '—'} m</div>
            </div>
            <div>
              <div style="color: #6b7280;">Minor flood</div>
              <div style="font-weight: 600; color: #f97316;">${station.minor_flood_level_m?.toFixed(2) ?? '—'} m</div>
            </div>
            <div>
              <div style="color: #6b7280;">Major flood</div>
              <div style="font-weight: 600; color: #dc2626;">${station.major_flood_level_m?.toFixed(2) ?? '—'} m</div>
            </div>
          </div>
          <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #e5e7eb;">
            <div style="background: #e5e7eb; border-radius: 4px; height: 6px; overflow: hidden;">
              <div style="background: ${color}; height: 100%; width: ${pctBar}%;"></div>
            </div>
            <div style="text-align: center; font-size: 10px; color: #6b7280; margin-top: 3px;">
              ${pctBar.toFixed(0)}% to major flood threshold
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, { className: 'water-level-popup', closeButton: true });
      marker.on('click', () => onStationSelect(station));
      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });
  }, [stations, selectedStation, onStationSelect]);

  // --- pan to selected station ---------------------------------------
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
        .water-level-popup .leaflet-popup-content-wrapper {
          background: #ffffff;
          color: #1f2937;
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(15, 23, 42, 0.25);
        }
        .water-level-popup .leaflet-popup-tip {
          background: #ffffff;
        }
        .water-level-popup .leaflet-popup-close-button {
          color: #6b7280 !important;
        }
        .water-level-popup .leaflet-popup-close-button:hover {
          color: #111827 !important;
        }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
    </>
  );
}
