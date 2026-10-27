// SPDX-License-Identifier: Apache-2.0

// "Rainfall vs normal (this month)" overlay for the home map: district capitals coloured
// by month-to-date ERA5 rain as % of the pro-rated 1996-2025 normal. Served from the
// backend DB (/api/rain-history/districts), so switching it on adds no upstream calls.

import L from 'leaflet';
import { api, RainVsNormal } from '@/lib/api';
import { MONTHS, PCT_BANDS, RAIN_HISTORY_LABEL, fmtDay, pctColor } from '@/lib/rainHistory';

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

// Below the gauge and rain-station markers (600) so they stay on top where they overlap.
const PANE = 'fw-rain-normal';
// Dark text on the light middle bands, white on the strong ends.
const textOn = (pct: number) => (pct >= 50 && pct < 150 ? '#0f172a' : '#ffffff');

export function createRainNormalLayer(map: L.Map): L.LayerGroup {
  if (!map.getPane(PANE)) map.createPane(PANE).style.zIndex = '450';
  const layer = L.layerGroup();
  let data: RainVsNormal[] | null = null;

  const draw = () => {
    layer.clearLayers();
    for (const r of data ?? []) {
      if (r.pct_of_normal == null || !r.as_of) continue;
      L.marker([r.lat, r.lon], {
        pane: PANE,
        title: `${r.district}: ${r.pct_of_normal}% of usual rain this month (modelled)`,
        icon: L.divIcon({
          className: '',
          html: `<div class="fw-rain-bubble" style="background:${pctColor(r.pct_of_normal)};color:${textOn(r.pct_of_normal)}" aria-hidden="true">${r.pct_of_normal}%</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
      }).bindPopup(popup(r), { className: 'fw-light-popup', maxWidth: 260 }).addTo(layer);
    }
  };

  const legend = new L.Control({ position: 'bottomright' });
  legend.onAdd = () => {
    const el = L.DomUtil.create('details', 'fw-forecast-legend');
    if (window.innerWidth >= 640) el.setAttribute('open', '');
    const shown = (data ?? []).filter((r) => r.pct_of_normal != null).length;
    el.innerHTML = `<summary class="fw-forecast-title">Rainfall vs normal (this month)</summary>
      ${PCT_BANDS.map((b) => `<div class="fw-forecast-row"><span style="background:${b.color}"></span>${b.label}</div>`).join('')}
      ${data && shown < data.length ? `<div class="fw-forecast-note">${shown} of ${data.length} districts loaded so far</div>` : ''}
      <div class="fw-forecast-note">${RAIN_HISTORY_LABEL}</div>`;
    L.DomEvent.disableClickPropagation(el);
    return el;
  };

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
  return layer;
}
