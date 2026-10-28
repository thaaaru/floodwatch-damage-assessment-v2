// SPDX-License-Identifier: Apache-2.0

// "Rain in the last 24 h" overlay for the home map: NBRO automatic rain gauges (via RISE),
// one small dot per station coloured by the 24 h total. No labels on the map (about 250
// stations); name, total and time are in the tooltip and popup. A station whose last reading
// is over 3 h old is drawn hollow: its 24 h total no longer covers the last 24 h.

import L from 'leaflet';
import { api, Rain24hResponse, Rain24hStation } from '@/lib/api';
import { DOCK_LEGENDS, NARROW } from '@/lib/gauges';
import { colomboTime } from '@/lib/gaugeStatus';
import { RAIN24_BANDS, contrast, rain24Band, type Palette } from '@/lib/mapPalette';

export const RAIN24_CREDIT = 'RISE Sri Lanka (NBRO rain gauge network)';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const when = (s: Rain24hStation) => (s.observed_at ? colomboTime(s.observed_at) : 'time unknown');

function popup(s: Rain24hStation): string {
  return `<div class="fw-gauge-popup" style="max-width:230px">
    <div style="font-size:13px"><b>${esc(s.name)}</b>${s.district ? `, ${esc(s.district)}` : ''}</div>
    <div style="font-size:13px;margin-top:2px">${s.rain_24h_mm} mm in the 24 h to ${when(s)}</div>
    ${s.stale ? '<div style="font-size:11px;color:#b91c1c;font-weight:700;margin-top:4px">Stale: no reading for over 3 hours</div>' : ''}
    <div style="font-size:10px;color:#9ca3af;margin-top:6px">Observed rain gauge &middot; ${RAIN24_CREDIT}</div>
  </div>`;
}

const PANE = 'fw-rain-24h'; // z 605: above basins, under the rain-vs-normal badges (610), gauges (620) and place labels (640)

export function createRain24hLayer(map: L.Map, getPal: () => Palette): { layer: L.LayerGroup; redraw: () => void } {
  if (!map.getPane(PANE)) map.createPane(PANE).style.zIndex = '605';
  const layer = L.layerGroup();
  let res: Rain24hResponse | null = null;

  const draw = () => {
    layer.clearLayers();
    const pal = getPal();
    // Wettest drawn last, so it sits on top where dots overlap.
    [...(res?.stations ?? [])].sort((a, b) => a.rain_24h_mm - b.rain_24h_mm).forEach((s) => {
      const band = rain24Band(s.rain_24h_mm);
      const c = pal.rain24[band];
      // Hollow ring in whichever of the band's two colours reads better on the land.
      const ring = contrast(c.fill, pal.land) >= contrast(c.border, pal.land) ? c.fill : c.border;
      L.circleMarker([s.lat, s.lon], s.stale
        ? { pane: PANE, radius: 4, color: ring, weight: 2, fill: true, fillOpacity: 0 }
        : { pane: PANE, radius: band >= 3 ? 6 : 5, color: c.border, weight: 1, fillColor: c.fill, fillOpacity: 1 })
        .bindTooltip(`<b>${esc(s.name)}</b> &mdash; ${s.rain_24h_mm} mm in 24 h &middot; ${when(s)}${s.stale ? ' &middot; stale' : ''}`, {
          direction: 'right', offset: [6, 0], className: 'fw-gauge-tip',
        })
        .bindPopup(popup(s), { className: 'fw-light-popup', maxWidth: 260 })
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
    const stale = (res?.stations ?? []).filter((s) => s.stale).length;
    const latest = res?.latest_observation_at ? ` · latest ${colomboTime(res.latest_observation_at)}` : '';
    legendEl.innerHTML = `<summary>Rain in the last 24 h (observed)</summary>
      ${RAIN24_BANDS.map((band, i) => `<div class="fw-legend-row"><span class="fw-legend-dot" style="background:${pal.rain24[i].fill};border:1px solid ${pal.rain24[i].border}"></span>${band.label}</div>`).join('')}
      <div class="fw-legend-row"><span class="fw-legend-dot" style="border:2px solid ${pal.label}"></span>No reading for over 3 h${stale ? ` (${stale})` : ''}</div>
      ${res?.stale ? '<p>Source unavailable: showing the last good update.</p>' : ''}
      ${res && !res.stations?.length ? '<p>No rain gauge data available right now.</p>' : ''}
      <p>${RAIN24_CREDIT}${latest}</p>`;
  };
  legend.onAdd = () => {
    legendEl = L.DomUtil.create('details', 'fw-panel fw-rain-legend');
    if (wide) legendEl.setAttribute('open', '');
    renderLegend();
    L.DomEvent.disableClickPropagation(legendEl);
    return legendEl;
  };
  const redraw = () => { if (res) draw(); renderLegend(); };

  // Fetched on first switch-on, then on each later switch-on (the backend caches for 10 min).
  layer.on('add', () => {
    legend.addTo(map);
    if (res) draw();
    api.getRain24h()
      .then((r) => {
        res = r && Array.isArray(r.stations) ? r : { source: RAIN24_CREDIT, stations: [], latest_observation_at: null, stale: true };
        if (map.hasLayer(layer)) redraw();
      })
      .catch((e) => console.error('Failed to load 24 h rain:', e));
  });
  layer.on('remove', () => legend.remove());
  return { layer, redraw };
}
