// SPDX-License-Identifier: Apache-2.0

// Shared Leaflet layers for Irrigation Dept river gauges and river basins
// (used by MetStationsMap on the home page).
// Leaflet popups are HTML strings, so the 7-day chart is a small inline SVG
// rather than one of the React chart components.

import L from 'leaflet';
import { api, GaugeReading, GaugeStatus, IrrigationStation } from '@/lib/api';
import { BASIN_CREDIT, GAUGE_CREDIT, STATUS_COLOR, STATUS_LABEL, STATUS_TEXT, colomboTime, trendArrow, worstStatus } from '@/lib/gaugeStatus';
import { COLORS } from '@/lib/mapColors';

export { BASIN_CREDIT, GAUGE_CREDIT };

// Upstream strings go into popup HTML; escape them.
const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const m = (v: number | null) => (v === null || v === undefined ? '&mdash;' : `${v.toFixed(2)} m`);

// Severity is coded by shape and size as well as colour, so it survives colour blindness and
// greyscale: dot (normal / no threshold) → diamond (alert) → triangle (minor) → bigger pulsing
// triangle (major). The trend glyph only fits, and only matters at a glance, from alert upwards.
const SIZE: Record<GaugeStatus, number> = { unknown: 7, normal: 7, alert: 14, minor: 16, major: 18 };
const SHOWS_TREND: GaugeStatus[] = ['alert', 'minor', 'major'];

function shape(status: GaugeStatus, s: number): string {
  if (status === 'alert') return `<polygon points="${s / 2},1 ${s - 1},${s / 2} ${s / 2},${s - 1} 1,${s / 2}"/>`;
  if (status === 'minor' || status === 'major') return `<polygon points="${s / 2},1 ${s - 1},${s - 1} 1,${s - 1}"/>`;
  return `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2 - 0.75}"/>`;
}

function gaugeIcon(g: IrrigationStation): L.DivIcon {
  const size = SIZE[g.status];
  const hit = 24; // small markers keep a 24 px tap target
  const tri = g.status === 'minor' || g.status === 'major';
  return L.divIcon({
    className: `fw-gauge-wrap fw-gauge-${g.status}${g.stale ? ' fw-gauge-stale' : ''}`,
    html: `${g.status === 'major' ? `<span class="fw-gauge-pulse" style="border-color:${COLORS.status.major}" aria-hidden="true"></span>` : ''}<svg class="fw-gauge" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
      fill="${STATUS_COLOR[g.status]}" stroke="${COLORS.outline}" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">${shape(g.status, size)}</svg>${
      SHOWS_TREND.includes(g.status) && g.trend ? `<span class="fw-gauge-trend${tri ? ' fw-gauge-trend-tri' : ''}" aria-hidden="true">${trendArrow(g.trend)}</span>` : ''}`,
    iconSize: [hit, hit],
    iconAnchor: [hit / 2, hit / 2],
  });
}

function gaugePopup(g: IrrigationStation): string {
  const c = STATUS_COLOR[g.status];
  return `
    <div class="fw-gauge-popup">
      <div style="font-weight:700;font-size:14px">${esc(g.station)}</div>
      <div style="color:#6b7280;font-size:11px;margin-bottom:6px">${esc(g.basin ?? g.river)}</div>
      <span style="background:${c};color:${STATUS_TEXT[g.status]};padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700">${STATUS_LABEL[g.status]}</span>
      ${g.trend ? `<span style="margin-left:6px;font-size:11px;color:#374151">${trendArrow(g.trend)} ${g.trend}</span>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-size:11px;margin-top:8px">
        <div style="color:#6b7280">Level</div><div style="font-weight:700"><span style="color:${c}" aria-hidden="true">&#9679;</span> ${m(g.water_level_m)}</div>
        <div style="color:#6b7280">Alert</div><div>${m(g.alert_level_m)}</div>
        <div style="color:#6b7280">Minor flood</div><div>${m(g.minor_flood_level_m)}</div>
        <div style="color:#6b7280">Major flood</div><div>${m(g.major_flood_level_m)}</div>
      </div>
      <div style="font-size:10px;color:#6b7280;margin-top:6px">Reading: ${colomboTime(g.observed_at)} (Colombo)</div>
      ${g.stale ? '<div style="font-size:10px;color:#b91c1c;font-weight:700">Stale: no reading for over 6 hours</div>' : ''}
      <div class="fw-gauge-chart" style="margin-top:6px;font-size:10px;color:#9ca3af">Loading 7-day levels&hellip;</div>
      <div style="font-size:9px;color:#9ca3af;margin-top:4px">${GAUGE_CREDIT}</div>
    </div>`;
}

// 7-day level sparkline with dashed threshold lines.
export function sparkline(readings: GaugeReading[], g: IrrigationStation, w = 220, h = 60): string {
  const pts = readings.filter((r) => r.level_m !== null).map((r) => [Date.parse(r.observed_at), r.level_m as number]);
  if (pts.length < 2) return 'No 7-day history yet';
  const lines = ([['alert', g.alert_level_m], ['minor', g.minor_flood_level_m], ['major', g.major_flood_level_m]] as const)
    .filter(([, v]) => v !== null) as [GaugeStatus, number][];
  const ys = [...pts.map((p) => p[1]), ...lines.map(([, v]) => v)];
  const [x0, x1] = [pts[0][0], pts[pts.length - 1][0]];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => ((x - x0) / (x1 - x0 || 1)) * w;
  const sy = (y: number) => h - 4 - ((y - y0) / (y1 - y0 || 1)) * (h - 8);
  const path = pts.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ');
  const th = lines
    .map(([k, v]) => `<line x1="0" x2="${w}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}" stroke="${STATUS_COLOR[k]}" stroke-dasharray="3 3" stroke-width="1"/>`)
    .join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="7-day water level">
    ${th}<polyline points="${path}" fill="none" stroke="#2563eb" stroke-width="1.5"/></svg>
    <div style="display:flex;justify-content:space-between;color:#6b7280">
      <span>${colomboTime(readings[0].observed_at)}</span><span>${y0.toFixed(2)}&ndash;${y1.toFixed(2)} m</span></div>`;
}

