// SPDX-License-Identifier: Apache-2.0

// Shared Leaflet layers for Irrigation Dept river gauges, river basins and rivers
// (used by MetStationsMap on the home page). Colours come from the theme palette
// (lib/mapPalette.ts) through a getter, so a theme switch only needs a restyle/render.
// Leaflet popups are HTML strings, so the 7-day chart is a small inline SVG
// rather than one of the React chart components.

import L from 'leaflet';
import { api, GaugeReading, GaugeStatus, IrrigationStation } from '@/lib/api';
import { BASIN_CREDIT, GAUGE_CREDIT, LEVEL_NAME, STATUS_COLOR, STATUS_LABEL, STATUS_TEXT, aboutHours, colomboTime, trendArrow, worstStatus } from '@/lib/gaugeStatus';
import { MARKER_RING, PALETTES, type FloodKey, type Palette, type StatusKey } from '@/lib/mapPalette';
import { fillFlowOutlook } from '@/lib/flowOutlook';

export { BASIN_CREDIT, GAUGE_CREDIT };

// Upstream strings go into popup HTML; escape them.
const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const m = (v: number | null) => (v === null || v === undefined ? '&mdash;' : `${v.toFixed(2)} m`);

const KEY: Record<GaugeStatus, StatusKey> = { normal: 'normal', unknown: 'none', alert: 'alert', minor: 'minor', major: 'major' };
const FLOODING: GaugeStatus[] = ['alert', 'minor', 'major'];
const isFlooding = (s: GaugeStatus | null): s is FloodKey => !!s && FLOODING.includes(s);
const RANK: Record<GaugeStatus, number> = { unknown: 0, normal: 1, alert: 2, minor: 3, major: 4 };
const statusText = (s: GaugeStatus) => STATUS_LABEL[s].charAt(0) + STATUS_LABEL[s].slice(1).toLowerCase();

// Severity is coded by shape and size as well as colour, so it survives colour blindness and
// greyscale: dot → diamond (alert) → triangle (minor) → bigger triangle with a pulse (major).
const SIZE: Record<GaugeStatus, number> = { unknown: 6, normal: 8, alert: 10, minor: 11, major: 13 };
const GROUP_ZOOM = 9; // below this, gauges in a flooding basin collapse into one marker per basin

// Flood shapes get a 2 px white ring outside their dark stroke, so they stay separate on basin fills.
function shapeSvg(status: GaugeStatus, s: number, pal: Palette): string {
  const c = pal.status[KEY[status]];
  const sw = 1.5;
  const ring = isFlooding(status) ? 2 : 0;
  const [h, e, m, S] = [sw / 2 + ring, s - sw / 2 + ring, s / 2 + ring, s + 2 * ring];
  const body = status === 'alert' ? `<polygon points="${m},${h} ${e},${m} ${m},${e} ${h},${m}"/>`
    : isFlooding(status) ? `<polygon points="${m},${h} ${e},${e} ${h},${e}"/>`
    : `<circle cx="${m}" cy="${m}" r="${s / 2 - sw / 2}"/>`;
  const halo = ring ? `<g fill="none" stroke="${MARKER_RING}" stroke-width="${sw + 2 * ring}">${body}</g>` : '';
  return `<svg class="fw-gauge" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" stroke-linejoin="round" aria-hidden="true">${halo}<g fill="${c.fill}" stroke="${c.stroke}" stroke-width="${sw}">${body}</g></svg>`;
}

// Stale (no reading for 6 h+): a dashed ring round the shape; the wrapper also fades it (globals.css .fw-gauge-stale).
const staleRing = (size: number, pal: Palette) =>
  `<span style="position:absolute;width:${size + 8}px;height:${size + 8}px;box-sizing:border-box;border-radius:9999px;border:1.5px dashed ${pal.staleRing};pointer-events:none" aria-hidden="true"></span>`;

const hoursAgo = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3_600_000));

