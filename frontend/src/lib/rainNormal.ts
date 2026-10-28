// SPDX-License-Identifier: Apache-2.0

// "Rainfall vs normal (this month)" overlay for the home map: district capitals coloured
// by month-to-date ERA5 rain as % of the pro-rated 1996-2025 normal. Served from the
// backend DB (/api/rain-history/districts), so switching it on adds no upstream calls.

import L from 'leaflet';
import { api, RainVsNormal } from '@/lib/api';
import { DOCK_LEGENDS, NARROW } from '@/lib/gauges';
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
const OFFSET = 17; // badge centre sits up-right of the station, joined by a leader line

export interface RainNormalLayer { layer: L.LayerGroup; redraw: () => void; setShowPct: (on: boolean) => void }

export function createRainNormalLayer(map: L.Map, getPal: () => Palette): RainNormalLayer {
  if (!map.getPane(PANE)) map.createPane(PANE).style.zIndex = '610';
  const layer = L.layerGroup();
  let data: RainVsNormal[] | null = null;
  let showPct = true;

  const draw = () => {
    layer.clearLayers();
    const pal = getPal();
    for (const r of data ?? []) {
      if (r.pct_of_normal == null || !r.as_of) continue;
      const band = rainBand(r.pct_of_normal);
      const b = pal.rain[band];
      const big = band === RAIN_BANDS.length - 1; // ≥150%
      const radius = showPct ? (big ? 13 : 12) : (big ? 8 : 6);
      const shadow = `${b.ring ? `0 0 0 3px ${b.ring}, ` : ''}0 1px 3px rgba(0, 0, 0, 0.28)`;
      const html = `<svg class="fw-rain-leader" width="${OFFSET}" height="${OFFSET}" style="top:${-OFFSET}px" aria-hidden="true">
          <line x1="0" y1="${OFFSET}" x2="${OFFSET}" y2="0" stroke="${pal.label}" stroke-opacity="0.55" stroke-width="1"/></svg>
        <span class="fw-rain-dot" style="background:${b.ring ?? b.border}" aria-hidden="true"></span>
        <span class="fw-rain-badge" style="left:${OFFSET - radius}px;top:${-OFFSET - radius}px;width:${radius * 2}px;height:${radius * 2}px;background:${rgba(b.fill, b.alpha)};border:${b.borderWidth}px solid ${b.border};color:${b.text};box-shadow:${shadow}" aria-hidden="true">${showPct ? `${r.pct_of_normal}%` : ''}</span>`;
      L.marker([r.lat, r.lon], {
        pane: PANE,
        zIndexOffset: Math.round(r.pct_of_normal * 10000), // wetter districts draw on top; outweighs Leaflet's by-latitude order
        title: `${r.district}: ${r.pct_of_normal}% of usual rain this month (modelled)`,
        icon: L.divIcon({ className: 'fw-rain-wrap', html, iconSize: [0, 0] }),
      })
        .bindTooltip(`<b>${esc(r.district)}</b> &mdash; Rainfall ${r.pct_of_normal}% of normal &middot; ${RAIN_BANDS[band].label}`, {
          direction: 'right', offset: [OFFSET + radius, -OFFSET], className: 'fw-gauge-tip',
        })
        .bindPopup(popup(r), { className: 'fw-light-popup', maxWidth: 260, offset: [OFFSET, -OFFSET] })
        .addTo(layer);
    }
  };

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