// Changes only when a reading, status or stale flag changes; used to skip
// rebuilding markers (which would close an open popup) on identical polls.
export const gaugesKey = (gauges: IrrigationStation[]) =>
  gauges.map((g) => `${g.station}|${g.observed_at}|${g.status}|${g.stale}`).join(';');

export function createGaugeLayer(gauges: IrrigationStation[], onSelect?: (g: IrrigationStation) => void): L.LayerGroup {
  const group = L.layerGroup();
  gauges.forEach((g) => {
    if (g.lat === null || g.lon === null) return;
    const label = `${g.station} river gauge: ${STATUS_LABEL[g.status].toLowerCase()}${g.trend ? `, ${g.trend}` : ''}${g.water_level_m !== null ? `, ${g.water_level_m.toFixed(2)} m` : ''}${g.stale ? ', stale' : ''}`;
    // Worse status draws on top where markers overlap.
    const marker = L.marker([g.lat, g.lon], { icon: gaugeIcon(g), zIndexOffset: 1000 + SIZE[g.status] * 10, title: label });
    marker.bindTooltip(`<b>${esc(g.station)}</b> ${m(g.water_level_m)} ${trendArrow(g.trend)}`, {
      direction: 'right', offset: [SIZE[g.status] / 2, 0], className: 'fw-gauge-tip',
    });
    marker.bindPopup(gaugePopup(g), { className: 'fw-light-popup', maxWidth: 260 });
    marker.on('popupopen', (e) => {
      const el = (e as L.PopupEvent).popup.getElement()?.querySelector('.fw-gauge-chart');
      if (!el) return;
      api.getGaugeHistory(g.station)
        .then((rows) => { el.innerHTML = sparkline(Array.isArray(rows) ? rows : [], g); })
        .catch(() => { el.textContent = '7-day history unavailable'; });
    });
    if (onSelect) marker.on('click', () => onSelect(g));
    marker.addTo(group);
  });
  return group;
}

let basinsPromise: Promise<GeoJSON.FeatureCollection> | null = null;
export function loadBasins(): Promise<GeoJSON.FeatureCollection> {
  basinsPromise ??= fetch('/data/river_basins.geojson').then((r) => {
    if (!r.ok) throw new Error(`basins ${r.status}`);
    return r.json();
  });
  return basinsPromise;
}

/**
 * How basins are filled by the worst current gauge status inside them:
 *  - 'alertsOnly' (home map default): only alert/minor/major basins are filled, a
 *                 little stronger; normal/unknown/ungauged basins are thin grey outlines.
 *  - 'always'     ("Colour all basins" switch): every gauged basin gets its status colour.
 */
export type BasinFillMode = 'always' | 'alertsOnly';
const FLOODING: GaugeStatus[] = ['alert', 'minor', 'major'];

