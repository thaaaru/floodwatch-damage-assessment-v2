// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface DamageMapLeafletProps {
  hasResults: boolean;
  activeLayer: string;
}

// Sri Lanka bounding box
const BBOX = {
  minLon: 79.5,
  minLat: 5.8,
  maxLon: 82.0,
  maxLat: 10.1
};

// Major flood-prone areas in Sri Lanka (demo data) - more detailed polygons
const FLOOD_ZONES = [
  // Western Province - Kelani Basin (expanded)
  { name: 'Kelani River Basin', coords: [[6.8, 79.85], [6.8, 80.3], [7.2, 80.3], [7.2, 79.85]], severity: 'high', area: 156.2 },
  // Colombo Metro flood zone
  { name: 'Colombo Metropolitan', coords: [[6.85, 79.82], [6.85, 79.98], [6.98, 79.98], [6.98, 79.82]], severity: 'high', area: 42.5 },
  // Ratnapura - Kalu Ganga basin
  { name: 'Ratnapura - Kalu Ganga', coords: [[6.4, 80.15], [6.4, 80.55], [6.8, 80.55], [6.8, 80.15]], severity: 'high', area: 198.7 },
  // Kalutara coastal
  { name: 'Kalutara Coastal Belt', coords: [[6.4, 79.88], [6.4, 80.12], [6.7, 80.12], [6.7, 79.88]], severity: 'medium', area: 87.3 },
  // Gampaha
  { name: 'Gampaha District', coords: [[7.0, 79.9], [7.0, 80.2], [7.25, 80.2], [7.25, 79.9]], severity: 'medium', area: 112.4 },
  // Batticaloa lagoon area
  { name: 'Batticaloa Lagoon', coords: [[7.6, 81.55], [7.6, 81.78], [7.9, 81.78], [7.9, 81.55]], severity: 'medium', area: 95.6 },
  // Galle coastal
  { name: 'Galle District', coords: [[5.92, 80.1], [5.92, 80.38], [6.18, 80.38], [6.18, 80.1]], severity: 'low', area: 68.4 },
  // Matara
  { name: 'Matara Coastal', coords: [[5.9, 80.45], [5.9, 80.65], [6.1, 80.65], [6.1, 80.45]], severity: 'low', area: 45.2 },
  // Puttalam lagoon
  { name: 'Puttalam Lagoon Area', coords: [[7.9, 79.75], [7.9, 79.95], [8.15, 79.95], [8.15, 79.75]], severity: 'low', area: 52.8 },
  // Mannar
  { name: 'Mannar District', coords: [[8.9, 79.85], [8.9, 80.1], [9.15, 80.1], [9.15, 79.85]], severity: 'low', area: 38.9 },
];

// Major rivers with more detail
const RIVERS = [
  { name: 'Mahaweli Ganga', coords: [[7.0, 80.5], [7.2, 80.55], [7.4, 80.62], [7.6, 80.7], [7.8, 80.8], [8.0, 80.9], [8.2, 81.0], [8.4, 81.1], [8.6, 81.2]], width: 5 },
  { name: 'Kelani Ganga', coords: [[6.95, 79.87], [6.98, 79.95], [7.02, 80.05], [7.06, 80.15], [7.1, 80.25], [7.15, 80.35], [7.2, 80.45]], width: 4 },
  { name: 'Kalu Ganga', coords: [[6.42, 79.96], [6.5, 80.08], [6.58, 80.2], [6.66, 80.32], [6.74, 80.44]], width: 4 },
  { name: 'Walawe Ganga', coords: [[6.22, 80.58], [6.32, 80.72], [6.42, 80.86], [6.52, 81.0]], width: 3 },
  { name: 'Deduru Oya', coords: [[7.55, 79.85], [7.6, 79.95], [7.65, 80.05], [7.7, 80.15]], width: 3 },
  { name: 'Nilwala Ganga', coords: [[5.95, 80.52], [6.02, 80.45], [6.08, 80.38], [6.14, 80.3]], width: 3 },
];

// Lakes and reservoirs
const LAKES = [
  { name: 'Victoria Reservoir', center: [7.23, 80.78], radius: 8000 },
  { name: 'Kotmale Reservoir', center: [7.05, 80.58], radius: 5000 },
  { name: 'Randenigala Reservoir', center: [7.32, 80.92], radius: 6000 },
  { name: 'Udawalawe Reservoir', center: [6.45, 80.85], radius: 7000 },
  { name: 'Parakrama Samudra', center: [7.93, 81.0], radius: 6500 },
];

