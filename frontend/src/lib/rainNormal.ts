// SPDX-License-Identifier: Apache-2.0

// "Rainfall vs normal (this month)" overlay for the home map: district capitals coloured
// by month-to-date ERA5 rain as % of the pro-rated 1996-2025 normal. Served from the
// backend DB (/api/rain-history/districts), so switching it on adds no upstream calls.

import L from 'leaflet';
import { api, RainVsNormal } from '@/lib/api';
import { DOCK_LEGENDS, GAUGE_PANE, NARROW } from '@/lib/gauges';
import { RAIN_BANDS, rainBand, rgba, type Palette } from '@/lib/mapPalette';
import { MONTHS, RAIN_HISTORY_LABEL, fmtDay } from '@/lib/rainHistory';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function popup(r: RainVsNormal): string {
  const month = MONTHS[(r.month ?? 1) - 1];
  return `<div class="fw-gauge-popup" style="max-width:230px">
    <div style="font-size:13px"><b>${esc(r.district)}</b>: ${r.pct_of_normal}% of usual ${month} rain so far
      (${r.mtd_mm} mm vs ${r.normal_to_date_mm} mm normal)</div>
    <div style="font-size:11px;color:#6b7280;margin-top:4px">1 to ${fmtDay(r.as_of as string)}</div>
    <div style="font-size:10px;color:#9ca3af;margin-top:6px">${RAIN_HISTORY_LABEL}</div>
  </div>`;
}

const PANE = 'fw-rain-normal'; // z 610: above basins, below gauges (620) and place labels (640)
const PLACES_PANE = 'fw-places'; // lib/places.ts
const OFFSET = 17; // badge centre sits this far off the station on each axis, joined by a leader line
// Where a badge may sit relative to its station, tried in order: up-right first, then the other
// diagonals and the sides, then the same eight directions two steps further out.
const SPOTS: [number, number][] = [1, 1.6, 2.2].flatMap((k) => [
  [OFFSET, -OFFSET], [-OFFSET, -OFFSET], [OFFSET, OFFSET], [-OFFSET, OFFSET],
  [0, -24], [24, 0], [-24, 0], [0, 24],
].map(([x, y]) => [Math.round(x * k), Math.round(y * k)] as [number, number]));

export interface RainNormalLayer { layer: L.LayerGroup; redraw: () => void; setShowPct: (on: boolean) => void }