// Marker = shape centred in a box, trend badge on its top-right corner, optional count pill bottom-right.
function markerIcon(status: GaugeStatus, size: number, pal: Palette, opts: { trend?: IrrigationStation['trend']; count?: number; stale?: boolean }): L.DivIcon {
  const box = isFlooding(status) ? 36 : 24; // small dots keep a 24 px tap target
  const c = box / 2;
  const pulse = status === 'major' ? `<span class="fw-gauge-pulse" style="border-color:${pal.status.major.fill}" aria-hidden="true"></span>` : '';
  // Rising on a flood shows in red; the badge is white in both themes, so the light red reads on it.
  const red = opts.trend === 'rising' && (status === 'minor' || status === 'major') ? `;color:${PALETTES.light.status.major.fill}` : '';
  const trend = opts.trend && isFlooding(status)
    ? `<span class="fw-trend" style="left:${c + size / 2 - 5}px;top:${c - size / 2 - 9}px${red}" aria-hidden="true">${trendArrow(opts.trend)}</span>` : '';
  const ring = opts.stale ? staleRing(size, pal) : '';
  const pill = opts.count ? `<span class="fw-count" style="left:${c + size / 2 - 4}px;top:${c + size / 2 - 8}px" aria-hidden="true">${opts.count}</span>` : '';
  return L.divIcon({
    className: `fw-gauge-wrap fw-gauge-${status}${opts.stale ? ' fw-gauge-stale' : ''}`,
    html: `${pulse}${ring}${shapeSvg(status, size, pal)}${trend}${pill}`,
    iconSize: [box, box],
    iconAnchor: [c, c],
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
      ${g.eta_next_threshold ? `<div style="font-size:11px;color:#374151;margin-top:6px">At the current rate${g.rise_rate_m_per_h ? ` (+${Math.round(g.rise_rate_m_per_h * 100)} cm/h)` : ''}: <b>${LEVEL_NAME[g.eta_next_threshold.level]} in ${aboutHours(g.eta_next_threshold.hours)}</b><div style="font-size:10px;color:#6b7280">Straight-line estimate from recent readings, not a forecast.</div></div>` : ''}
      ${g.stale ? `<div style="font-size:10px;color:#b91c1c;font-weight:700">Last reading ${hoursAgo(g.observed_at)} h ago &mdash; may be out of date</div>` : ''}
      <div class="fw-gauge-chart" style="margin-top:6px;font-size:10px;color:#9ca3af">Loading 7-day levels&hellip;</div>
      <div class="fw-flow-outlook"></div>
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
  gauges.map((g) => `${g.station}|${g.observed_at}|${g.status}|${g.stale}|${g.eta_next_threshold?.hours ?? ''}`).join(';');

type BasinInfo = { name: string; bounds: L.LatLngBounds; gauges: Set<string> };
let basinIndexPromise: Promise<BasinInfo[]> | null = null;
const basinIndex = () => (basinIndexPromise ??= loadBasins().then((fc) => fc.features
  .filter((f) => (f.properties?.gauges ?? []).length)
  .map((f) => ({
    name: f.properties?.name === 'unnamed' ? 'Unnamed basin' : String(f.properties?.name),
    bounds: L.geoJSON(f).getBounds(),
    gauges: new Set<string>(f.properties?.gauges),
  }))));

function singleMarker(g: IrrigationStation, pal: Palette, onSelect?: (g: IrrigationStation) => void): L.Marker {
  const label = `${g.station} river gauge: ${STATUS_LABEL[g.status].toLowerCase()}${g.trend ? `, ${g.trend}` : ''}${g.water_level_m !== null ? `, ${g.water_level_m.toFixed(2)} m` : ''}${g.stale ? ', stale' : ''}`;
  // Worse status draws on top where markers overlap.
  const marker = L.marker([g.lat as number, g.lon as number], {
    pane: GAUGE_PANE, icon: markerIcon(g.status, SIZE[g.status], pal, { trend: g.trend, stale: g.stale }),
    zIndexOffset: 1000 + RANK[g.status] * 100, title: label,
  });
  const eta = g.eta_next_threshold ? ` &middot; ${LEVEL_NAME[g.eta_next_threshold.level].toLowerCase()} in ~${aboutHours(g.eta_next_threshold.hours).replace('about ', '')}` : '';
  const old = g.stale ? ` &middot; last reading ${hoursAgo(g.observed_at)} h ago` : '';
  marker.bindTooltip(`<b>${esc(g.station)}</b> &mdash; ${statusText(g.status)}${g.trend ? ` &middot; ${g.trend}` : ''}${eta}${old}`, {
    direction: 'right', offset: [SIZE[g.status] / 2 + 4, 0], className: 'fw-gauge-tip',
  });
  marker.bindPopup(gaugePopup(g), { className: 'fw-light-popup', maxWidth: 260 });
  marker.on('popupopen', (e) => {
    const el = (e as L.PopupEvent).popup.getElement()?.querySelector('.fw-gauge-chart');
    if (!el) return;
    api.getGaugeHistory(g.station)
      .then((rows) => { el.innerHTML = sparkline(Array.isArray(rows) ? rows : [], g); })
      .catch(() => { el.textContent = '7-day history unavailable'; });
    const flow = (e as L.PopupEvent).popup.getElement()?.querySelector<HTMLElement>('.fw-flow-outlook');
    if (flow) fillFlowOutlook(flow, [g.station]);
  });
  if (onSelect) marker.on('click', () => onSelect(g));
  return marker;
}

// One marker for every gauge of a flooding basin: worst shape +4 px, ↑ if any non-normal gauge rises, count pill.
function groupMarker(map: L.Map, basin: BasinInfo, gs: IrrigationStation[], pal: Palette): L.Marker {
  const worst = worstStatus(gs) as GaugeStatus;
  const rising = gs.some((g) => isFlooding(g.status) && g.trend === 'rising');
  const at = L.latLng(gs.reduce((a, g) => a + (g.lat as number), 0) / gs.length, gs.reduce((a, g) => a + (g.lon as number), 0) / gs.length);
  const marker = L.marker(at, {
    pane: GAUGE_PANE, icon: markerIcon(worst, SIZE[worst] + 4, pal, { trend: rising ? 'rising' : undefined, count: gs.length }),
    zIndexOffset: 1000 + RANK[worst] * 100 + 50,
    title: `${basin.name}: ${gs.length} river gauges, worst ${STATUS_LABEL[worst].toLowerCase()}. Click to zoom in.`,
  });
  const rows = [...gs].sort((a, b) => RANK[b.status] - RANK[a.status])
    .map((g) => `<div>${esc(g.station)} &mdash; ${statusText(g.status)}${g.trend ? ` &middot; ${g.trend}` : ''}</div>`).join('');
  marker.bindTooltip(`<b>${esc(basin.name)}</b>${rows}<div class="fw-tip-muted">Click to zoom in</div>`, {
    direction: 'right', offset: [SIZE[worst] / 2 + 8, 0], className: 'fw-gauge-tip',
  });
  marker.on('click', () => map.fitBounds(basin.bounds, { padding: [40, 40] }));
  return marker;
}

export const GAUGE_PANE = 'fw-gauges'; // z 620

/** Gauge markers; re-renders on zoom (grouping) and on render() (theme or data change). */
export function createGaugeLayer(
  map: L.Map,
  gauges: IrrigationStation[],
  getPal: () => Palette,
  onSelect?: (g: IrrigationStation) => void,
): { layer: L.LayerGroup; render: () => void } {
  if (!map.getPane(GAUGE_PANE)) map.createPane(GAUGE_PANE).style.zIndex = '620';
  const layer = L.layerGroup();
  const placed = gauges.filter((g) => g.lat !== null && g.lon !== null);
  let basins: BasinInfo[] = [];
  const render = () => {
    layer.clearLayers();
    const pal = getPal();
    const grouped = new Set<string>();
    if (map.getZoom() < GROUP_ZOOM) {
      for (const b of basins) {
        const gs = placed.filter((g) => b.gauges.has(g.station) && !grouped.has(g.station));
        if (!gs.length || !isFlooding(worstStatus(gs))) continue;
        gs.forEach((g) => grouped.add(g.station));
        groupMarker(map, b, gs, pal).addTo(layer);
      }
    }
    placed.filter((g) => !grouped.has(g.station)).forEach((g) => singleMarker(g, pal, onSelect).addTo(layer));
  };
  layer.on('add', () => {
    map.on('zoomend', render);
    render();
    basinIndex().then((b) => { basins = b; if (map.hasLayer(layer)) render(); }).catch(() => {}); // ungrouped if basins fail
  });
  layer.on('remove', () => map.off('zoomend', render));
  return { layer, render };
}

let basinsPromise: Promise<GeoJSON.FeatureCollection> | null = null;
export function loadBasins(): Promise<GeoJSON.FeatureCollection> {
  basinsPromise ??= fetch('/data/river_basins.geojson').then((r) => {
    if (!r.ok) throw new Error(`basins ${r.status}`);
    return r.json();
  });
  return basinsPromise;
}


const BASIN_PANE = 'fw-basins'; // z 350
const HATCH_ID = 'fw-hatch-major';

// Major hatch: 3px stripes at 45°, 8px spacing, major colour @0.35, in the basins pane's own SVG.
function syncHatch(map: L.Map, pal: Palette) {
  const svg = map.getPane(BASIN_PANE)?.querySelector('svg');
  if (!svg) return;
  svg.querySelector(`#${HATCH_ID}`)?.closest('defs')?.remove();
  svg.insertAdjacentHTML('afterbegin', `<defs><pattern id="${HATCH_ID}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="3" height="8" fill="${pal.status.major.fill}" fill-opacity="0.35"/></pattern></defs>`);
}

export function createBasinLayer(
  map: L.Map,
  data: GeoJSON.FeatureCollection,
  getGauges: () => IrrigationStation[],
  getPal: () => Palette,
): { fills: L.GeoJSON; hatch: L.GeoJSON } {
  if (!map.getPane(BASIN_PANE)) map.createPane(BASIN_PANE).style.zIndex = '350';
  const inside = (f?: GeoJSON.Feature) => {
    const names: string[] = f?.properties?.gauges ?? [];
    return getGauges().filter((g) => names.includes(g.station));
  };
  const style = (f?: GeoJSON.Feature): L.PathOptions => {
    const pal = getPal();
    const worst = worstStatus(inside(f));
    if (isFlooding(worst)) {
      const b = pal.basin[worst];
      return { color: b.stroke, weight: b.weight, opacity: 1, fillColor: pal.status[worst].fill, fillOpacity: b.fillOpacity };
    }
    // Every other basin keeps a 1px neutral outline; fillOpacity 0 keeps the area clickable.
    return { color: pal.basinIdle, weight: 1, opacity: 1, fillOpacity: 0 };
  };
  const fills = L.geoJSON(data, {
    pane: BASIN_PANE, // Leaflet gives each pane its own SVG renderer, which holds the hatch <defs>
    style,
    onEachFeature: (f, layer) => {
      const name = f.properties?.name === 'unnamed' ? 'Unnamed basin' : esc(f.properties?.name);
      layer.bindTooltip(() => {
        const gs = inside(f);
        const worst = worstStatus(gs);
        return `<b>${name}</b> &mdash; ${worst ? statusText(worst) : 'No river gauge'} &middot; ${gs.length} gauge${gs.length === 1 ? '' : 's'}`;
      }, { sticky: true, className: 'fw-gauge-tip' });
      layer.bindPopup(() => {
        const p = f.properties ?? {};
        const rows = inside(f)
          .map((g) => `<tr><td>${esc(g.station)}</td><td style="font-weight:700"><span style="color:${STATUS_COLOR[g.status]}" aria-hidden="true">&#9679;</span> ${m(g.water_level_m)} <span style="font-weight:400;font-size:10px">${STATUS_LABEL[g.status].toLowerCase()}</span></td>
            <td>${trendArrow(g.trend)}${g.stale ? ' <span style="color:#b91c1c">stale</span>' : ''}</td></tr>`)
          .join('');
        return `<div class="fw-gauge-popup">
          <div style="font-weight:700;font-size:14px">${name}</div>
          <div style="color:#6b7280;font-size:11px">${Number(p.area_km2).toLocaleString()} km&sup2;</div>
          ${rows ? `<table style="font-size:11px;margin-top:6px;border-spacing:8px 2px">${rows}</table>`
                 : '<div style="font-size:11px;color:#6b7280;margin-top:6px">No river gauge in this basin</div>'}
          <div class="fw-flow-outlook"></div>
          <div style="font-size:9px;color:#9ca3af;margin-top:4px">${BASIN_CREDIT}</div></div>`;
      }, { className: 'fw-light-popup', maxWidth: 260 });
      layer.on('popupopen', (e) => { // GloFAS trend line, fetched on the first basin popup (lib/flowOutlook.ts)
        const el = (e as L.PopupEvent).popup.getElement()?.querySelector<HTMLElement>('.fw-flow-outlook');
        if (el) fillFlowOutlook(el, f.properties?.gauges ?? []);
      });
      layer.on('add', () => {
        if (layer instanceof L.Path) layer.getElement()?.setAttribute('tabindex', '-1');
      });
    },
  });
  // Second polygon per major basin, filled with the hatch pattern.
  const hatch = L.geoJSON(data, {
    pane: BASIN_PANE, interactive: false,
    style: (f) => (worstStatus(inside(f)) === 'major'
      ? { stroke: false, fillColor: `url(#${HATCH_ID})`, fillOpacity: 1 }
      : { stroke: false, fillOpacity: 0 }),
  });
  fills.on('add', () => syncHatch(map, getPal()));
  return { fills, hatch };
}

// ---------------------------------------------------------------------------
// Rivers (HOT OSM via HDX) - context only, drawn under the basin fills
// ---------------------------------------------------------------------------

const RIVER_PANE = 'fw-rivers'; // z 300: above the basemap (210), below basins (350)
const LABEL_MIN_ZOOM = 11;
const MINOR_RIVER_ZOOM = 9;

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

function createRiverLayer(map: L.Map, data: GeoJSON.FeatureCollection, getPal: () => Palette) {
  if (!map.getPane(RIVER_PANE)) map.createPane(RIVER_PANE).style.zIndex = '300';
  // Flood status lives on the basin fill above; rivers stay one colour. Main river = one that
  // drains a modelled basin; the rest are minor and hidden below MINOR_RIVER_ZOOM.
  const isMain = (f?: GeoJSON.Feature) => !!f?.properties?.basin_ids?.length;
  const style = (f?: GeoJSON.Feature): L.PathOptions => {
    const pal = getPal();
    const minor = !isMain(f) && map.getZoom() < MINOR_RIVER_ZOOM;
    return { pane: RIVER_PANE, color: pal.river, opacity: minor ? 0 : pal.riverOpacity, weight: isMain(f) ? pal.mainRiverWeight : pal.riverWeight };
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
    lines.setStyle(style);
    if (map.hasLayer(group) && map.getZoom() >= LABEL_MIN_ZOOM) group.addLayer(labels);
    else group.removeLayer(labels);
  };
  group.on('add', () => { map.on('zoomend', syncLabels); syncLabels(); });
  group.on('remove', () => map.off('zoomend', syncLabels));
  return { group, restyle: () => lines.setStyle(style as L.StyleFunction) };
}

// Basins + rivers as one switchable overlay. restyle() re-applies status and theme colours.
export async function createWaterLayer(
  map: L.Map,
  getGauges: () => IrrigationStation[],
  getPal: () => Palette,
) {
  const [basinData, riverData] = await Promise.all([loadBasins(), loadRivers()]);
  const { fills, hatch } = createBasinLayer(map, basinData, getGauges, getPal);
  const rivers = createRiverLayer(map, riverData, getPal);
  const restyleBasins = () => { fills.resetStyle(); hatch.resetStyle(); };
  return {
    layer: L.layerGroup([rivers.group, fills, hatch]),
    restyle: () => { restyleBasins(); rivers.restyle(); syncHatch(map, getPal()); },
  };
}

// Panels collapse to <details> below this width.
// Control positions outside the canvas: MetStationsMap registers them as extra Leaflet control corners.
export const DOCK_TOP = 'fwtop' as L.ControlPosition;
export const DOCK_LEGENDS = 'fwlegends' as L.ControlPosition;
export const NARROW = 560;

/** Gauge legend: marker shape | basin swatch | label. render() rebuilds it for the current theme. */
export function createBasinLegend(getPal: () => Palette): { control: L.Control; render: () => void } {
  // Below the map; closed on phones.
  const wide = window.innerWidth >= NARROW;
  const control = new L.Control({ position: DOCK_LEGENDS });
  let el: HTMLElement | null = null;
  const render = () => {
    if (!el) return;
    const pal = getPal();
    const swatch = (s: GaugeStatus) => {
      if (!isFlooding(s)) return '<i aria-hidden="true"></i>';
      const b = pal.basin[s];
      const fill = `color-mix(in srgb, ${pal.status[s].fill} ${Math.round(b.fillOpacity * 100)}%, transparent)`;
      const bg = s === 'major'
        ? `repeating-linear-gradient(45deg, color-mix(in srgb, ${pal.status.major.fill} 35%, transparent) 0 3px, transparent 3px 8px), ${fill}`
        : fill;
      return `<i aria-hidden="true" style="background:${bg};border:${b.weight}px solid ${b.stroke}"></i>`;
    };
    el.innerHTML = '<summary>River gauge status</summary><div class="fw-legend-grid">' +
      (['major', 'minor', 'alert', 'normal', 'unknown'] as GaugeStatus[]).map((s) =>
        `<b aria-hidden="true">${shapeSvg(s, SIZE[s], pal)}</b>${swatch(s)}<span>${statusText(s)}</span>`).join('') +
      `<b aria-hidden="true" style="position:relative;opacity:0.5">${staleRing(SIZE.normal, pal)}${shapeSvg('normal', SIZE.normal, pal)}</b><i aria-hidden="true"></i><span>Stale (no reading for 6 h+)</span>` +
      '</div><p>Basin colour = worst gauge inside it · Badge: ↑ rising ↓ falling → steady (shown for Alert and above)</p>';
  };
  control.onAdd = () => {
    el = L.DomUtil.create('details', 'fw-panel fw-basin-legend');
    if (wide) el.setAttribute('open', '');
    render();
    L.DomEvent.disableClickPropagation(el);
    return el;
  };
  return { control, render };
}
