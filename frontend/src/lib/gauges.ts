// SPDX-License-Identifier: Apache-2.0

// Shared Leaflet layers for Irrigation Dept river gauges and river basins
// (used by RiversMap on /rivers and MetStationsMap on the home page).
// Leaflet popups are HTML strings, so the 7-day chart is a small inline SVG
// rather than one of the React chart components.

import L from 'leaflet';
import { api, GaugeReading, GaugeStatus, IrrigationStation } from '@/lib/api';
import { BASIN_CREDIT, GAUGE_CREDIT, STATUS_COLOR, STATUS_LABEL, colomboTime, trendArrow, worstStatus } from '@/lib/gaugeStatus';

export { BASIN_CREDIT, GAUGE_CREDIT };

// Upstream strings go into popup HTML; escape them.
const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const m = (v: number | null) => (v === null || v === undefined ? '&mdash;' : `${v.toFixed(2)} m`);

function gaugeIcon(g: IrrigationStation): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="fw-gauge${g.stale ? ' fw-gauge-stale' : ''}" style="background:${STATUS_COLOR[g.status]}"
      title="${esc(g.station)}${g.stale ? ' (stale)' : ''}">${trendArrow(g.trend)}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function gaugePopup(g: IrrigationStation): string {
  const c = STATUS_COLOR[g.status];
  return `
    <div class="fw-gauge-popup">
      <div style="font-weight:700;font-size:14px">${esc(g.station)}</div>
      <div style="color:#6b7280;font-size:11px;margin-bottom:6px">${esc(g.basin ?? g.river)}</div>
      <span style="background:${c};color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700">${STATUS_LABEL[g.status]}</span>
      ${g.trend ? `<span style="margin-left:6px;font-size:11px;color:#374151">${trendArrow(g.trend)} ${g.trend}</span>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-size:11px;margin-top:8px">
        <div style="color:#6b7280">Level</div><div style="font-weight:700;color:${c}">${m(g.water_level_m)}</div>
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
    const marker = L.marker([g.lat, g.lon], { icon: gaugeIcon(g), zIndexOffset: 1000 });
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
 *  - 'always'     (/rivers): every gauged basin is filled with its status colour.
 *  - 'alertsOnly' (home map): only alert/minor/major basins are filled, a little
 *                 stronger; normal/unknown/ungauged basins are thin grey outlines.
 */
export type BasinFillMode = 'always' | 'alertsOnly';
const FLOODING: GaugeStatus[] = ['alert', 'minor', 'major'];

// `getGauges` is read at style/popup time so the layer follows data refreshes via setStyle().
export function createBasinLayer(
  data: GeoJSON.FeatureCollection,
  getGauges: () => IrrigationStation[],
  fillMode: BasinFillMode = 'always',
): L.GeoJSON {
  const inside = (f?: GeoJSON.Feature) => {
    const names: string[] = f?.properties?.gauges ?? [];
    return getGauges().filter((g) => names.includes(g.station));
  };
  const style = (f?: GeoJSON.Feature): L.PathOptions => {
    const worst = worstStatus(inside(f));
    if (fillMode === 'alertsOnly') {
      return worst && FLOODING.includes(worst)
        ? { color: STATUS_COLOR[worst], weight: 2, opacity: 0.9, fillColor: STATUS_COLOR[worst], fillOpacity: 0.35 }
        : { color: '#64748b', weight: 1, opacity: 0.6, fillOpacity: 0 }; // fillOpacity 0 keeps the area clickable
    }
    return worst
      ? { color: STATUS_COLOR[worst], weight: 1.5, fillColor: STATUS_COLOR[worst], fillOpacity: 0.22 }
      : { color: '#64748b', weight: 1, fillOpacity: 0, dashArray: '4 3' };
  };
  return L.geoJSON(data, {
    style,
    onEachFeature: (f, layer) => {
      layer.bindPopup(() => {
        const p = f.properties ?? {};
        const rows = inside(f)
          .map((g) => `<tr><td>${esc(g.station)}</td><td style="color:${STATUS_COLOR[g.status]};font-weight:700">${m(g.water_level_m)}</td>
            <td>${trendArrow(g.trend)}${g.stale ? ' <span style="color:#b91c1c">stale</span>' : ''}</td></tr>`)
          .join('');
        return `<div class="fw-gauge-popup">
          <div style="font-weight:700;font-size:14px">${p.name === 'unnamed' ? 'Unnamed basin' : esc(p.name)}</div>
          <div style="color:#6b7280;font-size:11px">${Number(p.area_km2).toLocaleString()} km&sup2;</div>
          ${rows ? `<table style="font-size:11px;margin-top:6px;border-spacing:8px 2px">${rows}</table>`
                 : '<div style="font-size:11px;color:#6b7280;margin-top:6px">No river gauge in this basin</div>'}
          <div style="font-size:9px;color:#9ca3af;margin-top:4px">${BASIN_CREDIT}</div></div>`;
      }, { className: 'fw-light-popup', maxWidth: 260 });
    },
  });
}

// ---------------------------------------------------------------------------
// Rivers (HOT OSM via HDX) - drawn above basin fills, below gauge markers
// ---------------------------------------------------------------------------

export const RIVER_COLOR = '#2563eb';
const RIVER_PANE = 'fw-rivers'; // z 450: above overlayPane (basins, 400), below markerPane (600)
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

function createRiverLayer(
  map: L.Map,
  data: GeoJSON.FeatureCollection,
  basinGauges: Map<number, string[]>,
  getGauges: () => IrrigationStation[],
) {
  if (!map.getPane(RIVER_PANE)) map.createPane(RIVER_PANE).style.zIndex = '450';
  // A river takes the worst alert-or-higher status of the gauges in its basin_ids, which
  // scripts/build_rivers.py sets only on a strict name match AND a line that enters the
  // basin polygon. No name or geometry matching happens here; otherwise plain blue.
  const style = (f?: GeoJSON.Feature): L.PathOptions => {
    const names = new Set(((f?.properties?.basin_ids ?? []) as number[]).flatMap((id) => basinGauges.get(id) ?? []));
    const worst = names.size ? worstStatus(getGauges().filter((g) => names.has(g.station))) : null;
    const flagged = worst === 'alert' || worst === 'minor' || worst === 'major';
    return {
      pane: RIVER_PANE,
      color: flagged ? STATUS_COLOR[worst] : RIVER_COLOR,
      weight: flagged ? 2.5 : f?.properties?.name ? 1.5 : 1,
      opacity: f?.properties?.name ? 0.85 : 0.55,
    };
  };
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
        return at && L.marker(at, {
          pane: RIVER_PANE,
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
  return { group, lines, style };
}

// Basins + rivers as one switchable overlay. restyle() re-applies gauge status colours.
export async function createWaterLayer(
  map: L.Map,
  getGauges: () => IrrigationStation[],
  fillMode: BasinFillMode = 'always',
) {
  const [basinData, riverData] = await Promise.all([loadBasins(), loadRivers()]);
  const basins = createBasinLayer(basinData, getGauges, fillMode);
  const basinGauges = new Map<number, string[]>(
    basinData.features.map((f) => [f.properties?.id as number, (f.properties?.gauges ?? []) as string[]]),
  );
  const rivers = createRiverLayer(map, riverData, basinGauges, getGauges);
  return {
    layer: L.layerGroup([basins, rivers.group]),
    restyle: () => {
      basins.resetStyle();
      rivers.lines.setStyle(rivers.style as L.StyleFunction);
    },
  };
}

/** Legend for 'alertsOnly' basins; collapsed by default on narrow screens. */
export function createBasinLegend(): L.Control {
  const legend = new L.Control({ position: 'bottomleft' });
  legend.onAdd = () => {
    const el = L.DomUtil.create('details', 'fw-basin-legend');
    if (window.innerWidth >= 640) el.setAttribute('open', '');
    el.innerHTML = `<summary>Basin colour = highest river gauge status</summary>` +
      FLOODING.map((s) => `<div><span style="background:${STATUS_COLOR[s]}"></span>${STATUS_LABEL[s].charAt(0)}${STATUS_LABEL[s].slice(1).toLowerCase()}</div>`).join('');
    L.DomEvent.disableClickPropagation(el);
    return el;
  };
  return legend;
}
