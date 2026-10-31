// SPDX-License-Identifier: Apache-2.0

// "Cyclones near Sri Lanka" overlay: for each current GDACS storm within ~2,000 km, its track so far,
// the forecast uncertainty cone and the latest position. Fetched when the layer is switched on
// (/api/map/cyclones, a 30-minute server cache: GDACS's geometry API sends no CORS header).

import L from 'leaflet';
import { api } from '@/lib/api';
import { colomboTime } from '@/lib/gaugeStatus';

const ALERT: Record<string, string> = { Red: '#dc2626', Orange: '#ea580c', Green: '#16a34a' };
const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function createCycloneLayer(): L.LayerGroup {
  const layer = L.layerGroup();
  layer.on('add', () => {
    api.getCyclones().then((r) => {
      layer.clearLayers();
      for (const s of r.storms) {
        const c = ALERT[s.alert_level ?? ''] ?? '#7c3aed';
        const popup = `<div class="fw-gauge-popup" style="max-width:230px">
          <div style="font-size:13px"><b>Tropical cyclone ${esc(s.name)}</b></div>
          <div style="font-size:12px;margin-top:2px">GDACS alert: <b style="color:${c}">${esc(s.alert_level ?? 'unknown')}</b></div>
          ${s.updated ? `<div style="font-size:11px;color:#6b7280">Position as of ${colomboTime(`${s.updated}Z`)} (Colombo)</div>` : ''}
          <div style="font-size:11px;margin-top:4px">Line: track so far &middot; shaded: where the centre may go</div>
          ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" style="font-size:11px">GDACS report</a>` : ''}
          <div style="font-size:9px;color:#9ca3af;margin-top:4px">${esc(r.source)}${r.stale ? ' &middot; could not refresh, showing last data' : ''}</div></div>`;
        L.geoJSON({ type: 'FeatureCollection', features: s.features } as GeoJSON.FeatureCollection, {
          style: (f) => (f?.properties.kind === 'cone'
            ? { color: c, weight: 1, dashArray: '4 4', fillColor: c, fillOpacity: 0.12 }
            : { color: c, weight: 2.5 }),
          pointToLayer: (_, at) => L.circleMarker(at, { radius: 8, color: '#fff', weight: 2, fillColor: c, fillOpacity: 1 }),
        }).bindTooltip(`Cyclone ${esc(s.name)} &mdash; GDACS ${esc(s.alert_level ?? '')} alert`, { sticky: true, className: 'fw-gauge-tip' })
          .bindPopup(popup, { className: 'fw-light-popup', maxWidth: 260 })
          .addTo(layer);
      }
    }).catch(() => { /* optional overlay: nothing drawn */ });
  });
  return layer;
}