export default function DamageMapLeaflet({ hasResults, activeLayer }: DamageMapLeafletProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<{
    flood?: L.LayerGroup;
    sar?: L.LayerGroup;
    ndwi?: L.LayerGroup;
    cloud?: L.LayerGroup;
    rivers?: L.LayerGroup;
    lakes?: L.LayerGroup;
  }>({});

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Initialize map centered on Sri Lanka
    const map = L.map(containerRef.current, {
      center: [7.8731, 80.7718],
      zoom: 8,
      zoomControl: false,
      minZoom: 7,
      maxZoom: 14,
    });

    // Add zoom control to top-left
    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Light base layers
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    });

    const cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© CARTO',
    });

    const cartoVoyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© CARTO Voyager',
    });

    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Esri Satellite',
    });

    const terrainLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenTopoMap',
    });

    // Add default light layer
    cartoVoyager.addTo(map);

    // Base layer control
    const baseLayers = {
      'Voyager (Default)': cartoVoyager,
      'Light': cartoLight,
      'OpenStreetMap': osmLayer,
      'Terrain': terrainLayer,
      'Satellite': satelliteLayer,
    };

    L.control.layers(baseLayers, {}, { position: 'topright' }).addTo(map);

    // Create layer groups
    layersRef.current.flood = L.layerGroup().addTo(map);
    layersRef.current.sar = L.layerGroup();
    layersRef.current.ndwi = L.layerGroup();
    layersRef.current.cloud = L.layerGroup();
    layersRef.current.rivers = L.layerGroup().addTo(map);
    layersRef.current.lakes = L.layerGroup().addTo(map);

    // Add rivers (permanent water)
    RIVERS.forEach(river => {
      const line = L.polyline(river.coords as L.LatLngExpression[], {
        color: '#0EA5E9',
        weight: river.width,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round',
      });
      line.bindPopup(`
        <div style="font-family: system-ui; padding: 4px;">
          <div style="font-weight: 600; color: #0369A1; font-size: 14px;">${river.name}</div>
          <div style="color: #64748B; font-size: 12px; margin-top: 4px;">Permanent waterway</div>
        </div>
      `);
      layersRef.current.rivers?.addLayer(line);
    });

    // Add lakes/reservoirs
    LAKES.forEach(lake => {
      const circle = L.circle(lake.center as L.LatLngExpression, {
        radius: lake.radius,
        color: '#0284C7',
        fillColor: '#7DD3FC',
        fillOpacity: 0.6,
        weight: 2,
      });
      circle.bindPopup(`
        <div style="font-family: system-ui; padding: 4px;">
          <div style="font-weight: 600; color: #0369A1; font-size: 14px;">${lake.name}</div>
          <div style="color: #64748B; font-size: 12px; margin-top: 4px;">Reservoir / Lake</div>
        </div>
      `);
      layersRef.current.lakes?.addLayer(circle);
    });

    // Add Sri Lanka outline
    L.rectangle(
      [[BBOX.minLat, BBOX.minLon], [BBOX.maxLat, BBOX.maxLon]],
      {
        color: '#94A3B8',
        weight: 2,
        fillOpacity: 0,
        dashArray: '8, 4',
      }
    ).addTo(map);

    // Add scale bar
    L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 150 }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update flood layers when results are available
  useEffect(() => {
    if (!mapRef.current || !layersRef.current.flood) return;

    // Clear existing layers
    layersRef.current.flood.clearLayers();
    layersRef.current.sar?.clearLayers();
    layersRef.current.ndwi?.clearLayers();
    layersRef.current.cloud?.clearLayers();

    if (hasResults) {
      // Add flood zones with better styling
      FLOOD_ZONES.forEach(zone => {
        const severityStyles: Record<string, { fill: string; stroke: string; opacity: number }> = {
          high: { fill: '#DC2626', stroke: '#991B1B', opacity: 0.5 },
          medium: { fill: '#F97316', stroke: '#C2410C', opacity: 0.45 },
          low: { fill: '#FBBF24', stroke: '#B45309', opacity: 0.4 },
        };

        const style = severityStyles[zone.severity] || severityStyles.low;

        const polygon = L.polygon(zone.coords as L.LatLngExpression[], {
          color: style.stroke,
          fillColor: style.fill,
          fillOpacity: style.opacity,
          weight: 2.5,
        });

        polygon.bindPopup(`
          <div style="font-family: system-ui; min-width: 200px; padding: 8px;">
            <div style="font-weight: 700; font-size: 15px; color: #1E293B; margin-bottom: 8px;">${zone.name}</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div style="background: #F8FAFC; padding: 8px; border-radius: 6px;">
                <div style="color: #64748B; font-size: 11px;">Severity</div>
                <div style="color: ${style.stroke}; font-weight: 700; font-size: 13px; text-transform: uppercase;">${zone.severity}</div>
              </div>
              <div style="background: #F8FAFC; padding: 8px; border-radius: 6px;">
                <div style="color: #64748B; font-size: 11px;">Est. Area</div>
                <div style="color: #0369A1; font-weight: 700; font-size: 13px;">${zone.area} km²</div>
              </div>
            </div>
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #64748B;">
              Detected via Sentinel-1 SAR + NDWI analysis
            </div>
          </div>
        `);

        layersRef.current.flood?.addLayer(polygon);
      });

      // Add SAR coverage indicator
      const sarRect = L.rectangle(
        [[BBOX.minLat + 0.3, BBOX.minLon + 0.2], [BBOX.maxLat - 0.3, BBOX.maxLon - 0.2]],
        {
          color: '#EA580C',
          fillColor: '#FDBA74',
          fillOpacity: 0.2,
          weight: 2,
          dashArray: '12, 6',
        }
      );
      sarRect.bindPopup(`
        <div style="font-family: system-ui; padding: 8px;">
          <div style="font-weight: 700; color: #EA580C; font-size: 14px;">Sentinel-1 SAR Coverage</div>
          <div style="color: #64748B; font-size: 12px; margin-top: 4px;">VV + VH Polarization</div>
          <div style="color: #64748B; font-size: 11px; margin-top: 4px;">Resolution: 10m</div>
        </div>
      `);
      layersRef.current.sar?.addLayer(sarRect);

      // Add NDWI indicator
      const ndwiRect = L.rectangle(
        [[BBOX.minLat + 0.5, BBOX.minLon + 0.4], [BBOX.maxLat - 0.5, BBOX.maxLon - 0.4]],
        {
          color: '#0891B2',
          fillColor: '#67E8F9',
          fillOpacity: 0.2,
          weight: 2,
        }
      );
      ndwiRect.bindPopup(`
        <div style="font-family: system-ui; padding: 8px;">
          <div style="font-weight: 700; color: #0891B2; font-size: 14px;">NDWI Water Index</div>
          <div style="color: #64748B; font-size: 12px; margin-top: 4px;">Sentinel-2 Optical Bands</div>
          <div style="color: #64748B; font-size: 11px; margin-top: 4px;">Green (B03) & NIR (B08)</div>
        </div>
      `);
      layersRef.current.ndwi?.addLayer(ndwiRect);

      // Add cloud patches
      const cloudPatches = [
        { coords: [[8.4, 80.4], [8.4, 81.1], [9.1, 81.1], [9.1, 80.4]], pct: 78 },
        { coords: [[6.9, 81.1], [6.9, 81.6], [7.4, 81.6], [7.4, 81.1]], pct: 45 },
        { coords: [[6.0, 81.0], [6.0, 81.4], [6.4, 81.4], [6.4, 81.0]], pct: 62 },
      ];

      cloudPatches.forEach((patch, idx) => {
        const cloud = L.polygon(patch.coords as L.LatLngExpression[], {
          color: '#94A3B8',
          fillColor: '#F1F5F9',
          fillOpacity: 0.7,
          weight: 1,
          dashArray: '4, 4',
        });
        cloud.bindPopup(`
          <div style="font-family: system-ui; padding: 8px;">
            <div style="font-weight: 700; color: #475569; font-size: 14px;">Cloud Cover Zone ${idx + 1}</div>
            <div style="color: #64748B; font-size: 12px; margin-top: 4px;">${patch.pct}% cloud coverage</div>
            <div style="color: #0891B2; font-size: 11px; margin-top: 4px;">Using SAR data (cloud-penetrating)</div>
          </div>
        `);
        layersRef.current.cloud?.addLayer(cloud);
      });
    }
  }, [hasResults]);

  // Toggle layers based on activeLayer
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;

    // Remove all overlay layers first
    if (layersRef.current.sar) map.removeLayer(layersRef.current.sar);
    if (layersRef.current.ndwi) map.removeLayer(layersRef.current.ndwi);
    if (layersRef.current.cloud) map.removeLayer(layersRef.current.cloud);
    if (layersRef.current.flood) map.removeLayer(layersRef.current.flood);

    // Add selected layer
    switch (activeLayer) {
      case 'flood':
        if (layersRef.current.flood) map.addLayer(layersRef.current.flood);
        break;
      case 'sar':
        if (layersRef.current.sar) map.addLayer(layersRef.current.sar);
        if (layersRef.current.flood) map.addLayer(layersRef.current.flood);
        break;
      case 'ndwi':
        if (layersRef.current.ndwi) map.addLayer(layersRef.current.ndwi);
        if (layersRef.current.flood) map.addLayer(layersRef.current.flood);
        break;
      case 'cloud':
        if (layersRef.current.cloud) map.addLayer(layersRef.current.cloud);
        if (layersRef.current.flood) map.addLayer(layersRef.current.flood);
        break;
    }
  }, [activeLayer]);

  return (
    <>
      <style jsx global>{`
        .leaflet-popup-content-wrapper {
          border-radius: 10px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          border: 1px solid #E2E8F0;
        }
        .leaflet-popup-content {
          margin: 8px;
        }
        .leaflet-popup-tip {
          border-top-color: #E2E8F0;
        }
        .leaflet-control-layers {
          border-radius: 8px;
          border: 1px solid #E2E8F0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .leaflet-control-zoom a {
          border-radius: 6px !important;
        }
        .leaflet-control-zoom {
          border-radius: 8px !important;
          border: 1px solid #E2E8F0 !important;
          overflow: hidden;
        }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
    </>
  );
}
