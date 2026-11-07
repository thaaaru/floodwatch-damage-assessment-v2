// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CandidateRoute, EmergencyFacility, IrrigationStation, MapCoordinate, MetStation } from '@/lib/api';
import { addBasemap, addSatelliteOption } from '@/lib/basemap';
import { createForecastLayer } from '@/lib/forecast';
import { createRainNormalLayer } from '@/lib/rainNormal';
import { OUTLOOK_SLOT, withOutlook } from '@/lib/rainOutlook';
import { createCycloneLayer } from '@/lib/cyclones';
import { createSeaLevelLayer } from '@/lib/seaLevel';
import { createRain24hLayer } from '@/lib/rain24h';
import { createFacilitiesLayer } from '@/lib/facilities';
import {
  BASIN_CREDIT, GAUGE_CREDIT, createBasinLegend, createGaugeLayer, createWaterLayer, gaugesKey,
} from '@/lib/gauges';
import { PALETTES, Palette, Theme, cssVars, RAIN_PULSE_MM, rainDropColor, rainDropSize, rainDropSvg } from '@/lib/mapPalette';
import { DOCK_LEGENDS, DOCK_TOP } from '@/lib/gauges';
import { createPlaceLabels } from '@/lib/places';
import { addBulletinOverlays } from '@/lib/bulletins';

