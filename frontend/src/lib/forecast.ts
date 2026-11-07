// SPDX-License-Identifier: Apache-2.0

// "Rain forecast" overlay for the home map: colours the ~100 weather locations by
// Open-Meteo forecast rain (24 h or 48 h). Uses /api/weather/all, which the
// backend already caches, so switching it on adds no upstream calls.

import L from 'leaflet';
import { api, RainOdds, WeatherSummary } from '@/lib/api';

export type ForecastWindow = 24 | 48;
type ForecastView = ForecastWindow | 'p50'; // 'p50': chance of over 50 mm in the next 24 h (ensemble)

const BINS: { max: number; label: string; color: string }[] = [
  { max: 10, label: '0–10', color: '#bfdbfe' },
  { max: 25, label: '10–25', color: '#60a5fa' },
  { max: 50, label: '25–50', color: '#2563eb' },
  { max: 100, label: '50–100', color: '#7c3aed' },
  { max: Infinity, label: '>100', color: '#be123c' },
];
export const FORECAST_LABEL = 'Forecast (Open-Meteo model), not measured';
// Switched on deliberately, so above the rain badges (605/610) to stay clickable; below gauges (644) and labels (640).
const PANE = 'fw-forecast';

export const binColor = (mm: number) => (BINS.find((b) => mm < b.max) ?? BINS[BINS.length - 1]).color;
// Same five colours, so "darker = worse" reads the same in both views.
const ODDS_BINS = [10, 25, 50, 75, Infinity].map((max, i) => ({ max, label: ['0–10', '10–25', '25–50', '50–75', '>75'][i], color: BINS[i].color }));
const oddsColor = (pct: number) => (ODDS_BINS.find((b) => pct < b.max) ?? ODDS_BINS[ODDS_BINS.length - 1]).color;
const NO_ODDS = '#e5e7eb';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const mm = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)} mm`);

const ODDS_LABEL = '51 ECMWF ensemble runs (model)';

function popup(w: WeatherSummary, o?: RainOdds): string {
  return `<div class="fw-gauge-popup">
    <div style="font-weight:700;font-size:14px">${esc(w.district)}</div>
    <div style="display:grid;grid-template-columns:auto auto;gap:2px 12px;font-size:11px;margin-top:6px">
      <div style="color:#6b7280">Forecast next 24 h</div><div style="font-weight:700">${mm(w.forecast_precip_24h_mm)}</div>
      <div style="color:#6b7280">Forecast next 48 h</div><div style="font-weight:700">${mm(w.forecast_precip_48h_mm)}</div>
      <div style="color:#6b7280">Chance of rain</div><div>${w.precipitation_probability == null ? '—' : `${Math.round(w.precipitation_probability)}%`}</div>
      <div style="color:#6b7280">Past 24 h rain</div><div>${mm(w.rainfall_24h_mm)}</div>
    </div>
    ${o ? `<div style="font-size:11px;margin-top:6px"><b>Chance of heavy rain, next 24 h</b></div>
    <div style="display:grid;grid-template-columns:auto auto;gap:2px 12px;font-size:11px;margin-top:2px">
      <div style="color:#6b7280">Over 50 mm</div><div style="font-weight:700">${o.p50}%</div>
      <div style="color:#6b7280">Over 100 mm</div><div style="font-weight:700">${o.p100}%</div>
    </div>
    <div style="font-size:10px;color:#9ca3af;margin-top:2px">${ODDS_LABEL}</div>` : ''}
    <div style="font-size:10px;color:#9ca3af;margin-top:6px">${FORECAST_LABEL}</div>
  </div>`;
}

/**
 * Overlay layer (add it to the layer control) plus its own small control with the
 * 24 h / 48 h / chance-of-over-50 mm switch and legend, shown only while the layer is on.
 */
export function createForecastLayer(map: L.Map): L.LayerGroup {
  if (!map.getPane(PANE)) map.createPane(PANE).style.zIndex = '615';
  const layer = L.layerGroup();
  let data: WeatherSummary[] | null = null;
  let odds = new Map<string, RainOdds>(); // optional: popups go without it if the ensemble is down
  let view: ForecastView = 24;
  let renderControl = () => {};

  const draw = () => {
    layer.clearLayers();
    for (const w of data ?? []) {
      if (w.latitude == null || w.longitude == null) continue;
      const o = odds.get(w.district);
      const value = view === 48 ? w.forecast_precip_48h_mm : w.forecast_precip_24h_mm;
      const [fill, tip] = view === 'p50'
        ? [o ? oddsColor(o.p50) : NO_ODDS, o ? `${o.p50}% chance of over 50 mm, next 24 h` : 'no ensemble data']
        : [binColor(value ?? 0), `${mm(value)} forecast, next ${view} h`];
      L.circleMarker([w.latitude, w.longitude], {
        pane: PANE, radius: 7, weight: 1, color: '#1e293b', fillColor: fill, fillOpacity: 0.9,
      }).bindTooltip(`<b>${esc(w.district)}</b> &mdash; ${tip}`, {
        direction: 'right', offset: [8, 0], className: 'fw-gauge-tip',
      }).bindPopup(popup(w, o), { className: 'fw-light-popup', maxWidth: 240 }).addTo(layer);
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
      // The ">50 mm chance" view only once the ensemble has loaded.
      const views: [ForecastView, string][] = [[24, '24 h'], [48, '48 h'], ...(odds.size ? [['p50', '>50 mm chance']] as [ForecastView, string][] : [])];
      const odd = view === 'p50';
      body.innerHTML = `<div class="fw-forecast-switch">${views.map(([v, text]) =>
          `<button type="button" data-v="${v}" aria-pressed="${v === view}">${text}</button>`).join('')}</div>
        ${(odd ? ODDS_BINS : BINS).map((b) => `<div class="fw-forecast-row"><span style="background:${b.color}"></span>${b.label}${odd ? '%' : ' mm'}</div>`).join('')}
        ${odd ? `<div class="fw-forecast-row"><span style="background:${NO_ODDS}"></span>No ensemble data</div>` : ''}
        <div class="fw-forecast-note">${odd ? `Chance of over 50 mm in the next 24 h: ${ODDS_LABEL}` : FORECAST_LABEL}</div>`;
      body.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => {
        view = btn.dataset.v === 'p50' ? 'p50' : (Number(btn.dataset.v) as ForecastWindow);
        render();
        draw();
      }));
    };
    renderControl = render;
    render();
    L.DomEvent.disableClickPropagation(el);
    return el;
  };

  layer.on('add', () => {
    control.addTo(map);
    if (data) return draw();
    api.getRainOdds()
      .then((r) => {
        odds = new Map((r?.locations ?? []).map((o) => [o.name, o]));
        renderControl();
        if (data && map.hasLayer(layer)) draw();
      })
      .catch(() => {});
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
