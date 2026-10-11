// SPDX-License-Identifier: Apache-2.0

// "Rain forecast" overlay for the home map: colours the ~100 weather locations by
// Open-Meteo forecast rain (24 h or 48 h). Uses /api/weather/all, which the
// backend already caches, so switching it on adds no upstream calls.

import L from 'leaflet';
import { api, WeatherSummary } from '@/lib/api';

export type ForecastWindow = 24 | 48;

const BINS: { max: number; label: string; color: string }[] = [
  { max: 10, label: '0–10', color: '#bfdbfe' },
  { max: 25, label: '10–25', color: '#60a5fa' },
  { max: 50, label: '25–50', color: '#2563eb' },
  { max: 100, label: '50–100', color: '#7c3aed' },
  { max: Infinity, label: '>100', color: '#be123c' },
];
export const FORECAST_LABEL = 'Forecast (Open-Meteo model), not measured';
const PANE = 'fw-forecast'; // above rivers (450), below gauge/rain markers (600)

export const binColor = (mm: number) => (BINS.find((b) => mm < b.max) ?? BINS[BINS.length - 1]).color;

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const mm = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)} mm`);

function popup(w: WeatherSummary): string {
  return `<div class="fw-gauge-popup">
    <div style="font-weight:700;font-size:14px">${esc(w.district)}</div>
    <div style="display:grid;grid-template-columns:auto auto;gap:2px 12px;font-size:11px;margin-top:6px">
      <div style="color:#6b7280">Forecast next 24 h</div><div style="font-weight:700">${mm(w.forecast_precip_24h_mm)}</div>
      <div style="color:#6b7280">Forecast next 48 h</div><div style="font-weight:700">${mm(w.forecast_precip_48h_mm)}</div>
      <div style="color:#6b7280">Chance of rain</div><div>${w.precipitation_probability == null ? '—' : `${Math.round(w.precipitation_probability)}%`}</div>
      <div style="color:#6b7280">Past 24 h rain</div><div>${mm(w.rainfall_24h_mm)}</div>
    </div>
    <div style="font-size:10px;color:#9ca3af;margin-top:6px">${FORECAST_LABEL}</div>
  </div>`;
}

/**
 * Overlay layer (add it to the layer control) plus its own small control with the
 * 24 h / 48 h switch and legend, shown only while the layer is on.
 */
export function createForecastLayer(map: L.Map): L.LayerGroup {
  if (!map.getPane(PANE)) map.createPane(PANE).style.zIndex = '550';
  const layer = L.layerGroup();
  let data: WeatherSummary[] | null = null;
  let hours: ForecastWindow = 24;

  const draw = () => {
    layer.clearLayers();
    for (const w of data ?? []) {
      if (w.latitude == null || w.longitude == null) continue;
      const value = hours === 24 ? w.forecast_precip_24h_mm : w.forecast_precip_48h_mm;
      L.circleMarker([w.latitude, w.longitude], {
        pane: PANE, radius: 6, weight: 1, color: '#1e293b', fillColor: binColor(value ?? 0), fillOpacity: 0.9,
      }).bindPopup(popup(w), { className: 'fw-light-popup', maxWidth: 240 }).addTo(layer);
    }
  };

  const control = new L.Control({ position: 'bottomright' });
  control.onAdd = () => {
    // Collapsible like the basin legend: closed by default on narrow screens.
    const el = L.DomUtil.create('details', 'fw-forecast-legend');
    if (window.innerWidth >= 640) el.setAttribute('open', '');
    el.innerHTML = '<summary class="fw-forecast-title">Rain forecast</summary><div></div>';
    const body = el.querySelector('div') as HTMLDivElement;
    const render = () => {
      body.innerHTML = `<div class="fw-forecast-switch">${([24, 48] as const).map((h) =>
          `<button type="button" data-h="${h}" aria-pressed="${h === hours}">${h} h</button>`).join('')}</div>
        ${BINS.map((b) => `<div class="fw-forecast-row"><span style="background:${b.color}"></span>${b.label} mm</div>`).join('')}
        <div class="fw-forecast-note">${FORECAST_LABEL}</div>`;
      body.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => {
        hours = Number(btn.dataset.h) as ForecastWindow;
        render();
        draw();
      }));
    };
    render();
    L.DomEvent.disableClickPropagation(el);
    return el;
  };

  layer.on('add', () => {
    control.addTo(map);
    if (data) return draw();
    api.getAllWeather(24)
      .then((rows) => {
        // Keep nothing on an empty answer (backend cache still warming) so the next toggle retries.
        data = Array.isArray(rows) && rows.length ? rows : null;
        if (map.hasLayer(layer)) draw();
      })
      .catch((e) => console.error('Failed to load rain forecast:', e));
  });
  layer.on('remove', () => control.remove());
  return layer;
}