// The map theme is a per-viewer preference; storage can be unavailable (private mode), so it is optional.
const THEME_KEY = 'fw-map-theme';
const readTheme = (): Theme => {
  try { return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
};
const saveTheme = (t: Theme) => {
  try { window.localStorage.setItem(THEME_KEY, t); } catch { /* not persisted */ }
};
const LAND_PANE = 'fw-land'; // z 210
const basemapStyle = (theme: Theme, p: Palette) => ({
  base: theme === 'light' ? 'light' as const : 'dark' as const,
  land: p.land, water: p.water, coast: p.coast, waterLabel: p.waterLabel, landcover: p.landcover, pane: LAND_PANE,
});

interface MetStationsMapProps {
  mode: 'public' | 'technical';
  stations: MetStation[];
  selectedWmoId: number | null;
  onStationSelect: (s: MetStation | null) => void;
  gauges?: IrrigationStation[];
  selectedLocation?: MapCoordinate | null;
  onLocationSelect?: (location: MapCoordinate) => void;
  facilities?: EmergencyFacility[];
  route?: CandidateRoute | null;
  // Zoom to this gauge and open its popup; a new object each time, so the same gauge can be picked again.
  focusGauge?: { g: IrrigationStation } | null;
  // Met Dept feed returned nothing or failed: the NBRO rain gauges come on instead, so the map still shows observed rain.
}

/**
 * Dual-purpose map: public location context or technical measured monitoring.
 * Model overlays stay optional and visibly labelled.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

// Each raindrop's mm tag takes the first side (below, above, right, left) clear of other drops, flood
// gauges, landslide marks and tags already placed; if none is clear, the least covered side. Drops can't move
// (they mark the station). Runs before rain badges and town names re-place (a frame later), which avoid both.
function placeDropTags(map: L.Map) {
  const box = (el: Element) => el.getBoundingClientRect();
  const c = map.getContainer();
  // Reset every tag, then measure everything, then move: one layout pass instead of one per tag.
  const drops = [...c.querySelectorAll<HTMLElement>('.met-station-marker')].flatMap((m) => {
    const tag = m.querySelector<HTMLElement>('.met-tag');
    const drop = m.querySelector('svg');
    if (!tag || !drop) return [];
    tag.style.transform = '';
    tag.style.visibility = '';
    return [{ tag, drop }];
  });
  const taken = [...c.querySelectorAll('.met-station-marker svg, .leaflet-fw-gauges-pane .leaflet-marker-icon, .leaflet-fw-official-warn-pane .leaflet-marker-icon')].map(box);
  // Area of the box at (x, y) covered by what is already there; 0 = clear.
  const overlap = (boxes: DOMRect[], x: number, y: number, w: number, h: number) => boxes.reduce((sum, t) =>
    sum + Math.max(0, Math.min(t.right, x + w) - Math.max(t.left, x)) * Math.max(0, Math.min(t.bottom, y + h) - Math.max(t.top, y)), 0);
  const cover = (x: number, y: number, w: number, h: number) => overlap(taken, x, y, w, h);
  const tags: DOMRect[] = []; // only another tag can hide a tag; drops and gauges just steer it to a clearer side
  // Wettest first: where a cluster has no room, the lowest values lose their tag (still in the tooltip and popup).
  const measured = drops.map(({ tag, drop }) => ({ tag, mm: parseFloat(tag.textContent ?? '') || 0, s: box(drop), t: box(tag) }));
  measured.sort((a, b) => b.mm - a.mm).forEach(({ tag, s, t }) => {
    const w = t.width, h = t.height, cy = (s.top + s.bottom) / 2;
    const spots = [[t.left, t.top], [t.left, s.top - 3 - h], [s.right + 2, cy - h / 2], [s.left - 2 - w, cy - h / 2]];
    const [x, y] = spots.reduce((best, p) => (cover(p[0], p[1], w, h) < cover(best[0], best[1], w, h) ? p : best));
    if (overlap(tags, x, y, w, h) > w * h * 0.1) { tag.style.visibility = 'hidden'; return; }
    tag.style.transform = `translate(${x - t.left}px, ${y - t.top}px)`;
    taken.push(new DOMRect(x, y, w, h));
    tags.push(new DOMRect(x, y, w, h));
  });
}

const MET_PANE = 'fw-met-drops'; // z 645: above gauges (644) and place labels (640), under tooltips (650) and popups (700)

function makeIcon(station: MetStation): L.DivIcon {
  const mm = station.rainfall_since_830am_mm ?? 0;
  const color = rainDropColor(mm);
  const labelText = mm > 0 ? `${mm.toFixed(1)}mm` : '0';
  // Inline SVG drop, same as the NBRO drops but larger.
  return L.divIcon({
    className: 'met-station-marker',
    html: `
      <div style="display:flex; flex-direction:column; align-items:center; cursor:pointer;">
        ${rainDropSvg(rainDropSize(16, mm), color, mm >= RAIN_PULSE_MM)}
        <div class="met-tag" style="
          margin-top: 3px;
          padding: 2px 6px;
          border-radius: 4px;
          background: #ffffff;
          color: #0f172a;
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
  const c = rainDropColor(mm);
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
      <div style="font-weight:700; font-size:14px; margin-bottom:2px;">${escapeHtml(s.name)}</div>
      <div style="color:#6b7280; font-size:11px; margin-bottom:6px;">
        ${escapeHtml(s.district)} &middot; WMO ${s.wmo_id}
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
      ${OUTLOOK_SLOT}
    </div>
  `;
}

// Full-screen toggle using the browser Fullscreen API (no plugin). Hidden where
// element full-screen is unsupported (e.g. iPhone Safari).
const ISLAND: L.LatLngBoundsExpression = [[5.9, 79.6], [9.85, 81.9]];
const FLOODING: IrrigationStation['status'][] = ['alert', 'minor', 'major'];
// Keep the south clear of the credits line.
const fitIsland = (map: L.Map) => map.fitBounds(ISLAND, { paddingBottomRight: [0, 24] });

// "Flood area" zooms to the gauges at alert or worse; "Whole island" resets the view; the third button flips the theme.
function addViewControl(map: L.Map, getGauges: () => IrrigationStation[], getTheme: () => Theme, toggleTheme: () => void) {
  const Control = L.Control.extend({
    onAdd() {
      const bar = L.DomUtil.create('div', 'fw-view-switch');
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'Map view');
      const make = (text: string, onClick: (btn: HTMLButtonElement) => void) => {
        const btn = L.DomUtil.create('button', '', bar) as HTMLButtonElement;
        btn.type = 'button';
        btn.textContent = text;
        L.DomEvent.on(btn, 'click', () => onClick(btn));
        return btn;
      };
      make('Flood area', (btn) => {
        const pts = getGauges().filter((g) => FLOODING.includes(g.status) && g.lat !== null && g.lon !== null)
          .map((g) => [g.lat, g.lon] as [number, number]);
        if (pts.length === 0) {
          btn.textContent = 'No gauges at alert';
          setTimeout(() => { btn.textContent = 'Flood area'; }, 2000);
          return;
        }
        map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 10, animate: !prefersReducedMotion() });
      });
      make('Whole island', () => fitIsland(map));
      const themeBtn = make('', () => { toggleTheme(); syncTheme(); });
      themeBtn.className = 'fw-theme-btn';
      themeBtn.setAttribute('aria-label', 'Dark map');
      const syncTheme = () => {
        const dark = getTheme() === 'dark';
        themeBtn.textContent = dark ? '\u2600' : '\u263E'; // sun to go light, moon to go dark
        themeBtn.title = dark ? 'Light map' : 'Dark map';
        themeBtn.setAttribute('aria-pressed', String(dark));
      };
      syncTheme();
      L.DomEvent.disableClickPropagation(bar);
      return bar;
    },
  });
  new Control({ position: DOCK_TOP }).addTo(map);
}

function addFullscreenControl(map: L.Map) {
  // Full screen takes the whole shell, so the toolbar and legends outside the canvas come along.
  const el = map.getContainer().closest<HTMLElement>('.fw-map-shell') ?? map.getContainer();
  if (!document.fullscreenEnabled || !el.requestFullscreen) return;
  const Control = L.Control.extend({
    onAdd() {
      const bar = L.DomUtil.create('div', 'leaflet-bar');
      const btn = L.DomUtil.create('button', 'fw-fullscreen', bar) as HTMLButtonElement;
      btn.type = 'button';
      const label = () => {
        const on = document.fullscreenElement === el;
        btn.title = on ? 'Exit full screen' : 'View larger map';
        btn.setAttribute('aria-label', btn.title);
        btn.innerHTML = on ? '&#x2715;' : '&#x26F6;';
      };
      label();
      L.DomEvent.disableClickPropagation(bar);
      L.DomEvent.on(btn, 'click', () => {
        if (document.fullscreenElement === el) document.exitFullscreen();
        else el.requestFullscreen().catch(() => {});
      });
      const onChange = () => {
        label();
        map.invalidateSize();
        if (document.fullscreenElement === el) map.scrollWheelZoom.enable();
      };
      document.addEventListener('fullscreenchange', onChange);
      map.on('unload', () => document.removeEventListener('fullscreenchange', onChange));
      return bar;
    },
  });
  new Control({ position: 'topright' }).addTo(map);
}

function createLocationControl(map: L.Map, onSelect: (location: MapCoordinate) => void): L.Control {
  const Control = L.Control.extend({
    onAdd() {
      const bar = L.DomUtil.create('div', 'leaflet-bar');
      const button = L.DomUtil.create('button', 'fw-use-centre', bar) as HTMLButtonElement;
      button.type = 'button';
      button.textContent = 'Use map centre';
      button.setAttribute('aria-label', 'Use map centre as selected location');
      L.DomEvent.disableClickPropagation(bar);
      L.DomEvent.on(button, 'click', () => {
        const centre = map.getCenter();
        onSelect({ latitude: centre.lat, longitude: centre.lng });
      });
      return bar;
    },
  });
  return new Control({ position: 'topright' });
}

// "Gauges updated N min ago" from the newest gauge reading; old (> 1 h) shows in the theme's warn colour.
function useGaugeFreshness(gauges: IrrigationStation[]) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const newest = Math.max(...gauges.map((g) => Date.parse(g.observed_at)).filter(Number.isFinite));
  if (!Number.isFinite(newest)) return null;
  const min = Math.max(0, Math.round((now - newest) / 60_000));
  return { text: `Gauges updated ${min < 60 ? `${min} min` : `${Math.round(min / 60)} h`} ago`, old: min > 60 };
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function MetStationsMap({
  mode,
  stations,
  selectedWmoId,
  onStationSelect,
  gauges = [],
  selectedLocation = null,
  onLocationSelect,
  facilities = [],
  route = null,
  focusGauge = null,
}: MetStationsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const topDockRef = useRef<HTMLDivElement>(null);
  const legendDockRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const controlRef = useRef<L.Control.Layers | null>(null);
  const locationControlRef = useRef<L.Control | null>(null);
  const gaugeLayerRef = useRef<L.LayerGroup | null>(null);
  const renderGaugesRef = useRef<(() => void) | null>(null);
  const restyleWaterRef = useRef<(() => void) | null>(null);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const themeRef = useRef(theme);
  const palRef = useRef<Palette>(PALETTES[theme]);
  const basemapRef = useRef<L.Layer | null>(null);
  const reThemeRef = useRef<(() => void)[]>([]); // legends and the rain layer redraw for the new palette
  const gaugeKeyRef = useRef('');
  const gaugesRef = useRef<IrrigationStation[]>(gauges);
  const publicLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const locationSelectRef = useRef(onLocationSelect);
  locationSelectRef.current = onLocationSelect;
  gaugesRef.current = gauges;
  const [basinError, setBasinError] = useState(false);
  const [evidenceKeyOpen, setEvidenceKeyOpen] = useState(false);
  const retryBasinsRef = useRef<(() => void) | null>(null);
  // Layers switched on automatically, once each, so a viewer who turns one off keeps it off.
  const eventLayersRef = useRef<L.Layer[]>([]);
  const autoOnRef = useRef({ event: false });
  const fresh = useGaugeFreshness(mode === 'technical' ? gauges : []);
  // Toolbar from 560 px; below that it would push the toolbar past one row, so it sits under the map.
  const freshNote = (where: string) => fresh && (
    <span
      className={`${where} w-fit whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-medium`}
      style={{ background: 'var(--fw-panel)', borderColor: 'var(--fw-panel-border)', color: fresh.old ? 'var(--fw-warn)' : 'var(--fw-panel-muted)' }}
    >
      {fresh.text}
    </span>
  );

  // --- one-time map init -------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const getPal = () => palRef.current;
    const map = L.map(containerRef.current, {
      center: [7.8731, 80.7718],
      zoom: 8,
      zoomControl: false,
      attributionControl: false,
      // The map sits in the page flow: wheel zoom only after a click or focus,
      // so scrolling the page is not trapped by the map.
      scrollWheelZoom: false,
      zoomSnap: 0.25, // lets fitBounds fill the box instead of rounding down a whole level
    });
    // Toolbar and legends live outside the canvas: extra control corners in the shell (Leaflet
    // removes corner elements on map.remove(), so they are children of the React-owned docks).
    const corners = (map as unknown as { _controlCorners: Record<string, HTMLElement> })._controlCorners;
    corners[DOCK_TOP] = L.DomUtil.create('div', 'fw-dock-slot', topDockRef.current!);
    corners[DOCK_LEGENDS] = L.DomUtil.create('div', 'fw-dock-slot fw-dock-legends', legendDockRef.current!);
    // The canvas resizes when a legend opens or closes.
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(containerRef.current);
    const wheelOn = () => map.scrollWheelZoom.enable();
    map.on('layeradd', ({ layer }) => {
      if (layer instanceof L.Path) layer.getElement()?.setAttribute('tabindex', '-1');
    });
    map.on('click focus', wheelOn);
    // A popup says more than a tooltip, and opening one pans the map under the cursor: no tooltips while it is open.
    map.on('popupopen', () => map.getContainer().classList.add('fw-popup-open'));
    // Leaflet's Escape only works with the map itself focused, not a marker.
    L.DomEvent.on(map.getContainer(), 'keydown', (e) => { if ((e as KeyboardEvent).key === 'Escape') map.closePopup(); });
    map.on('popupclose', () => {
      map.getContainer().classList.remove('fw-popup-open');
      map.eachLayer((l) => { l.closeTooltip(); });
    });
    // One tooltip at a time: a marker that moved or was redrawn under the cursor never sends mouseout.
    map.on('tooltipopen', ({ tooltip }) => map.eachLayer((l) => { if (l.getTooltip() !== tooltip) l.closeTooltip(); }));
    map.on('click', (event: L.LeafletMouseEvent) => {
      locationSelectRef.current?.({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    });
    map.on('mouseout blur', () => map.scrollWheelZoom.disable());
    // Fit the whole island whatever the box size.
    fitIsland(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    addFullscreenControl(map);
    L.control
      .attribution({ position: 'bottomright' })
      .addAttribution(
        'Rainfall: <a href="https://meteo.gov.lk">Sri Lanka DoM</a>' +
          ` &middot; ${GAUGE_CREDIT} &middot; ${BASIN_CREDIT}`,
      )
      .addTo(map);
    controlRef.current = L.control.layers(undefined, undefined, { position: 'topleft' }).addTo(map);
    addSatelliteOption(L, controlRef.current, 'Context — Satellite (Esri)');
    // Model context is deliberately optional and off by default.
    controlRef.current.addOverlay(createForecastLayer(map), 'Modelled — Rain forecast (Open-Meteo)');
    const rainNormal = createRainNormalLayer(map, getPal);
    reThemeRef.current.push(rainNormal.redraw);
    controlRef.current.addOverlay(rainNormal.layer, 'Modelled — Rainfall vs normal (ERA5)');
    addBulletinOverlays(map, controlRef.current, getPal, (f) => reThemeRef.current.push(f));
    // NBRO rain gauges (lib/rain24h.ts): on in technical mode. OSM hospitals/shelters (lib/facilities.ts): off by default.
    const rain24h = createRain24hLayer(map);
    const facilitiesLayer = createFacilitiesLayer(map, getPal);
    reThemeRef.current.push(facilitiesLayer.redraw);
    if (mode === 'technical') rain24h.addTo(map);
    controlRef.current.addOverlay(rain24h, 'Observed — Rain last 24 h (NBRO via RISE)');
    controlRef.current.addOverlay(facilitiesLayer.layer, 'Context — Hospitals &amp; shelters (OpenStreetMap)');
    // Copernicus GFM: flood water mapped from Sentinel-1 radar (sees through cloud), one global layer per day.
    // A satellite passes over a given spot only every few days, so show the union of the last 12 days.
    const day = (ago: number) => new Date(Date.now() - ago * 864e5).toISOString().slice(0, 10);
    map.createPane('fw-flood').style.zIndex = '250'; // above the land fill (210), below shapes and markers
    const floodExtent = L.tileLayer.wms('https://geoserver.gfm.eodc.eu/geoserver/gfm/wms', {
      layers: 'observed_flood_extent', format: 'image/png', transparent: true, opacity: 0.85, pane: 'fw-flood',
      time: `${day(12)}/${day(0)}`,
      attribution: 'Flood extent: <a href="https://global-flood.emergency.copernicus.eu/">Copernicus EMS GFM</a>',
    } as L.WMSOptions);
    controlRef.current.addOverlay(floodExtent, 'Observed — Satellite flood extent, last 12 days (Copernicus)');
    // NASA GIBS satellite tiles (no key, CORS). Each product publishes with a lag, so ask for a time it has.
    const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
    const gibs = (layer: string, time: string, level: number, opacity: number, attribution: string) =>
      L.tileLayer(`${GIBS}/${layer}/default/${time}/GoogleMapsCompatible_Level${level}/{z}/{y}/{x}.png`,
        { maxNativeZoom: level, opacity, pane: 'fw-flood', attribution });
    const halfHour = Math.floor((Date.now() - 7 * 36e5) / 18e5) * 18e5; // IMERG lands ~4-6 h after the fact
    controlRef.current.addOverlay(gibs('IMERG_Precipitation_Rate_30min', new Date(halfHour).toISOString().slice(0, 19) + 'Z', 6, 0.8,
      'Rain: <a href="https://gpm.nasa.gov/data/imerg">NASA GPM IMERG</a>'), 'Observed — Satellite rain rate, ~7 h ago (NASA)');
    controlRef.current.addOverlay(gibs('SMAP_L4_Analyzed_Root_Zone_Soil_Moisture', day(4), 6, 0.6,
      'Soil moisture: <a href="https://smap.jpl.nasa.gov/">NASA SMAP</a>'), 'Modelled — Soil wetness, 4 days ago (NASA SMAP)');
    // Himawari-9 infrared clouds (JMA, every 10 min): look up the newest image time when the layer is switched on.
    const clouds = L.layerGroup();
    clouds.on('add', () => {
      fetch('https://www.jma.go.jp/bosai/himawari/data/satimg/targetTimes_fd.json').then((r) => r.json())
        .then((t: { basetime: string; validtime: string }[]) => {
          const { basetime, validtime } = t[t.length - 1];
          clouds.clearLayers().addLayer(L.tileLayer(
            `https://www.jma.go.jp/bosai/himawari/data/satimg/${basetime}/fd/${validtime}/B13/TBB/{z}/{x}/{y}.jpg`,
            { maxNativeZoom: 5, opacity: 0.55, pane: 'fw-flood', attribution: 'Clouds: <a href="https://www.jma.go.jp/bosai/en_himawari/">JMA Himawari-9</a>' }));
        }).catch(() => {});
    });
    controlRef.current.addOverlay(clouds, 'Observed — Live clouds, infrared (JMA Himawari)');
    // GloFAS 100-year flood depth (JRC), static: where a 1-in-100-year river flood reaches.
    const hazard = L.tileLayer.wms('https://ows.globalfloods.eu/glofas-ows/ows.py', {
      layers: 'FloodHazard100y', format: 'image/png', transparent: true, opacity: 0.7, pane: 'fw-flood',
      attribution: 'Flood hazard: <a href="https://global-flood.emergency.copernicus.eu/">Copernicus GloFAS / JRC</a>',
    });
    controlRef.current.addOverlay(hazard, 'Context — 100-year flood zones (GloFAS)');
    eventLayersRef.current = [floodExtent, hazard]; // switched on when a gauge reaches minor flood (event mode)
    // On by default: draws nothing unless a storm is active near Sri Lanka.
    const cyclones = createCycloneLayer();
    controlRef.current.addOverlay(cyclones, 'Observed — Cyclones near Sri Lanka (GDACS)');
    if (mode === 'technical') cyclones.addTo(map);
    controlRef.current.addOverlay(createSeaLevelLayer(), 'Observed — Sea level, Colombo &amp; Trincomalee (IOC)');
    addViewControl(map, () => gaugesRef.current, () => themeRef.current,
      () => {
        themeRef.current = themeRef.current === 'dark' ? 'light' : 'dark';
        setTheme(themeRef.current);
      });
    createPlaceLabels(map).addTo(map);
    map.createPane(LAND_PANE).style.zIndex = '210';
    mapRef.current = map;
    // Basins + rivers: on by default; every basin outlined, flooding ones filled, with a legend.
    const loadBasins = () => {
      if (mapRef.current !== map) return;
      setBasinError(false);
      createWaterLayer(map, () => gaugesRef.current, getPal)
        .then(({ layer, restyle }) => {
          if (mapRef.current !== map) return;
          restyleWaterRef.current = restyle;
          const legend = createBasinLegend(getPal);
          reThemeRef.current.push(legend.render);
          layer.on('add', () => legend.control.addTo(map));
          layer.on('remove', () => legend.control.remove());
          layer.addTo(map);
          controlRef.current?.addOverlay(layer, 'Context — River basins &amp; rivers');
        })
        .catch((error) => {
          console.error('Failed to load river basins/rivers:', error);
          if (mapRef.current === map) setBasinError(true);
        });
    };
    retryBasinsRef.current = loadBasins;
    // Paint the base map before downloading optional context overlays.
    void addBasemap(map, 'light', basemapStyle(themeRef.current, getPal()))
      .then((layer) => { basemapRef.current = layer; })
      .finally(loadBasins);
    return () => {
      retryBasinsRef.current = null;
      resize.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    locationControlRef.current?.remove();
    locationControlRef.current = null;
    if (mode === 'public' && locationSelectRef.current) {
      locationControlRef.current = createLocationControl(map, (location) => locationSelectRef.current?.(location));
      locationControlRef.current.addTo(map);
    }
    return () => {
      locationControlRef.current?.remove();
      locationControlRef.current = null;
    };
  }, [mode]);

  // --- markers ----------------------------------------------------------
  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (mode !== 'technical') return;

    if (!mapRef.current.getPane(MET_PANE)) mapRef.current.createPane(MET_PANE).style.zIndex = '645';
    stations.forEach((s) => {
      const marker = L.marker([s.latitude, s.longitude], { icon: makeIcon(s), pane: MET_PANE });
      withOutlook(marker.bindPopup(buildPopupHtml(s), { className: 'met-station-popup', closeButton: true }), s.latitude, s.longitude);
      marker.on('click', () => onStationSelect(s));
      marker.addTo(mapRef.current!);
      marker.getElement()?.setAttribute('aria-label', `${s.name} rain station: ${s.rainfall_since_830am_mm ?? 0} mm since 08:30`);
      markersRef.current.push(marker);
    });
    const map = mapRef.current;
    // A gauge redraw fires one layeradd/layerremove per marker (~80 per zoom): place once after the burst,
    // as a microtask so it still runs before the badges and town names re-place in the next frame.
    let queued = false, live = true;
    const place = (e?: L.LeafletEvent) => {
      const pane = (e as L.LayerEvent | undefined)?.layer?.options?.pane;
      if (queued || !(!e || e.type === 'zoomend' || e.type === 'fw-drops-drawn' || pane === 'fw-gauges' || pane === 'fw-official-warn')) return;
      queued = true;
      queueMicrotask(() => { queued = false; if (live) placeDropTags(map); });
    };
    place();
    map.on('zoomend layeradd layerremove fw-drops-drawn', place);
    return () => { live = false; map.off('zoomend layeradd layerremove fw-drops-drawn', place); };
  }, [mode, stations, onStationSelect]);

  // --- river gauges (on by default) -------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const visibleGauges = mode === 'technical' ? gauges : [];
    const key = gaugesKey(visibleGauges);
    if (gaugeLayerRef.current && key === gaugeKeyRef.current) return;
    gaugeKeyRef.current = key;
    const wasOn = !gaugeLayerRef.current || map.hasLayer(gaugeLayerRef.current);
    if (gaugeLayerRef.current) {
      controlRef.current?.removeLayer(gaugeLayerRef.current);
      gaugeLayerRef.current.remove();
    }
    const { layer, render } = createGaugeLayer(map, visibleGauges, () => palRef.current);
    gaugeLayerRef.current = layer;
    renderGaugesRef.current = render;
    if (wasOn && mode === 'technical') layer.addTo(map);
    if (mode === 'technical') {
      controlRef.current?.addOverlay(layer, 'Observed — Measured river gauges');
    }
    restyleWaterRef.current?.();
    // Event mode: a gauge at minor flood or worse brings in where the water is and where it can spread.
    if (mode === 'technical' && !autoOnRef.current.event && visibleGauges.some((g) => g.status === 'minor' || g.status === 'major')) {
      autoOnRef.current.event = true;
      eventLayersRef.current.forEach((l) => l.addTo(map));
    }
  }, [mode, gauges]);

  // --- theme: panel tokens, basemap colours, then every layer redraws from the new palette ---
  useEffect(() => {
    const map = mapRef.current;
    const pal = PALETTES[theme];
    palRef.current = pal;
    themeRef.current = theme;
    saveTheme(theme);
    const el = shellRef.current;
    if (el) {
      Object.entries(cssVars(pal)).forEach(([k, v]) => el.style.setProperty(k, v));
      el.dataset.theme = theme;
    }
    if (!map) return;
    restyleWaterRef.current?.();
    renderGaugesRef.current?.();
    reThemeRef.current.forEach((f) => f());
    const old = basemapRef.current;
    if (!old) return; // first paint: the init effect adds the basemap
    void addBasemap(map, 'light', basemapStyle(theme, pal)).then((layer) => {
      if (!layer) return;
      old.remove();
      basemapRef.current = layer;
    });
  }, [theme]);

  // --- public selection, unverified OSM candidates, and candidate route ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    publicLayerRef.current?.remove();
    const layer = L.layerGroup();
    publicLayerRef.current = layer;
    if (mode !== 'public') return;
    if (selectedLocation) {
      L.circleMarker([selectedLocation.latitude, selectedLocation.longitude], {
        radius: 9, color: '#0f172a', weight: 3, fillColor: '#38bdf8', fillOpacity: 1,
      }).bindTooltip('Selected location').addTo(layer);
    }
    facilities.forEach((facility) => {
      const name = escapeHtml(facility.name);
      const label = escapeHtml(facility.label);
      L.circleMarker([facility.lat, facility.lon], {
        radius: 8, color: '#78350f', weight: 2, fillColor: '#fbbf24', fillOpacity: 0.95,
      })
        .bindPopup(`<strong>${name}</strong><br>${label}<br><em>Unverified OpenStreetMap candidate</em>`)
        .addTo(layer);
    });
    layer.addTo(map);
    if (selectedLocation) map.setView([selectedLocation.latitude, selectedLocation.longitude], 12, { animate: !prefersReducedMotion() });
  }, [mode, selectedLocation, facilities]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    routeLayerRef.current?.remove();
    routeLayerRef.current = null;
    if (mode !== 'public' || !route?.polyline?.length) return;
    const line = L.polyline(route.polyline.map((point) => [point.latitude, point.longitude]), {
      color: '#0284c7', weight: 6, opacity: 0.9,
    }).addTo(map);
    routeLayerRef.current = line;
    map.fitBounds(line.getBounds(), { padding: [32, 32], animate: !prefersReducedMotion() });
  }, [mode, route]);

  // --- zoom to a gauge picked in "Rivers to watch" ------------------------
  useEffect(() => {
    const map = mapRef.current;
    const g = focusGauge?.g;
    if (!map || !g || g.lat == null || g.lon == null) return;
    const animate = !prefersReducedMotion();
    // Gauge markers are rebuilt per zoom (basin groups below zoom 9), so the popup is opened once the view settles.
    map.once('moveend', () => requestAnimationFrame(() => {
      const layer = gaugeLayerRef.current;
      if (!layer || !map.hasLayer(layer)) return; // gauges switched off: the zoom alone shows where it is
      layer.eachLayer((m) => { if ((m as L.Marker).options.title?.startsWith(`${g.station} river gauge`)) m.openPopup(); });
    }));
    map.setView([g.lat, g.lon], Math.max(map.getZoom(), 11), { animate, duration: animate ? 0.5 : 0 });
    map.getContainer().scrollIntoView({ block: 'nearest', behavior: animate ? 'smooth' : 'auto' });
  }, [focusGauge]);

  // --- pan to selected station ------------------------------------------
  useEffect(() => {
    if (!mapRef.current || selectedWmoId === null) return;
    const s = stations.find((x) => x.wmo_id === selectedWmoId);
    if (s) {
      const animate = !prefersReducedMotion();
      mapRef.current.setView([s.latitude, s.longitude], 10, { animate, duration: animate ? 0.5 : 0 });
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
        .fw-fullscreen {
          font-size: 18px;
          text-align: center;
        }
        .fw-use-centre {
          min-width: 44px;
          min-height: 44px;
          padding: 0 12px;
          font: 600 12px/1.2 -apple-system, system-ui, sans-serif;
          color: #0f172a;
          white-space: nowrap;
        }
      `}</style>
      <div ref={shellRef} className="fw-map fw-map-shell flex flex-col">
        <div className="fw-dock fw-dock-top" role="group" aria-label="Map controls">
          <div ref={topDockRef} className="contents" />
          {freshNote('ml-auto hidden min-[560px]:inline min-[560px]:[&+button]:ml-0')}
          <button
            type="button"
            className="focus-ring fw-dock-btn ml-auto flex shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-950/95 px-3 text-xs font-semibold text-slate-100 shadow-lg hover:bg-slate-800"
            aria-label={evidenceKeyOpen ? 'Hide evidence key' : 'Show evidence key'}
            aria-expanded={evidenceKeyOpen}
            aria-controls={evidenceKeyOpen ? 'map-evidence-key' : undefined}
            onClick={() => setEvidenceKeyOpen((open) => !open)}
          >
            {evidenceKeyOpen ? 'Hide key' : 'Key'}
          </button>
        </div>
        {/* The canvas keeps the full map height; toolbar and legends add to the card instead of eating into it. */}
        <div className={`relative ${mode === 'public' ? 'h-[55vh] min-h-[420px] lg:h-[calc(100dvh-13rem)]' : 'h-[max(420px,60vh)] lg:h-[max(500px,calc(100dvh-12rem))]'}`}>
          <div
            ref={containerRef}
            className="h-full w-full"
            role="region"
            aria-label={mode === 'public'
              ? 'Interactive flood map. Use arrow keys to pan, plus or minus to zoom, and the Use map centre button to select the current centre.'
              : 'Interactive flood map. Use arrow keys to pan and plus or minus to zoom.'}
          />
          {evidenceKeyOpen && (
            <div id="map-evidence-key" className="absolute right-3 top-3 z-[1000] w-72 max-w-[calc(100%-1.5rem)] rounded-xl border border-slate-600 bg-slate-950/95 p-3 shadow-xl backdrop-blur-sm">
              <h2 className="text-sm font-semibold">Evidence on this map</h2>
              <p className="mt-1 text-xs leading-5 text-slate-300">Category shows how much confidence to place in each layer.</p>
              <dl className="mt-2 space-y-2 text-xs leading-4">
                <div>
                  <dt className="font-semibold text-sky-200">Observed <span className="font-normal text-slate-300">— {mode === 'technical' ? 'available now' : 'technical mode only'}</span></dt>
                  <dd className="text-slate-300">Rainfall and river gauges are direct measurements, but reports may be delayed.</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-200">Detected <span className="font-normal text-slate-400">— unavailable</span></dt>
                  <dd className="text-slate-400">Satellite flood extent is not operational; no detected-flood layer is shown.</dd>
                </div>
                <div>
                  <dt className="font-semibold text-violet-200">Modelled <span className="font-normal text-slate-300">— optional layers</span></dt>
                  <dd className="text-slate-300">Open-Meteo forecast and ERA5 rainfall-vs-normal are estimates, not observations.</dd>
                </div>
                <div>
                  <dt className="font-semibold text-emerald-200">Context <span className="font-normal text-slate-300">— available now</span></dt>
                  <dd className="text-slate-300">Base map, rivers and basins provide reference geography, not proof of flooding.</dd>
                </div>
                <div>
                  <dt className="font-semibold text-amber-200">Planning <span className="font-normal text-slate-300">— {mode === 'public' ? 'shown when available' : 'public mode only'}</span></dt>
                  <dd className="text-slate-300">Selected places, unverified candidate facilities and candidate routes support decisions; verify locally.</dd>
                </div>
              </dl>
            </div>
          )}
          {basinError && (
            <div className="absolute inset-x-3 top-3 z-[1000] flex items-center justify-between gap-3 rounded-lg border border-amber-600 bg-amber-950/95 p-3 text-sm text-amber-100" role="status">
              <span>River basin overlay is temporarily unavailable. The base map is still usable.</span>
              <button type="button" onClick={() => retryBasinsRef.current?.()} className="focus-ring min-h-[44px] shrink-0 rounded-lg border border-amber-500 px-3 font-semibold hover:bg-amber-900">Retry overlay</button>
            </div>
          )}
        </div>
        <div ref={legendDockRef} className="fw-dock fw-dock-bottom" role="group" aria-label="Map legends" />
        {freshNote('mx-2 mb-2 block min-[560px]:hidden')}
      </div>
    </>
  );
}
