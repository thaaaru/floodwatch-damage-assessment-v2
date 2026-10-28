// SPDX-License-Identifier: Apache-2.0

// 5-day rain outlook inside the rain popups (district badges, Met station drops). Fetched by the
// viewer's browser from Open-Meteo when a popup opens: the server's shared IP is rate-limited there,
// and one request per click stays far inside the free per-IP quota. Cached per spot for 30 minutes.

import L from 'leaflet';
import { binColor, FORECAST_LABEL } from '@/lib/forecast';

const DAYS = 5;
const TTL = 30 * 60 * 1000;
type Outlook = { time: string[]; precipitation_sum: (number | null)[]; precipitation_probability_max: (number | null)[] };
const cache = new Map<string, { at: number; p: Promise<Outlook> }>();

function load(lat: number, lon: number): Promise<Outlook> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}`
    + `&daily=precipitation_sum,precipitation_probability_max&forecast_days=${DAYS}&timezone=Asia%2FColombo`)
    .then((r) => { if (!r.ok) throw new Error(`Open-Meteo ${r.status}`); return r.json(); })
    .then((j) => j.daily as Outlook);
  p.catch(() => cache.delete(key)); // a failure is retried on the next open
  cache.set(key, { at: Date.now(), p });
  return p;
}

/** Placeholder to put in the popup HTML; filled by withOutlook when the popup opens. */
export const OUTLOOK_SLOT = `<div class="fw-outlook" style="margin-top:8px;padding-top:6px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280">Loading ${DAYS}-day rain forecast…</div>`;

function render(o: Outlook): string {
  const max = Math.max(10, ...o.precipitation_sum.map((v) => v ?? 0));
  const cols = o.time.map((t, i) => {
    const mm = o.precipitation_sum[i] ?? 0;
    const pr = o.precipitation_probability_max[i];
    const day = i === 0 ? 'Today' : new Date(`${t}T12:00:00+05:30`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Asia/Colombo' });
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1">
      <div style="font-weight:700;color:#1f2937">${mm < 10 ? mm.toFixed(1) : Math.round(mm)}</div>
      <div style="height:36px;width:12px;display:flex;align-items:flex-end;background:#f1f5f9;border-radius:2px">
        <div style="width:100%;height:${Math.max(2, (mm / max) * 36)}px;background:${binColor(mm)};border-radius:2px"></div></div>
      <div style="color:#374151">${day}</div>
      <div style="font-size:10px">${pr == null ? '' : `${pr}%`}</div>
    </div>`;
  }).join('');
  return `<div style="font-weight:600;color:#374151;margin-bottom:4px">Rain forecast, next ${DAYS} days (mm)</div>
    <div style="display:flex;gap:4px">${cols}</div>
    <div style="font-size:10px;color:#9ca3af;margin-top:4px">% = chance of rain · ${FORECAST_LABEL}</div>`;
}

/** Fill the popup's OUTLOOK_SLOT with the forecast for (lat, lon) each time it opens. */
export function withOutlook<T extends L.Layer>(layer: T, lat: number, lon: number): T {
  let base = ''; // the popup HTML with the empty slot, kept so each open starts from "Loading…"
  layer.on('popupopen', (e: L.PopupEvent) => {
    const html = e.popup.getContent();
    if (typeof html !== 'string') return;
    if (html.includes(OUTLOOK_SLOT)) base = html;
    if (!base) return;
    // setContent, not editing the DOM: Leaflet re-renders string content on update and re-measures the popup.
    const fill = (inner: string) => { if (e.popup.isOpen()) e.popup.setContent(base.replace(OUTLOOK_SLOT, OUTLOOK_SLOT.replace(/>[^<]*<\/div>$/, `>${inner}</div>`))); };
    load(lat, lon).then((o) => fill(render(o))).catch(() => fill('Rain forecast unavailable right now.'));
  });
  return layer;
}