export function createRainNormalLayer(map: L.Map, getPal: () => Palette): RainNormalLayer {
  if (!map.getPane(PANE)) map.createPane(PANE).style.zIndex = '610';
  const layer = L.layerGroup();
  let data: RainVsNormal[] | null = null;
  let showPct = window.innerWidth >= NARROW; // phones start with plain dots: 25 labelled badges don't fit
  let placed = ''; // last placement, so a pan that moves nothing doesn't redraw (and close an open popup)

  const draw = (force = true) => {
    const pal = getPal();
    // Greedy placement in screen space, wettest first: a badge takes the first spot clear of gauge
    // markers, place names, station dots and badges already placed; if none is clear it keeps up-right.
    const origin = map.getContainer().getBoundingClientRect();
    const taken: number[][] = [...map.getContainer().querySelectorAll(`.leaflet-${GAUGE_PANE}-pane .leaflet-marker-icon, .fw-place`)].map((el) => {
      const r = el.getBoundingClientRect();
      return [r.left - origin.left, r.top - origin.top, r.right - origin.left, r.bottom - origin.top];
    });
    const rows = (data ?? []).filter((r) => r.pct_of_normal != null && r.as_of).sort((a, b) => b.pct_of_normal! - a.pct_of_normal!);
    const pts = rows.map((r) => map.latLngToContainerPoint([r.lat, r.lon]));
    pts.forEach((pt) => taken.push([pt.x - 3, pt.y - 3, pt.x + 3, pt.y + 3]));
    const free = (b: number[]) => !taken.some((t) => t[0] < b[2] && b[0] < t[2] && t[1] < b[3] && b[1] < t[3]);
    const size = (r: RainVsNormal) => {
      const band = rainBand(r.pct_of_normal as number);
      const big = band === RAIN_BANDS.length - 1; // ≥150%
      return { band, b: pal.rain[band], radius: showPct ? (big ? 13 : 12) : (big ? 8 : 6) };
    };
    const spots = rows.map((r, i) => {
      const { b, radius } = size(r);
      const pad = radius + (b.ring ? 3 : 0) + 1;
      const box = ([dx, dy]: [number, number]) => [pts[i].x + dx - pad, pts[i].y + dy - pad, pts[i].x + dx + pad, pts[i].y + dy + pad];
      const spot = SPOTS.find((s) => free(box(s))) ?? SPOTS[0];
      taken.push(box(spot));
      return spot;
    });
    const key = spots.join(';');
    if (!force && key === placed) return;
    placed = key;
    layer.clearLayers();
    rows.forEach((r, i) => {
      const pct = r.pct_of_normal as number;
      const { band, b, radius } = size(r);
      const [dx, dy] = spots[i];
      const shadow = `${b.ring ? `0 0 0 3px ${b.ring}, ` : ''}0 1px 3px rgba(0, 0, 0, 0.28)`;
      const html = `<svg class="fw-rain-leader" width="1" height="1" aria-hidden="true">
          <line x1="0" y1="0" x2="${dx}" y2="${dy}" stroke="${pal.label}" stroke-opacity="0.55" stroke-width="1"/></svg>
        <span class="fw-rain-dot" style="background:${b.ring ?? b.border}" aria-hidden="true"></span>
        <span class="fw-rain-badge" style="left:${dx - radius}px;top:${dy - radius}px;width:${radius * 2}px;height:${radius * 2}px;background:${rgba(b.fill, b.alpha)};border:${b.borderWidth}px solid ${b.border};color:${b.text};box-shadow:${shadow}" aria-hidden="true">${showPct ? `${pct}%` : ''}</span>`;
      L.marker([r.lat, r.lon], {
        pane: PANE,
        zIndexOffset: Math.round(pct * 10000), // wetter districts draw on top; outweighs Leaflet's by-latitude order
        title: `${r.district}: ${pct}% of usual rain this month (modelled)`,
        icon: L.divIcon({ className: 'fw-rain-wrap', html, iconSize: [0, 0] }),
      })
        .bindTooltip(`<b>${esc(r.district)}</b> &mdash; Rainfall ${pct}% of normal &middot; ${RAIN_BANDS[band].label}`, {
          direction: 'right', offset: [dx + radius, dy], className: 'fw-gauge-tip',
        })
        .bindPopup(popup(r), { className: 'fw-light-popup', maxWidth: 260, offset: [dx, dy] })
        .addTo(layer);
    });
  };
  // Re-place after a zoom and whenever gauge markers or place names change, a frame later so their
  // DOM is in place. Place names never avoid badges (that would loop); badges move around names.
  let frame = 0;
  const schedule = (e?: L.LeafletEvent) => {
    if (e?.type !== 'zoomend' && ![GAUGE_PANE, PLACES_PANE].includes((e as L.LayerEvent).layer?.options?.pane ?? '')) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { if (data && map.hasLayer(layer)) draw(false); });
  };
  map.on('zoomend layeradd layerremove', schedule);

  // Below the map, next to the gauge legend; closed on phones.
  const wide = window.innerWidth >= NARROW;
  const legend = new L.Control({ position: DOCK_LEGENDS });
  let legendEl: HTMLElement | null = null;
  const renderLegend = () => {
    if (!legendEl) return;
    const pal = getPal();
    const shown = (data ?? []).filter((r) => r.pct_of_normal != null).length;
    legendEl.innerHTML = `<summary>Rainfall vs normal (this month)</summary>
      ${RAIN_BANDS.map((band, i) => `<div class="fw-legend-row"><span class="fw-legend-dot" style="background:${rgba(pal.rain[i].fill, pal.rain[i].alpha)};border:${pal.rain[i].borderWidth}px solid ${pal.rain[i].border}${pal.rain[i].ring ? `;box-shadow:0 0 0 2px ${pal.rain[i].ring}` : ''}"></span>${band.label}</div>`).join('')}
      <label class="fw-legend-check"><input type="checkbox"${showPct ? ' checked' : ''}> Show % on circles</label>
      ${data && shown < data.length ? `<p>${shown} of ${data.length} districts loaded so far</p>` : ''}
      <p>${RAIN_HISTORY_LABEL}</p>`;
    legendEl.querySelector('input')?.addEventListener('change', (e) => setShowPct((e.target as HTMLInputElement).checked));
  };
  legend.onAdd = () => {
    legendEl = L.DomUtil.create('details', 'fw-panel fw-rain-legend');
    if (wide) legendEl.setAttribute('open', '');
    renderLegend();
    L.DomEvent.disableClickPropagation(legendEl);
    return legendEl;
  };
  const redraw = () => { draw(); renderLegend(); };
  const setShowPct = (on: boolean) => { showPct = on; draw(); };

  layer.on('add', () => {
    if (data) {
      legend.addTo(map);
      return draw();
    }
    api.getRainVsNormal()
      .then((res) => {
        data = res?.districts?.length ? res.districts : null;
        if (map.hasLayer(layer)) {
          legend.addTo(map);
          draw();
        }
      })
      .catch((e) => console.error('Failed to load rainfall vs normal:', e));
  });
  layer.on('remove', () => legend.remove());
  return { layer, redraw, setShowPct };
}
