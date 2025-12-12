// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet';
import { WeatherSummary, DistrictForecast, RiverStation, MarineCondition, IrrigationStation, api, GovernmentAlert, EarlyWarningAlertsResponse } from '@/lib/api';
import { getAlertColor, districts } from '@/lib/districts';
import { riverPaths } from '@/lib/rivers';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface RadarFrame {
  time: number;
  path: string;
}

interface RadarData {
  past: RadarFrame[];
  nowcast: RadarFrame[];
}

interface SatelliteData {
  infrared: RadarFrame[];
}

type OverlayType = 'radar' | 'satellite' | 'none';

export type MapLayer = 'rainfall' | 'danger' | 'temperature' | 'humidity' | 'wind' | 'pressure' | 'forecast1' | 'forecast2' | 'forecast3' | 'forecast4' | 'forecast5';

interface MapControllerProps {
  weatherData: WeatherSummary[];
  onZoomChange?: (zoom: number) => void;
}

// Store map instance globally so markers can access it
let mapInstance: L.Map | null = null;
let isZoomedIn = false;

function MapController({ weatherData, onZoomChange }: MapControllerProps) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    mapInstance = map;
    
    // Track zoom changes
    const handleZoom = () => {
      const currentZoom = map.getZoom();
      if (currentZoom <= 8) {
        isZoomedIn = false;
      }
      onZoomChange?.(currentZoom);
    };
    
    // Set initial zoom
    onZoomChange?.(map.getZoom());
    
    map.on('zoomend', handleZoom);
    map.on('zoom', handleZoom); // Also track during zoom animation
    
    return () => {
      map.off('zoomend', handleZoom);
      map.off('zoom', handleZoom);
    };
  }, [map, weatherData, onZoomChange]);
  return null;
}

// Function to focus on a position with zoom level 10
function focusOnPosition(lat: number, lon: number) {
  if (!mapInstance) return;
  
  // Always zoom in slowly to level 10
  mapInstance.setView([lat, lon], 10, {
    animate: true,
    duration: 1.2
  });
  isZoomedIn = true;
}

// Color scale functions for different data types

// Rainfall color: gradient from white (dry) to dark blue (heavy rain) - 20 points for 0-200+mm
function getRainfallColor(rainfall: number | null): string {
  if (rainfall === null || rainfall === 0) return '#ffffff';     // 0mm - white
  if (rainfall < 1) return '#f3f8fe';      // 0.1mm
  if (rainfall < 2) return '#e8f2fd';      // 0.5mm
  if (rainfall < 3) return '#dde9fc';      // 1mm
  if (rainfall < 5) return '#d0dffb';      // 2mm
  if (rainfall < 7) return '#bfe5fa';      // 5mm
  if (rainfall < 10) return '#a8d8f8';     // 7mm
  if (rainfall < 15) return '#8ecff7';     // 10mm
  if (rainfall < 20) return '#6fbff4';     // 15mm
  if (rainfall < 25) return '#4dafef';     // 20mm
  if (rainfall < 30) return '#2099e8';     // 25mm
  if (rainfall < 40) return '#0f7fce';     // 30mm
  if (rainfall < 50) return '#0d70ba';     // 40mm
  if (rainfall < 60) return '#0a5fa1';     // 50mm
  if (rainfall < 70) return '#084f89';     // 60mm
  if (rainfall < 80) return '#063f71';     // 70mm
  if (rainfall < 100) return '#042f59';    // 80mm
  if (rainfall < 130) return '#032241';    // 100mm
  if (rainfall < 160) return '#021529';    // 130mm
  if (rainfall < 200) return '#010914';    // 160mm
  return '#000b0f';                         // 200+mm - very dark blue (almost black)
}

function getTemperatureColor(temp: number | null): string {
  if (temp === null) return '#9ca3af';
  if (temp >= 35) return '#dc2626';
  if (temp >= 32) return '#f97316';
  if (temp >= 28) return '#eab308';
  if (temp >= 24) return '#22c55e';
  if (temp >= 20) return '#3b82f6';
  return '#6366f1';
}

function getHumidityColor(humidity: number | null): string {
  if (humidity === null) return '#9ca3af';
  if (humidity >= 90) return '#1e40af';
  if (humidity >= 80) return '#2563eb';
  if (humidity >= 70) return '#3b82f6';
  if (humidity >= 60) return '#60a5fa';
  if (humidity >= 50) return '#93c5fd';
  return '#dbeafe';
}

function getWindColor(speed: number | null): string {
  if (speed === null) return '#9ca3af';
  if (speed >= 60) return '#7c2d12';
  if (speed >= 40) return '#dc2626';
  if (speed >= 30) return '#f97316';
  if (speed >= 20) return '#eab308';
  if (speed >= 10) return '#22c55e';
  return '#86efac';
}

function getPressureColor(pressure: number | null): string {
  if (pressure === null) return '#9ca3af';
  if (pressure >= 1020) return '#1e40af';
  if (pressure >= 1015) return '#3b82f6';
  if (pressure >= 1010) return '#22c55e';
  if (pressure >= 1005) return '#eab308';
  if (pressure >= 1000) return '#f97316';
  return '#dc2626';
}

function getDangerColor(level: string): string {
  if (level === 'high') return '#dc2626';
  if (level === 'medium') return '#eab308';
  return '#22c55e';
}

// Flood gauge color gradient: grey→white for 0 to alert level, white→dark orange for alert to max
function getFloodGaugeGradientColor(pctToAlert: number): string {
  if (pctToAlert <= 5) return '#d1d5db';      // 0-5% - grey
  if (pctToAlert < 10) return '#d9dce0';      // 5-10%
  if (pctToAlert < 15) return '#e0e4e8';      // 10-15%
  if (pctToAlert < 20) return '#e8ecf0';      // 15-20%
  if (pctToAlert < 25) return '#f0f4f8';      // 20-25%
  if (pctToAlert < 30) return '#f8fbfd';      // 25-30%
  if (pctToAlert < 35) return '#ffffff';      // 30-35% - white (alert level area)
  if (pctToAlert < 40) return '#fff5e6';      // 35-40%
  if (pctToAlert < 45) return '#ffedcc';      // 40-45%
  if (pctToAlert < 50) return '#ffe0b2';      // 45-50%
  if (pctToAlert < 55) return '#ffd99a';      // 50-55%
  if (pctToAlert < 60) return '#ffcc80';      // 55-60%
  if (pctToAlert < 65) return '#ffbf66';      // 60-65%
  if (pctToAlert < 70) return '#ffb24d';      // 65-70%
  if (pctToAlert < 75) return '#ffa533';      // 70-75%
  if (pctToAlert < 80) return '#ff991a';      // 75-80%
  if (pctToAlert < 85) return '#ff8c00';      // 80-85%
  if (pctToAlert < 90) return '#ff7700';      // 85-90%
  if (pctToAlert < 95) return '#ff6600';      // 90-95%
  return '#ff5500';                           // 95%+ - dark orange
}

