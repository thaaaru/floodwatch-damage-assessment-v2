// SPDX-License-Identifier: Apache-2.0

// Sea-level overlay: the two IOC tide gauges on the island (Colombo, Trincomalee). The popup fetches the
// last 3 days straight from the IOC Sea Level Monitoring service (CORS open, no key) when opened.
// Raw relative level, tide included: a storm surge shows as highs above the usual daily highs.

import L from 'leaflet';
import { colomboTime } from '@/lib/gaugeStatus';

const IOC = 'https://www.ioc-sealevelmonitoring.org';
// sensor: the station's water-level sensor (Colombo also reports battery/switch channels; Trincomalee has no radar).
const GAUGES = [
  { code: 'colo', sensor: 'rad', name: 'Colombo', lat: 6.9406, lon: 79.8504 },
  { code: 'trin', sensor: 'prs', name: 'Trincomalee', lat: 8.5637, lon: 81.1996 },
];
type Row = { slevel: number | null; stime: string; sensor: string };

function chart(rows: Row[], w = 220, h = 60): string {
  const pts = rows.map((r) => [Date.parse(`${r.stime.replace(' ', 'T')}Z`), r.slevel as number] as const);
  const ys = pts.map((p) => p[1]).sort((a, b) => a - b);
  const mid = ys[ys.length >> 1];
  const ok = pts.filter((p) => Math.abs(p[1] - mid) < 1.5); // ponytail: crude spike filter, IOC data is unchecked
  if (ok.length < 2) return 'No recent readings';
  const [x0, x1] = [ok[0][0], ok[ok.length - 1][0]];
  const [y0, y1] = [Math.min(...ok.map((p) => p[1])), Math.max(...ok.map((p) => p[1]))];
  const path = ok.map(([x, y]) => `${(((x - x0) / (x1 - x0 || 1)) * w).toFixed(1)},${(h - 4 - ((y - y0) / (y1 - y0 || 1)) * (h - 8)).toFixed(1)}`).join(' ');
  const last = ok[ok.length - 1];
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="3-day sea level">
    <polyline points="${path}" fill="none" stroke="#0891b2" stroke-width="1.5"/></svg>
    <div style="display:flex;justify-content:space-between;color:#6b7280"><span>3 days</span><span>range ${(y1 - y0).toFixed(2)} m</span></div>
    <div style="font-size:11px;color:#374151;margin-top:2px">Latest ${last[1].toFixed(2)} m at ${colomboTime(new Date(last[0]).toISOString())}</div>`;
}

export function createSeaLevelLayer(): L.LayerGroup {
  const layer = L.layerGroup();
  for (const g of GAUGES) {
    L.circleMarker([g.lat, g.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#0891b2', fillOpacity: 1 })
      .bindTooltip(`<b>${g.name}</b> tide gauge`, { direction: 'right', offset: [8, 0], className: 'fw-gauge-tip' })
      .bindPopup(`<div class="fw-gauge-popup"><div style="font-size:13px"><b>${g.name} sea level</b></div>
        <div class="fw-sea-chart" style="margin-top:6px;font-size:10px;color:#9ca3af">Loading 3-day sea level&hellip;</div>
        <div style="font-size:10px;color:#6b7280;margin-top:4px">Relative to the gauge datum, tide included. A storm surge shows as highs above the usual daily highs.</div>
        <div style="font-size:9px;color:#9ca3af;margin-top:4px">UNESCO IOC Sea Level Monitoring</div></div>`, { className: 'fw-light-popup', maxWidth: 260 })
      .on('popupopen', (e) => {
        const el = (e as L.PopupEvent).popup.getElement()?.querySelector('.fw-sea-chart');
        if (!el) return;
        const since = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 16);
        fetch(`${IOC}/service.php?query=data&code=${g.code}&format=json&timestart=${since}`)
          .then((r) => r.json())
          .then((rows: Row[]) => { el.innerHTML = chart(rows.filter((r) => r.sensor === g.sensor && r.slevel != null)); })
          .catch(() => { el.textContent = 'Sea level unavailable right now'; });
      })
      .addTo(layer);
  }
  return layer;
}