// `getGauges` is read at style/popup time so the layer follows data refreshes via setStyle().
// Fill and stroke get heavier with severity; major adds a 45° hatch so it stays the most
// prominent thing on the map in greyscale too.
const HATCH_ID = 'fw-hatch-major';
const BASIN_STYLE: Partial<Record<GaugeStatus, L.PathOptions>> = {
  alert: { color: COLORS.status.alert, weight: 1.5, opacity: 1, fillColor: COLORS.status.alert, fillOpacity: 0.25 },
  minor: { color: COLORS.status.minor, weight: 2, opacity: 1, fillColor: COLORS.status.minor, fillOpacity: 0.35 },
  // The pattern carries the 0.50 fill plus 0.35 stripes, so the path itself draws it opaque.
  major: { color: COLORS.status.major, weight: 3, opacity: 1, fillColor: `url(#${HATCH_ID})`, fillOpacity: 1 },
};

// fill="url(#id)" resolves against any SVG in the document, so one hidden <defs> serves every renderer.
function ensureHatch() {
  if (document.getElementById(HATCH_ID)) return;
  const c = COLORS.status.major;
  document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <pattern id="${HATCH_ID}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="8" height="8" fill="${c}" fill-opacity="0.5"/><rect width="3" height="8" fill="${c}" fill-opacity="0.35"/>
    </pattern></defs></svg>`);
}

export function createBasinLayer(
  data: GeoJSON.FeatureCollection,
  getGauges: () => IrrigationStation[],
  getFillMode: () => BasinFillMode,
): L.GeoJSON {
  ensureHatch();
  const inside = (f?: GeoJSON.Feature) => {
    const names: string[] = f?.properties?.gauges ?? [];
    return getGauges().filter((g) => names.includes(g.station));
  };
  const style = (f?: GeoJSON.Feature): L.PathOptions => {
    const worst = worstStatus(inside(f));
    const flood = worst && BASIN_STYLE[worst];
    if (flood) return flood;
    if (getFillMode() === 'always' && worst) {
      // "Colour all basins" opt-in: normal / no-threshold basins get a faint tint of their gauge colour.
      return { color: STATUS_COLOR[worst], weight: 1, opacity: 0.6, fillColor: STATUS_COLOR[worst], fillOpacity: 0.12 };
    }
    // fillOpacity 0 keeps the area clickable
    return { color: COLORS.basinIdle, weight: 1, opacity: 0.6, fillOpacity: 0, dashArray: getFillMode() === 'always' ? '4 3' : undefined };
  };
  return L.geoJSON(data, {
    style,
    onEachFeature: (f, layer) => {
      layer.bindPopup(() => {
        const p = f.properties ?? {};
        const rows = inside(f)
          .map((g) => `<tr><td>${esc(g.station)}</td><td style="font-weight:700"><span style="color:${STATUS_COLOR[g.status]}" aria-hidden="true">&#9679;</span> ${m(g.water_level_m)} <span style="font-weight:400;font-size:10px">${STATUS_LABEL[g.status].toLowerCase()}</span></td>
            <td>${trendArrow(g.trend)}${g.stale ? ' <span style="color:#b91c1c">stale</span>' : ''}</td></tr>`)
          .join('');
        return `<div class="fw-gauge-popup">
          <div style="font-weight:700;font-size:14px">${p.name === 'unnamed' ? 'Unnamed basin' : esc(p.name)}</div>
          <div style="color:#6b7280;font-size:11px">${Number(p.area_km2).toLocaleString()} km&sup2;</div>
          ${rows ? `<table style="font-size:11px;margin-top:6px;border-spacing:8px 2px">${rows}</table>`
                 : '<div style="font-size:11px;color:#6b7280;margin-top:6px">No river gauge in this basin</div>'}
          <div style="font-size:9px;color:#9ca3af;margin-top:4px">${BASIN_CREDIT}</div></div>`;
      }, { className: 'fw-light-popup', maxWidth: 260 });
      layer.on('add', () => {
        if (layer instanceof L.Path) layer.getElement()?.setAttribute('tabindex', '-1');
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Rivers (HOT OSM via HDX) - context only, so muted and drawn under the basin fills
// ---------------------------------------------------------------------------

const RIVER_PANE = 'fw-rivers'; // z 350: above the basemap (200), below overlayPane (basins, 400)
const LABEL_MIN_ZOOM = 11;

let riversPromise: Promise<GeoJSON.FeatureCollection> | null = null;
function loadRivers(): Promise<GeoJSON.FeatureCollection> {
  riversPromise ??= fetch('/data/rivers.geojson').then((r) => {
    if (!r.ok) throw new Error(`rivers ${r.status}`);
    return r.json();
  });
  return riversPromise;
}

function riverLabel(f: GeoJSON.Feature): string {
  const p = f.properties ?? {};
  return [p.name, p['name:si'], p['name:ta']].filter(Boolean).map(esc).join(' &middot; ');
}

// Midpoint of the longest part, for the zoomed-in name label.
function labelPoint(geom: GeoJSON.MultiLineString): L.LatLngExpression | null {
  const longest = geom.coordinates.reduce((a, b) => (b.length > a.length ? b : a), [] as number[][]);
  const mid = longest[Math.floor(longest.length / 2)];
  return mid ? [mid[1], mid[0]] : null;
}

function createRiverLayer(map: L.Map, data: GeoJSON.FeatureCollection) {
  if (!map.getPane(RIVER_PANE)) map.createPane(RIVER_PANE).style.zIndex = '350';
  // Flood status lives on the basin fill above; rivers stay one muted colour. Named = main river.
  const style = (f?: GeoJSON.Feature): L.PathOptions => ({
    pane: RIVER_PANE,
    color: COLORS.river,
    weight: f?.properties?.name ? 1.5 : 1,
    opacity: 0.55,
  });
  const lines = L.geoJSON(data, {
    pane: RIVER_PANE,
    style,
    onEachFeature: (f, layer) => {
      if (f.properties?.name) layer.bindTooltip(riverLabel(f), { sticky: true, className: 'fw-river-tip' });
    },
  });
  const labels = L.layerGroup(
    data.features
      .filter((f) => f.properties?.name && f.geometry.type === 'MultiLineString')
      .map((f) => {
        const at = labelPoint(f.geometry as GeoJSON.MultiLineString);
        // Default marker pane, so the names stay readable over basin fills.
        return at && L.marker(at, {
          interactive: false,
          icon: L.divIcon({ className: 'fw-river-label', html: esc(f.properties?.name), iconSize: undefined }),
        });
      })
      .filter((m): m is L.Marker => !!m),
  );
  const group = L.layerGroup([lines]);
  const syncLabels = () => {
    if (map.hasLayer(group) && map.getZoom() >= LABEL_MIN_ZOOM) group.addLayer(labels);
    else group.removeLayer(labels);
  };
  group.on('add', () => { map.on('zoomend', syncLabels); syncLabels(); });
  group.on('remove', () => map.off('zoomend', syncLabels));
  return group;
}

// Basins + rivers as one switchable overlay. restyle() re-applies gauge status colours to basins.
export async function createWaterLayer(
  map: L.Map,
  getGauges: () => IrrigationStation[],
  fillMode: BasinFillMode = 'alertsOnly',
) {
  const [basinData, riverData] = await Promise.all([loadBasins(), loadRivers()]);
  const basins = createBasinLayer(basinData, getGauges, () => fillMode);
  return {
    layer: L.layerGroup([basins, createRiverLayer(map, riverData)]),
    restyle: () => basins.resetStyle(),
    setFillMode: (mode: BasinFillMode) => {
      fillMode = mode;
      basins.resetStyle();
    },
  };
}

/** Legend for 'alertsOnly' basins; collapsed by default on narrow screens. */
export function createBasinLegend(): L.Control {
  // On phones the map credits span the bottom edge and would cover it, so it goes top-left, closed.
  const wide = window.innerWidth >= 640;
  const legend = new L.Control({ position: wide ? 'bottomleft' : 'topleft' });
  legend.onAdd = () => {
    const el = L.DomUtil.create('details', 'fw-basin-legend');
    if (wide) el.setAttribute('open', '');
    // Per status: the gauge marker shape, then the basin fill it produces (none for normal).
    const row = (s: GaugeStatus) => {
      const b = BASIN_STYLE[s];
      const fill = b ? `background:${b.fillColor === `url(#${HATCH_ID})` ? `repeating-linear-gradient(45deg, ${COLORS.status.major} 0 3px, color-mix(in srgb, ${COLORS.status.major} 60%, transparent) 3px 8px)` : `color-mix(in srgb, ${b.fillColor} ${(b.fillOpacity ?? 0) * 100}%, transparent)`};border:${b.weight}px solid ${b.color}` : 'border:1px dashed transparent';
      return `<div><b aria-hidden="true"><svg width="${SIZE[s]}" height="${SIZE[s]}" viewBox="0 0 ${SIZE[s]} ${SIZE[s]}" fill="${STATUS_COLOR[s]}" stroke="${COLORS.outline}" stroke-width="1.5">${shape(s, SIZE[s])}</svg></b>` +
        `<i style="${fill}" aria-hidden="true"></i>${STATUS_LABEL[s].charAt(0)}${STATUS_LABEL[s].slice(1).toLowerCase()}</div>`;
    };
    el.innerHTML = `<summary>River gauge status (marker · basin)</summary>` +
      (['major', 'minor', 'alert', 'normal', 'unknown'] as GaugeStatus[]).map(row).join('') +
      `<p>Basin = highest gauge status inside it · ↑ rising ↓ falling → steady · faded = stale</p>`;
    L.DomEvent.disableClickPropagation(el);
    return el;
  };
  return legend;
}