// Create custom flood gauge marker icon matching rain icon style with water gauge icon
function createFloodGaugeIcon(status: string, pctToAlert: number, showLabel: boolean = true): L.DivIcon {
  const circleSize = 24;
  const pctLabel = Math.round(pctToAlert);
  const color = getFloodGaugeGradientColor(pctToAlert);
  const waterLevel = Math.min(pctToAlert, 100);

  const gaugeSize = 24;

  return L.divIcon({
    className: 'custom-flood-gauge-marker',
    html: `<div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
    ">
      <svg width="${gaugeSize}" height="${gaugeSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
        <!-- Water level gauge container -->
        <rect x="5" y="8" width="14" height="12" rx="1" fill="rgba(255,255,255,0.9)" stroke="black" stroke-width="1.5"/>
        <!-- Measurement marks on the left -->
        <line x1="6" y1="10" x2="7" y2="10" stroke="black" stroke-width="1"/>
        <line x1="6" y1="13" x2="7" y2="13" stroke="black" stroke-width="1"/>
        <line x1="6" y1="16" x2="7" y2="16" stroke="black" stroke-width="1"/>
        <line x1="6" y1="19" x2="7" y2="19" stroke="black" stroke-width="1"/>
        <!-- Water level fill -->
        <rect x="5" y="${20 - waterLevel * 0.12}" width="14" height="${waterLevel * 0.12}" rx="1" fill="#3b82f6" opacity="0.9"/>
        <!-- Water surface with waves -->
        <path d="M6 ${20 - waterLevel * 0.12} Q7 ${19 - waterLevel * 0.12} 8 ${20 - waterLevel * 0.12} T10 ${20 - waterLevel * 0.12} T12 ${20 - waterLevel * 0.12} T14 ${20 - waterLevel * 0.12} T16 ${20 - waterLevel * 0.12} T18 ${20 - waterLevel * 0.12}" stroke="black" stroke-width="1.5" fill="none"/>
        <!-- Top mounting bracket -->
        <rect x="10" y="6" width="4" height="2" rx="0.5" fill="black"/>
      </svg>
      ${showLabel ? `<div style="
        margin-top: 3px;
        background: rgba(255, 255, 255, 0.95);
        padding: 2px 5px;
        border-radius: 4px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        font-weight: 600;
        color: #000000;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        white-space: nowrap;
        letter-spacing: 0.3px;
      ">${pctLabel}%</div>` : ''}
    </div>`,
    iconSize: showLabel ? [60, 50] : [gaugeSize, gaugeSize],
    iconAnchor: showLabel ? [30, 25] : [gaugeSize / 2, gaugeSize / 2],
  });
}

function getRiverStatusColorGradient(status: string): string {
  // All river stations are green
  return '#86efac';                     // Light green for all statuses
}

// Create water level icon for river stations
function createRiverStationIcon(color: string, waterLevelM?: number, showLabel: boolean = true): L.DivIcon {
  const gaugeSize = 24;
  const labelText = waterLevelM !== undefined ? `${waterLevelM.toFixed(1)}m` : null;
  console.log('River station icon color:', color);
  return L.divIcon({
    className: 'river-station-marker',
    html: `<div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
    ">
      <svg width="${gaugeSize}" height="${gaugeSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
        <!-- Water level gauge container -->
        <rect x="5" y="8" width="14" height="12" rx="1" fill="rgba(255,255,255,0.9)" stroke="black" stroke-width="1.5"/>
        <!-- Measurement marks on the left -->
        <line x1="6" y1="10" x2="7" y2="10" stroke="black" stroke-width="1"/>
        <line x1="6" y1="13" x2="7" y2="13" stroke="black" stroke-width="1"/>
        <line x1="6" y1="16" x2="7" y2="16" stroke="black" stroke-width="1"/>
        <line x1="6" y1="19" x2="7" y2="19" stroke="black" stroke-width="1"/>
        <!-- Water level fill (static at mid-level for river stations) -->
        <rect x="5" y="14" width="14" height="6" rx="1" fill="#3b82f6" opacity="0.9"/>
        <!-- Water surface with waves -->
        <path d="M6 14 Q7 13 8 14 T10 14 T12 14 T14 14 T16 14 T18 14" stroke="black" stroke-width="1.5" fill="none"/>
        <!-- Top mounting bracket -->
        <rect x="10" y="6" width="4" height="2" rx="0.5" fill="black"/>
      </svg>
      ${showLabel && labelText !== null ? `<div style="
        margin-top: 3px;
        background: rgba(255, 255, 255, 0.95);
        padding: 2px 5px;
        border-radius: 4px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        font-weight: 600;
        color: #000000;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        white-space: nowrap;
        letter-spacing: 0.3px;
      ">${labelText}</div>` : ''}
    </div>`,
    iconSize: (showLabel && labelText !== null) ? [60, 50] : [gaugeSize, gaugeSize],
    iconAnchor: (showLabel && labelText !== null) ? [30, 25] : [gaugeSize / 2, gaugeSize / 2],
  });
}

function getMarineRiskColor(riskLevel: string): string {
  switch (riskLevel) {
    case 'high': return '#0369a1';    // Dark cyan/blue - dangerous waves
    case 'medium': return '#0891b2';  // Cyan - moderate waves
    case 'low': return '#06b6d4';     // Light cyan - calm seas
    default: return '#9ca3af';        // Gray - unknown
  }
}

// Create custom wave icon for marine/coastal markers
function createMarineIcon(riskLevel: string): L.DivIcon {
  const color = getMarineRiskColor(riskLevel);
  const size = 28;

  return L.divIcon({
    className: 'custom-marine-marker',
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background-color: ${color};
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    ">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
        <path d="M2 12c1.5-2 3.5-3 6-3s4.5 1 6 3c1.5 2 3.5 3 6 3"/>
        <path d="M2 18c1.5-2 3.5-3 6-3s4.5 1 6 3c1.5 2 3.5 3 6 3" opacity="0.5"/>
        <path d="M2 6c1.5-2 3.5-3 6-3s4.5 1 6 3c1.5 2 3.5 3 6 3" opacity="0.5"/>
      </svg>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function getForecastAlertColor(level: string): string {
  if (level === 'red') return '#dc2626';
  if (level === 'orange') return '#f97316';
  if (level === 'yellow') return '#eab308';
  return '#22c55e';
}

// Get alert symbol based on level
function getAlertSymbol(level: string): string {
  switch (level) {
    case 'red': return '⚠';     // Warning triangle
    case 'orange': return '!';   // Exclamation
    case 'yellow': return '◆';   // Diamond
    default: return '●';         // Circle for green/normal
  }
}

// Create icon for early warning alerts
function createEarlyWarningIcon(alert: GovernmentAlert): L.DivIcon {
  const size = 32;
  // Determine color based on event type or tags
  let color = '#ef4444'; // Default red
  if (alert.tags && alert.tags.length > 0) {
    const tagsStr = alert.tags.join(' ').toLowerCase();
    if (tagsStr.includes('extreme') || tagsStr.includes('severe')) {
      color = '#dc2626'; // Dark red
    } else if (tagsStr.includes('moderate')) {
      color = '#f97316'; // Orange
    } else if (tagsStr.includes('minor')) {
      color = '#eab308'; // Yellow
    }
  }

  return L.divIcon({
    className: 'early-warning-marker',
    html: `<div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
    ">
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
        <!-- Warning triangle -->
        <path d="M12 2L22 20H2L12 2Z" fill="${color}" stroke="white" stroke-width="1.5"/>
        <!-- Exclamation mark -->
        <path d="M12 8V12M12 16H12.01" stroke="white" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Create small custom marker icon
function createAlertIcon(color: string, alertLevel: string, borderColor: string = 'white'): L.DivIcon {
  const size = 24;
  
  // Map alert level to water level percentage for visualization
  const alertToWaterLevel: Record<string, number> = {
    'green': 20,
    'yellow': 40,
    'orange': 60,
    'red': 85
  };
  const waterLevel = alertToWaterLevel[alertLevel] || 30;

  return L.divIcon({
    className: 'custom-alert-marker',
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background-color: ${color};
      border: 2px solid ${borderColor};
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.15s ease;
    ">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Water container/gauge -->
        <rect x="6" y="10" width="12" height="10" rx="2" fill="rgba(255,255,255,0.3)" stroke="white" stroke-width="2"/>
        <!-- Water level fill -->
        <rect x="6" y="${20 - waterLevel * 0.1}" width="12" height="${waterLevel * 0.1}" rx="1" fill="white"/>
        <!-- Water waves at surface -->
        <path d="M8 ${20 - waterLevel * 0.1} Q9 ${19 - waterLevel * 0.1} 10 ${20 - waterLevel * 0.1} T12 ${20 - waterLevel * 0.1} T14 ${20 - waterLevel * 0.1} T16 ${20 - waterLevel * 0.1}" stroke="white" stroke-width="1.5" fill="none" opacity="0.8"/>
        <!-- Top indicator dot -->
        <circle cx="12" cy="8" r="1.5" fill="white"/>
      </svg>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Create marker icon with raindrop and rainfall text
function createRainfallMarker(color: string, rainfallMm: number | null | undefined, borderColor: string = 'white', alertLevel: string = 'green', showLabel: boolean = true): L.DivIcon {
  // Ensure rainfallMm is a valid number
  const validRainfall = (rainfallMm !== null && rainfallMm !== undefined) ? rainfallMm : 0;
  const rainfallText = Math.round(validRainfall);

  // All rainfall labels use black text for consistency and readability
  const labelTextColor = '#000000';
  const raindropSize = 24;
  
  // Generate unique ID for gradients based on color and rainfall to avoid conflicts
  const gradientId = `raindropGrad-${color.replace('#', '')}-${rainfallText}`;
  const highlightId = `raindropHighlight-${color.replace('#', '')}-${rainfallText}`;

  // Determine animation class based on alert level
  const alertLevelLower = alertLevel.toLowerCase();
  let animationClass = '';
  
  if (alertLevelLower === 'red') {
    animationClass = 'raindrop-animate-red';
  } else if (alertLevelLower === 'orange') {
    animationClass = 'raindrop-animate-orange';
  } else if (alertLevelLower === 'yellow') {
    animationClass = 'raindrop-animate-yellow';
  } else {
    animationClass = 'raindrop-animate-green';
  }

  return L.divIcon({
    className: 'custom-rainfall-marker',
    html: `<div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
    ">
      <svg width="${raindropSize}" height="${raindropSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="${animationClass}" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); color: ${color};">
          <defs>
            <!-- 3D gradient for raindrop - lighter at top left, darker at bottom -->
            <linearGradient id="${gradientId}" x1="20%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
              <stop offset="40%" style="stop-color:${color};stop-opacity:0.95" />
              <stop offset="100%" style="stop-color:${color};stop-opacity:0.75" />
            </linearGradient>
            <!-- Highlight gradient for 3D shine effect on left side -->
            <linearGradient id="${highlightId}" x1="0%" y1="0%" x2="40%" y2="0%">
              <stop offset="0%" style="stop-color:rgba(255,255,255,0.5);stop-opacity:1" />
              <stop offset="50%" style="stop-color:rgba(255,255,255,0.2);stop-opacity:1" />
              <stop offset="100%" style="stop-color:rgba(255,255,255,0);stop-opacity:0" />
            </linearGradient>
          </defs>
          <!-- Raindrop shape - teardrop from top to bottom with 3D gradient -->
          <path d="M12 2C12 2 6 8 6 13C6 17.4183 9.58172 21 14 21C18.4183 21 22 17.4183 22 13C22 8 16 2 16 2L12 2Z" fill="url(#${gradientId})" stroke="black" stroke-width="1.5"/>
          <!-- Highlight overlay for 3D shine effect on left side -->
          <path d="M12 2C12 2 6 8 6 13C6 17.4183 9.58172 21 14 21C18.4183 21 22 17.4183 22 13C22 8 16 2 16 2L12 2Z" fill="url(#${highlightId})" opacity="0.7"/>
        </svg>
        ${showLabel ? `<div style="
          margin-top: 3px;
          background: #bfdbfe;
          padding: 2px 5px;
          border-radius: 4px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 12px;
          font-weight: 600;
          color: #000000;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          white-space: nowrap;
          letter-spacing: 0.3px;
        ">${rainfallText}mm</div>` : ''}
      </div>`,
    iconSize: showLabel ? [60, 50] : [raindropSize, raindropSize],
    iconAnchor: showLabel ? [30, 25] : [raindropSize / 2, raindropSize / 2],
  });
}

export type DangerFilter = 'all' | 'low' | 'medium' | 'high';

interface MapProps {
  onDistrictSelect?: (district: string) => void;
  hours: number;
  layer: MapLayer;
  dangerFilter?: DangerFilter;
  userLocation?: { lat: number; lon: number } | null;
  showRivers?: boolean;
  onShowRiversChange?: (show: boolean) => void;
}

export default function Map({ onDistrictSelect, hours, layer, dangerFilter = 'all', userLocation, showRivers: showRiversProp, onShowRiversChange }: MapProps) {
  const [weatherData, setWeatherData] = useState<WeatherSummary[]>([]);
  const [forecastData, setForecastData] = useState<DistrictForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overlayType, setOverlayType] = useState<OverlayType>('none');
  const [radarData, setRadarData] = useState<RadarData | null>(null);
  const [satelliteData, setSatelliteData] = useState<SatelliteData | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);
  const [showRiversInternal, setShowRiversInternal] = useState(false);
  const showRivers = showRiversProp !== undefined ? showRiversProp : showRiversInternal;
  const setShowRivers = onShowRiversChange || setShowRiversInternal;
  const [riverStations, setRiverStations] = useState<RiverStation[]>([]);
  const [showMarine, setShowMarine] = useState(false); // Hide marine/coast information
  const [marineConditions, setMarineConditions] = useState<MarineCondition[]>([]);
  const [showFloodGauges, setShowFloodGauges] = useState(true); // Show flood gauges by default
  const [floodGaugeStations, setFloodGaugeStations] = useState<IrrigationStation[]>([]);
  const [earlyWarningAlerts, setEarlyWarningAlerts] = useState<GovernmentAlert[]>([]);
  const [currentZoom, setCurrentZoom] = useState(8);

  const isForecastLayer = layer.startsWith('forecast');
  const forecastDayIndex = isForecastLayer ? parseInt(layer.replace('forecast', '')) - 1 : 0;

  // Fetch weather overlay data from RainViewer
  useEffect(() => {
    if (overlayType === 'none') return;

    const fetchOverlayData = async () => {
      try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const data = await res.json();
        setRadarData(data.radar);
        setSatelliteData(data.satellite);
        // Start at most recent frame
        if (overlayType === 'radar' && data.radar?.past) {
          setFrameIndex(data.radar.past.length - 1);
        } else if (overlayType === 'satellite' && data.satellite?.infrared) {
          setFrameIndex(data.satellite.infrared.length - 1);
        }
      } catch (err) {
        console.error('Failed to fetch overlay data:', err);
      }
    };

    fetchOverlayData();
    // No auto-refresh - data is cached on backend
  }, [overlayType]);

  // Get current frames based on overlay type
  const currentFrames = useMemo(() => {
    if (overlayType === 'radar' && radarData) {
      return [...radarData.past, ...radarData.nowcast];
    } else if (overlayType === 'satellite' && satelliteData) {
      return satelliteData.infrared;
    }
    return [];
  }, [overlayType, radarData, satelliteData]);

  // Fetch river data when enabled
  useEffect(() => {
    if (!showRivers) return;

    const fetchRiverData = async () => {
      try {
        const data = await api.getRiverLevels();
        setRiverStations(data.stations);
      } catch (err) {
        console.error('Failed to fetch river data:', err);
      }
    };

    fetchRiverData();
    // No auto-refresh - data is cached on backend
  }, [showRivers]);

  // Fetch marine data when enabled
  useEffect(() => {
    if (!showMarine) return;

    const fetchMarineData = async () => {
      try {
        const data = await api.getMarineConditions();
        setMarineConditions(data.conditions);
      } catch (err) {
        console.error('Failed to fetch marine data:', err);
      }
    };

    fetchMarineData();
    // No auto-refresh - data is cached on backend
  }, [showMarine]);

  // Fetch flood gauge (irrigation) data when enabled
  useEffect(() => {
    if (!showFloodGauges) return;

    const fetchFloodGaugeData = async () => {
      try {
        const data = await api.getIrrigationData();
        setFloodGaugeStations(data?.stations || []);
      } catch (err) {
        console.error('Failed to fetch flood gauge data:', err);
        setFloodGaugeStations([]); // Set empty array on error
      }
    };

    fetchFloodGaugeData();
    // No auto-refresh - data is cached on backend
  }, [showFloodGauges]);

  // Fetch early warning alerts
  useEffect(() => {
    const fetchEarlyWarningAlerts = async () => {
      try {
        const data = await api.getEarlyWarningAlerts();
        setEarlyWarningAlerts(data.alerts || []);
      } catch (err) {
        console.error('Failed to fetch early warning alerts:', err);
        setEarlyWarningAlerts([]);
      }
    };

    fetchEarlyWarningAlerts();
    // No auto-refresh - data is cached on backend
  }, []);

  // Animate overlay frames with different speeds
  useEffect(() => {
    if (overlayType === 'none' || currentFrames.length === 0 || !isAnimating) return;

    // Radar: 600ms, Satellite: 1200ms (slower for cloud movement)
    const animationSpeed = overlayType === 'radar' ? 600 : 1200;

    const timer = setInterval(() => {
      setFrameIndex(prev => (prev + 1) % currentFrames.length);
    }, animationSpeed);

    return () => clearInterval(timer);
  }, [overlayType, currentFrames.length, isAnimating]);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Use Promise.allSettled to handle partial failures gracefully
        // Weather data is essential, forecast is optional
        const [weatherResult, forecastResult] = await Promise.allSettled([
          api.getAllWeather(hours),
          api.getAllForecast()
        ]);

        if (isMounted) {
          // Weather is required - fail if it doesn't load
          if (weatherResult.status === 'fulfilled') {
            const data = weatherResult.value;
            // Debug: log the fields to ensure 48h/72h rainfall data exists
            if (data && data.length > 0) {
              console.log(`Weather data loaded for ${hours}h:`, {
                district: data[0].district,
                rainfall_24h_mm: data[0].rainfall_24h_mm,
                rainfall_48h_mm: data[0].rainfall_48h_mm,
                rainfall_72h_mm: data[0].rainfall_72h_mm,
              });
            }
            setWeatherData(data);
            setError('');
          } else {
            setError('Failed to load weather data');
            console.error('Weather fetch failed:', weatherResult.reason);
          }

          // Forecast is optional - use empty array if it fails
          if (forecastResult.status === 'fulfilled') {
            setForecastData(forecastResult.value);
          } else {
            console.warn('Forecast fetch failed (non-critical):', forecastResult.reason);
            // Keep existing forecast data or use empty array
            setForecastData(prev => prev.length > 0 ? prev : []);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError('Failed to load weather data');
          console.error(err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [hours]);

  // Create a map of forecast data by district
  const forecastByDistrict = useMemo(() => {
    const map: Record<string, DistrictForecast> = {};
    forecastData.forEach(f => {
      map[f.district] = f;
    });
    return map;
  }, [forecastData]);

  // Get current overlay tile URL (must be before any early returns)
  const overlayTileUrl = useMemo(() => {
    if (overlayType === 'none' || currentFrames.length === 0) return null;
    const frame = currentFrames[frameIndex % currentFrames.length];
    if (!frame) return null;

    if (overlayType === 'radar') {
      return `https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
    } else {
      // Satellite infrared - color scheme 0 (original)
      return `https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/0/0_0.png`;
    }
  }, [overlayType, currentFrames, frameIndex]);

  // Get overlay timestamp (must be before any early returns)
  const overlayTimestamp = useMemo(() => {
    if (overlayType === 'none' || currentFrames.length === 0) return '';
    const frame = currentFrames[frameIndex % currentFrames.length];
    if (!frame) return '';
    const date = new Date(frame.time * 1000);
    const isForecast = overlayType === 'radar' && radarData && frameIndex >= radarData.past.length;
    return `${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}${isForecast ? ' (forecast)' : ''}`;
  }, [overlayType, currentFrames, frameIndex, radarData]);

  // Get marker color based on selected layer
  const getMarkerColor = (district: WeatherSummary): string => {
    if (isForecastLayer) {
      const forecast = forecastByDistrict[district.district];
      if (forecast && forecast.forecast_daily[forecastDayIndex]) {
        return getForecastAlertColor(forecast.forecast_daily[forecastDayIndex].forecast_alert_level);
      }
      return '#9ca3af';
    }

    switch (layer) {
      case 'rainfall':
        const rainfallMm = hours === 24 ? district.rainfall_24h_mm : hours === 48 ? district.rainfall_48h_mm : district.rainfall_72h_mm;
        return getRainfallColor(rainfallMm);
      case 'danger':
        return getDangerColor(district.danger_level);
      case 'temperature':
        return getTemperatureColor(district.temperature_c);
      case 'humidity':
        return getHumidityColor(district.humidity_percent);
      case 'wind':
        return getWindColor(district.wind_speed_kmh);
      case 'pressure':
        return getPressureColor(district.pressure_hpa);
      default:
        return getAlertColor(district.alert_level);
    }
  };

  // Get value to display on marker based on layer
  const getMarkerValue = (district: WeatherSummary): string => {
    if (isForecastLayer) {
      const forecast = forecastByDistrict[district.district];
      if (forecast && forecast.forecast_daily[forecastDayIndex]) {
        return `${Math.round(Number(forecast.forecast_daily[forecastDayIndex].total_rainfall_mm) || 0)}`;
      }
      return '-';
    }

    switch (layer) {
      case 'rainfall':
        const rainfall = hours === 24 ? district.rainfall_24h_mm : hours === 48 ? district.rainfall_48h_mm : district.rainfall_72h_mm;
        return `${Math.round(Number(rainfall || 0))}`;
      case 'danger':
        return `${district.danger_score}`;
      case 'temperature':
        return district.temperature_c != null ? `${Math.round(Number(district.temperature_c))}` : '-';
      case 'humidity':
        return district.humidity_percent != null ? `${Math.round(Number(district.humidity_percent))}` : '-';
      case 'wind':
        return district.wind_speed_kmh != null ? `${Math.round(Number(district.wind_speed_kmh))}` : '-';
      case 'pressure':
        return district.pressure_hpa != null ? `${Math.round(Number(district.pressure_hpa))}` : '-';
      default:
        return '';
    }
  };

  // Filter weather data based on danger filter
  const filteredWeatherData = useMemo(() => {
    if (dangerFilter === 'all') return weatherData;
    return weatherData.filter(district => district.danger_level === dangerFilter);
  }, [weatherData, dangerFilter]);

  const markers = useMemo(() => {
    // Sort by priority: green < yellow < orange < red (so red renders on top)
    const alertPriority: Record<string, number> = {
      'green': 0,
      'yellow': 1,
      'orange': 2,
      'red': 3
    };

    const dangerPriority: Record<string, number> = {
      'low': 0,
      'moderate': 1,
      'medium': 1,
      'high': 2,
      'critical': 3
    };

    const sortedData = [...filteredWeatherData].sort((a, b) => {
      // Primary sort by alert level
      const alertDiff = (alertPriority[a.alert_level] || 0) - (alertPriority[b.alert_level] || 0);
      if (alertDiff !== 0) return alertDiff;

      // Secondary sort by danger level
      return (dangerPriority[a.danger_level] || 0) - (dangerPriority[b.danger_level] || 0);
    });

    return sortedData.map((district, index) => {
      const forecast = forecastByDistrict[district.district];
      const rainfallValue = hours === 24
        ? district.rainfall_24h_mm
        : hours === 48
          ? district.rainfall_48h_mm
          : district.rainfall_72h_mm;

      const markerColor = getMarkerColor(district);
      // Always use rainfall markers, with dark blue border to match the blue gradient
      const borderColor = '#0c4a6e'; // sky-900
      // Always show rainfall markers with animation based on alert level
      const showLabel = currentZoom > 10;
      const icon = createRainfallMarker(markerColor, rainfallValue || 0, borderColor, district.alert_level, showLabel);

      // Calculate z-index for weather markers (1000-1999 range, below flood gauges)
      const baseZIndex = 1000;
      const alertValue = alertPriority[district.alert_level] || 0;
      const dangerValue = dangerPriority[district.danger_level] || 0;
      const zIndex = baseZIndex + (alertValue * 100) + (dangerValue * 10) + index;

      return (
        <Marker
          key={`${district.district}-${hours}-${layer}-${rainfallValue}`}
          position={[district.latitude, district.longitude]}
          icon={icon}
          zIndexOffset={zIndex}
          eventHandlers={{
            click: () => {
              onDistrictSelect?.(district.district);
              focusOnPosition(district.latitude, district.longitude);
            },
          }}
        >
          <Popup maxWidth={360} minWidth={340} className="district-popup">
            <div className="p-2" style={{ width: '340px', maxWidth: '340px' }}>
              {/* Header with district name and alert badge */}
              <div className="flex justify-between items-center border-b pb-1.5 mb-2">
                <h3 className="font-bold text-sm">{district.district}</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  district.alert_level === 'green' ? 'bg-green-500 text-white' :
                  district.alert_level === 'yellow' ? 'bg-yellow-500 text-white' :
                  district.alert_level === 'orange' ? 'bg-orange-500 text-white' :
                  'bg-red-500 text-white'
                }`}>
                  {district.alert_level.toUpperCase()}
                </span>
              </div>

              {/* Two column layout */}
              <div className="flex gap-2">
                {/* Left column - Current conditions */}
                <div className="flex-1 space-y-1">
                  {/* Danger Level */}
                  <div className={`p-1.5 rounded text-center text-xs ${
                    district.danger_level === 'high' ? 'bg-red-100 border border-red-400' :
                    district.danger_level === 'medium' ? 'bg-yellow-100 border border-yellow-400' :
                    'bg-green-100 border border-green-400'
                  }`}>
                    <span className="text-gray-600">Risk: </span>
                    <span className={`font-bold ${
                      district.danger_level === 'high' ? 'text-red-700' :
                      district.danger_level === 'medium' ? 'text-yellow-700' :
                      'text-green-700'
                    }`}>{district.danger_level.toUpperCase()}</span>
                    <span className="text-gray-500 ml-1">({district.danger_score})</span>
                  </div>

                  {/* Current conditions grid */}
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div className="bg-orange-50 p-1 rounded text-center">
                      <div className="text-gray-500">Temp</div>
                      <div className="font-bold">{district.temperature_c != null ? Number(district.temperature_c).toFixed(1) : '-'}°C</div>
                    </div>
                    <div className="bg-blue-50 p-1 rounded text-center">
                      <div className="text-gray-500">Humidity</div>
                      <div className="font-bold">{district.humidity_percent != null ? Math.round(Number(district.humidity_percent)) : '-'}%</div>
                    </div>
                    <div className="bg-cyan-50 p-1 rounded text-center">
                      <div className="text-gray-500">Wind</div>
                      <div className="font-bold">{district.wind_speed_kmh != null ? Math.round(Number(district.wind_speed_kmh)) : '-'} km/h</div>
                    </div>
                  </div>

                  {/* Rainfall */}
                  <div className="bg-blue-50 p-1.5 rounded text-xs">
                    <div className="text-gray-600 mb-1">Rainfall (mm)</div>
                    <div className="grid grid-cols-3 gap-1 text-center">
                      <div className={hours === 24 ? 'font-bold text-blue-700' : ''}>
                        <div className="text-gray-500">24h</div>
                        <div>{Number(district.rainfall_24h_mm || 0).toFixed(1)}</div>
                      </div>
                      <div className={hours === 48 ? 'font-bold text-blue-700' : ''}>
                        <div className="text-gray-500">48h</div>
                        <div>{Number(district.rainfall_48h_mm || 0).toFixed(1)}</div>
                      </div>
                      <div className={hours === 72 ? 'font-bold text-blue-700' : ''}>
                        <div className="text-gray-500">72h</div>
                        <div>{Number(district.rainfall_72h_mm || 0).toFixed(1)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right column - Forecast */}
                <div className="flex-1 space-y-1">
                  <div className="text-xs font-semibold text-gray-600 text-center">5-Day Forecast</div>
                  {forecast && forecast.forecast_daily.length > 0 ? (
                    <div className="space-y-0.5">
                      {forecast.forecast_daily.slice(0, 5).map((day, idx) => (
                        <div
                          key={day.date}
                          className={`flex items-center justify-between p-1 rounded text-xs ${
                            layer === `forecast${idx + 1}` ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: getForecastAlertColor(day.forecast_alert_level) }}
                            />
                            <span className="font-medium w-12 truncate">{day.day_name.slice(0, 3)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600 font-semibold">{Math.round(Number(day.total_rainfall_mm) || 0)}mm</span>
                            <span className="text-gray-500">{day.max_precipitation_probability}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 text-center py-4">No forecast data</div>
                  )}

                  {/* Next 24h forecast summary */}
                  <div className="bg-purple-50 p-1.5 rounded text-xs text-center">
                    <div className="text-gray-600">Next 24h</div>
                    <div className="font-bold text-purple-700">{Number(district.forecast_precip_24h_mm || 0).toFixed(1)}mm</div>
                    <div className="text-gray-500">{Math.round(Number(district.precipitation_probability || 0))}% prob</div>
                  </div>
                </div>
              </div>

              {/* Risk Factors - compact */}
              {district.danger_factors && district.danger_factors.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t">
                  <div className="flex flex-wrap gap-1">
                    {district.danger_factors.slice(0, 3).map((factor, idx) => (
                      <span
                        key={idx}
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          factor.severity === 'high' ? 'bg-red-100 text-red-700' :
                          factor.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}
                      >
                        {factor.factor}: {factor.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      );
    });
  }, [filteredWeatherData, forecastByDistrict, hours, layer, onDistrictSelect, isForecastLayer, forecastDayIndex, currentZoom]);

  // River station markers
  const riverMarkers = useMemo(() => {
    if (!showRivers || riverStations.length === 0) return null;

    return riverStations.map((station) => (
      <Marker
        key={`river-${station.river_code}-${station.station}`}
        position={[station.lat, station.lon]}
        icon={createRiverStationIcon(getRiverStatusColorGradient(station.status), station.water_level_m, currentZoom > 10)}
        eventHandlers={{
          click: () => {
            focusOnPosition(station.lat, station.lon);
          },
        }}
      >
        <Popup maxWidth={300} minWidth={250}>
          <div className="p-1">
            <h3 className="font-bold text-sm border-b pb-1 mb-2">
              {station.river} ({station.river_code})
            </h3>
            <div className="text-xs text-gray-600 mb-2">{station.station}</div>

            {/* Status badge */}
            <div className={`inline-block px-2 py-1 rounded text-xs font-bold mb-2 ${
              station.status === 'alert' ? 'bg-red-100 text-red-700' :
              station.status === 'rising' ? 'bg-orange-100 text-orange-700' :
              station.status === 'falling' ? 'bg-green-100 text-green-700' :
              station.status === 'normal' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {station.status.toUpperCase()}
            </div>

            {/* Water levels */}
            <div className="grid grid-cols-3 gap-1 text-xs mb-2">
              <div className="bg-blue-50 p-1.5 rounded text-center">
                <div className="text-gray-500">Current</div>
                <div className="font-bold text-blue-700">{station.water_level_m.toFixed(2)}m</div>
              </div>
              <div className="bg-gray-50 p-1.5 rounded text-center">
                <div className="text-gray-500">1hr ago</div>
                <div className="font-medium">{station.water_level_1hr_ago_m.toFixed(2)}m</div>
              </div>
              <div className="bg-gray-50 p-1.5 rounded text-center">
                <div className="text-gray-500">9am</div>
                <div className="font-medium">{station.water_level_9am_m.toFixed(2)}m</div>
              </div>
            </div>

            {/* Additional info */}
            <div className="grid grid-cols-2 gap-1 text-xs">
              <div className="bg-cyan-50 p-1.5 rounded">
                <span className="text-gray-500">24h Rain: </span>
                <span className="font-bold">{station.rainfall_24h_mm.toFixed(1)}mm</span>
              </div>
              <div className="bg-gray-50 p-1.5 rounded">
                <span className="text-gray-500">Catchment: </span>
                <span className="font-medium">{station.catchment_area_km2}km²</span>
              </div>
            </div>

            {station.last_updated && (
              <div className="mt-2 pt-1 border-t text-xs text-gray-500">
                Updated: {station.last_updated}
              </div>
            )}
          </div>
        </Popup>
      </Marker>
    ));
  }, [showRivers, riverStations, currentZoom]);


  // Marine condition markers
  const marineMarkers = useMemo(() => {
    if (!showMarine || marineConditions.length === 0) return null;

    // Sort by risk level: low < medium < high (so high risk renders on top)
    const riskPriority: Record<string, number> = {
      'low': 0,
      'medium': 1,
      'high': 2
    };

    const sortedConditions = [...marineConditions].sort((a, b) => {
      return (riskPriority[a.risk_level] || 0) - (riskPriority[b.risk_level] || 0);
    });

    return sortedConditions.map((condition, index) => {
      // Calculate z-index for marine markers
      const baseZIndex = 500;
      const riskValue = riskPriority[condition.risk_level] || 0;
      const zIndex = baseZIndex + (riskValue * 100) + index;

      return (
        <Marker
          key={`marine-${condition.location}`}
          position={[condition.lat, condition.lon]}
          icon={createMarineIcon(condition.risk_level)}
          zIndexOffset={zIndex}
        >
          <Popup maxWidth={280} minWidth={250}>
            <div className="p-1">
              <h3 className="font-bold text-sm border-b pb-1 mb-2">
                {condition.location}
              </h3>

              {/* Risk badge */}
              <div className={`inline-block px-2 py-1 rounded text-xs font-bold mb-2 ${
                condition.risk_level === 'high' ? 'bg-red-100 text-red-700' :
                condition.risk_level === 'medium' ? 'bg-orange-100 text-orange-700' :
                'bg-green-100 text-green-700'
              }`}>
                {condition.risk_level.toUpperCase()} RISK
              </div>

              {/* Wave conditions */}
              <div className="grid grid-cols-2 gap-1 text-xs mb-2">
                <div className="bg-cyan-50 p-1.5 rounded text-center">
                  <div className="text-gray-500">Wave Height</div>
                  <div className="font-bold text-cyan-700">{condition.wave_height_m.toFixed(1)}m</div>
                </div>
                <div className="bg-blue-50 p-1.5 rounded text-center">
                  <div className="text-gray-500">Wind Waves</div>
                  <div className="font-bold text-blue-700">{condition.wind_wave_height_m.toFixed(1)}m</div>
                </div>
                <div className="bg-purple-50 p-1.5 rounded text-center">
                  <div className="text-gray-500">Swell Waves</div>
                  <div className="font-bold text-purple-700">{condition.swell_wave_height_m.toFixed(1)}m</div>
                </div>
                {condition.sea_surface_temp_c && (
                  <div className="bg-orange-50 p-1.5 rounded text-center">
                    <div className="text-gray-500">Sea Temp</div>
                    <div className="font-bold text-orange-700">{condition.sea_surface_temp_c.toFixed(1)}°C</div>
                  </div>
                )}
              </div>

              {/* Risk Factors */}
              {condition.risk_factors && condition.risk_factors.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 p-1.5 rounded text-xs mt-2">
                  <div className="font-semibold text-yellow-800 mb-0.5">Risk Factors:</div>
                  <div className="text-gray-700">{condition.risk_factors.join(', ')}</div>
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      );
    });
  }, [showMarine, marineConditions]);

  // Flood gauge (irrigation station) markers
  const floodGaugeMarkers = useMemo(() => {
    if (!showFloodGauges || floodGaugeStations.length === 0) return null;

    // Sort by flood severity: normal < alert < minor_flood < major_flood (so major renders on top)
    const statusPriority: Record<string, number> = {
      'normal': 0,
      'alert': 1,
      'minor_flood': 2,
      'major_flood': 3
    };

    const sortedStations = [...floodGaugeStations].sort((a, b) => {
      return (statusPriority[a.status] || 0) - (statusPriority[b.status] || 0);
    });

    return sortedStations.map((station, index) => {
      // Calculate z-index: higher priority status gets higher z-index
      const baseZIndex = 2000; // Start high to be above weather markers
      const statusPriorityValue = statusPriority[station.status] || 0;
      const zIndex = baseZIndex + (statusPriorityValue * 100) + index;

      return (
        <Marker
          key={`flood-gauge-${station.station}`}
          position={[station.lat, station.lon]}
          icon={createFloodGaugeIcon(station.status, station.pct_to_alert, currentZoom > 10)}
          zIndexOffset={zIndex}
          eventHandlers={{
            click: () => {
              focusOnPosition(station.lat, station.lon);
            },
          }}
        >
          <Popup maxWidth={300} minWidth={270}>
            <div className="p-1">
              <h3 className="font-bold text-sm border-b pb-1 mb-2">
                {station.station}
              </h3>
              <div className="text-xs text-gray-600 mb-2">{station.river}</div>

              {/* Status badge */}
              <div className={`inline-block px-2 py-1 rounded text-xs font-bold mb-2 ${
                station.status === 'major_flood' ? 'bg-red-100 text-red-700' :
                station.status === 'minor_flood' ? 'bg-orange-100 text-orange-700' :
                station.status === 'alert' ? 'bg-yellow-100 text-yellow-700' :
                'bg-green-100 text-green-700'
              }`}>
                {station.status.replace('_', ' ').toUpperCase()}
              </div>

              {/* Water level percentage */}
              <div className="bg-blue-50 border border-blue-200 p-2 rounded mb-2">
                <div className="text-xs text-gray-600 mb-1">Capacity to Alert Level</div>
                <div className={`text-2xl font-bold ${
                  station.pct_to_alert >= 100 ? 'text-red-700' :
                  station.pct_to_alert >= 80 ? 'text-orange-700' :
                  station.pct_to_alert >= 60 ? 'text-yellow-700' : 'text-green-700'
                }`}>
                  {station.pct_to_alert.toFixed(0)}%
                </div>
              </div>

              {/* Water levels */}
              <div className="grid grid-cols-2 gap-1 text-xs mb-2">
                <div className="bg-cyan-50 p-1.5 rounded">
                  <div className="text-gray-500">Current Level</div>
                  <div className="font-bold text-cyan-700">{station.water_level_m.toFixed(2)}m</div>
                </div>
                <div className="bg-red-50 p-1.5 rounded">
                  <div className="text-gray-500">Alert Level</div>
                  <div className="font-bold text-red-700">{station.alert_level_m.toFixed(2)}m</div>
                </div>
              </div>

              {/* Districts */}
              {station.districts && station.districts.length > 0 && (
                <div className="text-xs mt-2">
                  <span className="text-gray-500">Districts: </span>
                  <span className="font-medium">{station.districts.join(', ')}</span>
                </div>
              )}

              {station.last_updated && (
                <div className="mt-2 pt-1 border-t text-xs text-gray-500">
                  Updated: {station.last_updated}
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      );
    });
  }, [showFloodGauges, floodGaugeStations, currentZoom]);

  // Helper function to get alert severity (0-3)
  const getAlertSeverity = useCallback((alert: GovernmentAlert): number => {
    if (!alert.tags || alert.tags.length === 0) return 1;
    const tagsStr = alert.tags.join(' ').toLowerCase();
    if (tagsStr.includes('extreme') || tagsStr.includes('severe')) return 3;
    if (tagsStr.includes('moderate')) return 2;
    if (tagsStr.includes('minor')) return 1;
    return 1;
  }, []);

  // Early warning alert markers
  const earlyWarningMarkers = useMemo(() => {
    if (earlyWarningAlerts.length === 0) return null;

    // Get district coordinates for each alert
    const alertsWithCoords = earlyWarningAlerts
      .filter(alert => alert.district)
      .map(alert => {
        const districtData = districts.find(d => d.name === alert.district);
        if (!districtData) return null;
        return {
          alert,
          lat: districtData.latitude,
          lon: districtData.longitude,
        };
      })
      .filter((item): item is { alert: GovernmentAlert; lat: number; lon: number } => item !== null);

    // Group alerts by district to avoid duplicate markers
    type AlertWithCoords = { alert: GovernmentAlert; lat: number; lon: number };
    // Use a plain object to group alerts by district (avoiding Map type conflict with Leaflet)
    const alertsByDistrict: Record<string, AlertWithCoords[]> = {};
    alertsWithCoords.forEach(item => {
      const key = `${item.lat},${item.lon}`;
      if (!alertsByDistrict[key]) {
        alertsByDistrict[key] = [];
      }
      alertsByDistrict[key].push(item);
    });

    // Create markers for each district (one marker per district, showing alert count)
    return Object.entries(alertsByDistrict).map(([key, items], index) => {
      const { lat, lon } = items[0];
      const alertCount = items.length;
      const mostSevereAlert = items.reduce((prev, curr) => {
        // Determine severity based on tags
        const prevSeverity = getAlertSeverity(prev.alert);
        const currSeverity = getAlertSeverity(curr.alert);
        return currSeverity > prevSeverity ? curr : prev;
      }, items[0]);

      // Calculate z-index: early warning alerts should be on top (3000+)
      const baseZIndex = 3000;
      const severity = getAlertSeverity(mostSevereAlert.alert);
      const zIndex = baseZIndex + (severity * 100) + index;

      return (
        <Marker
          key={`early-warning-${key}-${index}`}
          position={[lat, lon]}
          icon={createEarlyWarningIcon(mostSevereAlert.alert)}
          zIndexOffset={zIndex}
          eventHandlers={{
            click: () => {
              focusOnPosition(lat, lon);
            },
          }}
        >
          <Popup maxWidth={350} minWidth={320}>
            <div className="p-2">
              <h3 className="font-bold text-sm border-b pb-1.5 mb-2">
                {mostSevereAlert.alert.district} - Early Warning Alert{alertCount > 1 ? `s (${alertCount})` : ''}
              </h3>
              
              {items.map((item, idx) => (
                <div key={idx} className={`mb-3 ${idx < items.length - 1 ? 'border-b pb-3' : ''}`}>
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700">{item.alert.event}</span>
                    <span className="text-xs text-gray-500">{item.alert.sender}</span>
                  </div>
                  
                  <div className="text-xs text-gray-600 mb-2">{item.alert.description}</div>
                  
                  <div className="flex flex-wrap gap-1 mb-2">
                    {item.alert.tags && item.alert.tags.map((tag, tagIdx) => (
                      <span
                        key={tagIdx}
                        className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  
                  <div className="text-[10px] text-gray-500">
                    <div>Start: {new Date(item.alert.start).toLocaleString()}</div>
                    <div>End: {new Date(item.alert.end).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </Popup>
        </Marker>
      );
    });
  }, [earlyWarningAlerts, getAlertSeverity]);

  // Show loading only on initial load, allow map to render even if data is empty
  if (loading && weatherData.length === 0 && !error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading map...</p>
        </div>
      </div>
    );
  }

  // Show error message but still render the map
  if (error && weatherData.length === 0) {
    // Don't block the map - show error overlay instead
  }

  const ankumburaCenter: [number, number] = [7.4393, 80.571];
  const mapCenter: [number, number] = ankumburaCenter;
  const mapZoom = 8;

  return (
    <div className="relative h-full w-full">
      {loading && (
        <div className="absolute top-2 right-2 z-[1000] bg-white px-3 py-1 rounded-full shadow-md flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          <span className="text-sm text-gray-600">Updating...</span>
        </div>
      )}
      {error && weatherData.length === 0 && (
        <div className="absolute top-2 left-2 z-[1000] bg-red-50 border border-red-200 px-3 py-2 rounded-lg shadow-md max-w-xs">
          <p className="text-sm text-red-600 font-medium">{error}</p>
          <p className="text-xs text-red-500 mt-1">Map will load with available data</p>
        </div>
      )}
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        className="h-full w-full rounded-lg"
        scrollWheelZoom={true}
      >
        <MapController weatherData={weatherData} onZoomChange={setCurrentZoom} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {overlayType !== 'none' && overlayTileUrl && (
          <TileLayer
            key={`${overlayType}-${frameIndex}`}
            url={overlayTileUrl}
            opacity={overlayType === 'radar' ? 0.7 : 0.6}
            attribution='<a href="https://rainviewer.com">RainViewer</a>'
          />
        )}
        {riverMarkers}
        {marineMarkers}
        {markers}
        {floodGaugeMarkers}
        {earlyWarningMarkers}
      </MapContainer>
    </div>
  );
}
