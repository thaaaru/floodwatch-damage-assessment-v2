// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { IrrigationStation } from '@/lib/api';
import { addBasemap, addSatelliteOption } from '@/lib/basemap';
import { BASIN_CREDIT, GAUGE_CREDIT, createGaugeLayer, createWaterLayer, gaugesKey } from '@/lib/gauges';

interface RiversMapProps {
  stations: IrrigationStation[];
  onStationSelect: (station: IrrigationStation | null) => void;
  selectedStation: IrrigationStation | null;
}

export default function RiversMap({ stations, onStationSelect, selectedStation }: RiversMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<L.Control.Layers | null>(null);
  const gaugeLayerRef = useRef<L.LayerGroup | null>(null);
  const restyleWaterRef = useRef<(() => void) | null>(null);
  const gaugeKeyRef = useRef('');
  const stationsRef = useRef<IrrigationStation[]>(stations);
  stationsRef.current = stations;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [7.8731, 80.7718],
      zoom: 8,
      zoomControl: false,
      attributionControl: false,
    });
    L.control.zoom({ position: 'topright' }).addTo(map);
    addBasemap(map); // carries its own OSM/Protomaps attribution
    L.control.attribution({ position: 'bottomright' })
      .addAttribution(`${GAUGE_CREDIT} &middot; ${BASIN_CREDIT}`)
      .addTo(map);
    controlRef.current = L.control.layers(undefined, undefined, { position: 'topleft', collapsed: false }).addTo(map);
    addSatelliteOption(L, controlRef.current);
    mapRef.current = map;

    // Basins + rivers: on by default on /rivers, drawn under the gauge markers.
    createWaterLayer(map, () => stationsRef.current)
      .then(({ layer, restyle }) => {
        if (mapRef.current !== map) return;
        layer.addTo(map);
        restyleWaterRef.current = restyle;
        controlRef.current?.addOverlay(layer, 'River basins &amp; rivers');
      })
      .catch((e) => console.error('Failed to load river basins/rivers:', e));

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Gauges: rebuild on data change; restyle basins by their worst gauge.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const key = gaugesKey(stations);
    if (gaugeLayerRef.current && key === gaugeKeyRef.current) return;
    gaugeKeyRef.current = key;
    const wasOn = !gaugeLayerRef.current || map.hasLayer(gaugeLayerRef.current);
    if (gaugeLayerRef.current) {
      controlRef.current?.removeLayer(gaugeLayerRef.current);
      gaugeLayerRef.current.remove();
    }
    const layer = createGaugeLayer(stations, onStationSelect);
    if (wasOn) layer.addTo(map);
    controlRef.current?.addOverlay(layer, 'River gauges');
    gaugeLayerRef.current = layer;
    restyleWaterRef.current?.();
  }, [stations, onStationSelect]);

  // Pan to selected station
  useEffect(() => {
    if (mapRef.current && selectedStation?.lat != null && selectedStation.lon != null) {
      mapRef.current.setView([selectedStation.lat, selectedStation.lon], 10, { animate: true, duration: 0.5 });
    }
  }, [selectedStation]);

  return <div ref={containerRef} className="w-full h-full" />;
}
