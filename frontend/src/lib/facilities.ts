// SPDX-License-Identifier: Apache-2.0

// "Hospitals & shelters" overlay for the home map, from OpenStreetMap via /api/map/facilities
// (one Overpass query a day, cached by the backend). Hospital = square with a cross, shelter =
// house. From zoom 9 every place has its own icon; further out they gather into count pills
// on a coarse screen grid (one grid per kind), which zoom in when clicked.

import L from 'leaflet';
import { api, MapFacilitiesResponse, MapFacility } from '@/lib/api';
import { DOCK_LEGENDS, NARROW } from '@/lib/gauges';
import type { Palette } from '@/lib/mapPalette';

export const FACILITY_DISCLAIMER = 'From OpenStreetMap — not an official evacuation centre list';
const CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const LABEL: Record<MapFacility['kind'], string> = { hospital: 'Hospital', shelter: 'Shelter / assembly point' };
const nameOf = (f: MapFacility) => f.name || `Unnamed ${f.kind}`;

export function facilityIcon(kind: MapFacility['kind'], pal: Palette, size = 16): string {
  const { fill, glyph } = pal.facility[kind];
  const body = kind === 'hospital'
    ? `<rect x="0.75" y="0.75" width="14.5" height="14.5" rx="3" fill="${fill}" stroke="${glyph}" stroke-width="1.5"/>
       <path d="M6.5 3.5h3v3h3v3h-3v3h-3v-3h-3v-3h3z" fill="${glyph}"/>`
    : `<path d="M8 1 L15.2 7.4 V15.2 H0.8 V7.4 Z" fill="${fill}" stroke="${glyph}" stroke-width="1.5" stroke-linejoin="round"/>
       <rect x="6.25" y="9" width="3.5" height="6" fill="${glyph}"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;
}

function popup(f: MapFacility): string {
  const tel = f.phone ? f.phone.split(/[;,]/)[0].trim() : '';
  return `<div class="fw-gauge-popup" style="max-width:230px">
    <div style="font-size:13px;font-weight:700">${esc(nameOf(f))}</div>
    <div style="font-size:11px;color:#6b7280">${LABEL[f.kind]}</div>
    ${tel ? `<div style="font-size:12px;margin-top:4px">Phone: <a href="tel:${esc(tel.replace(/[^\d+]/g, ''))}">${esc(f.phone)}</a></div>` : ''}
    <div style="font-size:11px;color:#b45309;margin-top:6px">${FACILITY_DISCLAIMER}</div>
    <div style="font-size:10px;color:#9ca3af;margin-top:4px">${CREDIT}</div>
  </div>`;
}

const PANE = 'fw-facilities'; // z 615: above rain dots and badges (605/610), below gauges (620) and place labels (640)
const DETAIL_ZOOM = 9;
const CELL = 96; // px: grid cell for the zoomed-out count pills (coarse, so they don't bury the other layers)

export function createFacilitiesLayer(map: L.Map, getPal: () => Palette): { layer: L.LayerGroup; redraw: () => void } {
  if (!map.getPane(PANE)) map.createPane(PANE).style.zIndex = '615';
  const layer = L.layerGroup();
  let res: MapFacilitiesResponse | null = null;

  const single = (f: MapFacility, pal: Palette) => L.marker([f.lat, f.lon], {
    pane: PANE, title: `${nameOf(f)} (${LABEL[f.kind].toLowerCase()}, OpenStreetMap)`,
    icon: L.divIcon({ className: 'fw-facility', html: facilityIcon(f.kind, pal), iconSize: [24, 24], iconAnchor: [12, 12] }),
  })
    .bindTooltip(`<b>${esc(nameOf(f))}</b> &mdash; ${LABEL[f.kind]}`, { direction: 'right', offset: [10, 0], className: 'fw-gauge-tip' })
    .bindPopup(popup(f), { className: 'fw-light-popup', maxWidth: 260 });

  const draw = () => {
    layer.clearLayers();
    const pal = getPal();
    const all = res?.facilities ?? [];
    if (map.getZoom() >= DETAIL_ZOOM) {
      all.forEach((f) => single(f, pal).addTo(layer));
      return;
    }
    // ponytail: fixed grid in world pixels, not true clustering; fine for ~900 points.
    const cells = new Map<string, MapFacility[]>();
    const z = map.getZoom();
    all.forEach((f) => {
      const p = map.project([f.lat, f.lon], z);
      const key = `${f.kind}:${Math.floor(p.x / CELL)}:${Math.floor(p.y / CELL)}`;
      cells.set(key, [...(cells.get(key) ?? []), f]);
    });
    cells.forEach((fs) => {
      if (fs.length === 1) return single(fs[0], pal).addTo(layer);
      const { kind } = fs[0];
      const c = pal.facility[kind];
      const at = L.latLng(fs.reduce((a, f) => a + f.lat, 0) / fs.length, fs.reduce((a, f) => a + f.lon, 0) / fs.length);
      const what = kind === 'hospital' ? 'hospitals' : 'shelters';
      L.marker(at, {
        pane: PANE, title: `${fs.length} ${what} (OpenStreetMap). Click to zoom in.`,
        icon: L.divIcon({
          className: 'fw-facility',
          html: `<span style="position:absolute;transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:3px;padding:1px 5px 1px 2px;border-radius:9px;background:${c.fill};border:1px solid ${c.glyph};color:${c.glyph};font:600 10px/1 var(--font-plex-mono),ui-monospace,monospace;white-space:nowrap">${facilityIcon(kind, pal, 13)}${fs.length}</span>`,
          iconSize: [0, 0],
        }),
      })
        .bindTooltip(`${fs.length} ${what} &middot; click to zoom in`, { direction: 'right', offset: [16, 0], className: 'fw-gauge-tip' })
        .on('click', () => map.setView(at, Math.max(DETAIL_ZOOM, z + 2)))
        .addTo(layer);
    });
  };

  // Below the map, next to the other legends; closed on phones.
  const wide = window.innerWidth >= NARROW;
  const legend = new L.Control({ position: DOCK_LEGENDS });
  let legendEl: HTMLElement | null = null;
  const renderLegend = () => {
    if (!legendEl) return;
    const pal = getPal();
    const n = (k: MapFacility['kind']) => (res?.facilities ?? []).filter((f) => f.kind === k).length;
    legendEl.innerHTML = `<summary>Hospitals &amp; shelters</summary>
      ${(['hospital', 'shelter'] as const).map((k) => `<div class="fw-legend-row">${facilityIcon(k, pal)}${LABEL[k]}${res ? ` (${n(k)})` : ''}</div>`).join('')}
      ${res && !res.facilities.length ? '<p>Facility list unavailable right now.</p>' : ''}
      <p>${FACILITY_DISCLAIMER}. Few shelters are mapped in OpenStreetMap. ${CREDIT}</p>`;
  };
  legend.onAdd = () => {
    legendEl = L.DomUtil.create('details', 'fw-panel fw-rain-legend');
    if (wide) legendEl.setAttribute('open', '');
    renderLegend();
    L.DomEvent.disableClickPropagation(legendEl);
    return legendEl;
  };
  const redraw = () => { if (res) draw(); renderLegend(); };
  const onZoom = () => { if (res) draw(); };

  layer.on('add', () => {
    legend.addTo(map);
    map.on('zoomend', onZoom);
    if (res?.facilities.length) return redraw(); // an empty (failed) list is fetched again
    api.getMapFacilities()
      .then((r) => {
        res = r && Array.isArray(r.facilities) ? r : { source: 'OpenStreetMap', disclaimer: FACILITY_DISCLAIMER, facilities: [], stale: true };
        if (map.hasLayer(layer)) redraw();
      })
      .catch((e) => console.error('Failed to load hospitals and shelters:', e));
  });
  layer.on('remove', () => { legend.remove(); map.off('zoomend', onZoom); });
  return { layer, redraw };
}
