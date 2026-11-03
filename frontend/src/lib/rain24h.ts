// SPDX-License-Identifier: Apache-2.0

// "Rain in the last 24 h" overlay for the home map: NBRO automatic rain gauges (via RISE),
// one small drop per station coloured by the 24 h total, tagged with that total when it has rain;
// name, exact total and time are in the tooltip and popup. A station whose last reading
// is over 3 h old is drawn hollow: its 24 h total no longer covers the last 24 h.
// Zoomed out, only the heaviest current readings are drawn; zooming in shows every station.

import L from 'leaflet';
import { api, Rain24hResponse, Rain24hStation } from '@/lib/api';
import { DOCK_LEGENDS, NARROW } from '@/lib/gauges';
import { colomboTime } from '@/lib/gaugeStatus';
import { RAIN_DROP_BANDS, RAIN_PULSE_MM, rainDropBand, rainDropSize, rainDropSvg } from '@/lib/mapPalette';

export const RAIN24_CREDIT = 'RISE Sri Lanka (NBRO rain gauge network)';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const when = (s: Rain24hStation) => (s.observed_at ? colomboTime(s.observed_at) : 'time unknown');

function popup(s: Rain24hStation): string {
  return `<div class="fw-gauge-popup" style="max-width:230px">
    <div style="font-size:13px"><b>${esc(s.name)}</b>${s.district ? `, ${esc(s.district)}` : ''}</div>
    <div style="font-size:13px;margin-top:2px">${s.rain_24h_mm} mm in the 24 h to ${when(s)}</div>
    ${s.stale ? '<div style="font-size:11px;color:#b91c1c;font-weight:700;margin-top:4px">Stale: no reading for over 3 hours</div>' : ''}
    <div style="font-size:10px;color:#6b7280;margin-top:6px">Observed rain gauge &middot; ${RAIN24_CREDIT}</div>
  </div>`;
}

const PANE = 'fw-rain-24h'; // z 642: above place labels (640) so the values read, under gauges (644) and the Met drops (645)
const ALL_GAUGES_ZOOM = 10;
const ISLAND_MIN_MM = 75;
const SIZE = 14;

// Tag hangs below the drop without changing the icon's size, so the anchor stays on the station. Dry or stale: no value worth a tag.
function dropHtml(s: Rain24hStation, size: number): string {
  const band = rainDropBand(s.rain_24h_mm);
  if (s.stale) return rainDropSvg(size, 'none');
  if (s.rain_24h_mm <= 0) return rainDropSvg(size, band.color);
  return `${rainDropSvg(size, band.color, s.rain_24h_mm >= RAIN_PULSE_MM)}<div style="position:absolute;top:100%;left:50%;width:60px;margin-left:-30px;display:flex;justify-content:center;pointer-events:none">
    <div class="met-tag" style="margin-top:1px;padding:1px 4px;border-radius:4px;background:${band.color};color:${band.text};font:700 11px/1.1 -apple-system,system-ui,sans-serif;white-space:nowrap;box-shadow:0 0 0 1px #fff">${s.rain_24h_mm < 1 ? s.rain_24h_mm.toFixed(1) : Math.round(s.rain_24h_mm)}mm</div>
  </div>`;
}

export function createRain24hLayer(map: L.Map): L.LayerGroup {
  if (!map.getPane(PANE)) map.createPane(PANE).style.zIndex = '642';
  const layer = L.layerGroup();
  let res: Rain24hResponse | null = null;
  let showAll = map.getZoom() >= ALL_GAUGES_ZOOM;

  // Up to 250 drops: only those on screen are tab stops.
  const syncTabStops = () => {
    const bounds = map.getBounds();
    layer.eachLayer((l) => {
      const el = (l as L.Marker).getElement();
      if (el) el.tabIndex = bounds.contains((l as L.Marker).getLatLng()) ? 0 : -1;
    });
  };

  const draw = () => {
    layer.clearLayers();
    (res?.stations ?? []).filter((s) => showAll || (!s.stale && s.rain_24h_mm >= ISLAND_MIN_MM)).forEach((s) => {
      const size = s.stale ? SIZE : rainDropSize(SIZE, s.rain_24h_mm);
      const marker = L.marker([s.lat, s.lon], {
        pane: PANE,
        zIndexOffset: Math.round(s.rain_24h_mm * 100), // wettest on top where drops overlap
        icon: L.divIcon({
          className: 'fw-rain-drop met-station-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
          html: dropHtml(s, size),
        }),
      })
        .bindTooltip(`<b>${esc(s.name)}</b> &mdash; ${s.rain_24h_mm} mm in 24 h &middot; ${when(s)}${s.stale ? ' &middot; stale' : ''}`, {
          direction: 'right', offset: [6, 0], className: 'fw-gauge-tip',
        })
        .bindPopup(popup(s), { className: 'fw-light-popup', maxWidth: 260 })
        .addTo(layer);
      marker.getElement()?.setAttribute('aria-label', `${s.name} rain gauge: ${s.rain_24h_mm} mm in 24 h, ${when(s)}${s.stale ? ', stale' : ''}`);
    });
    syncTabStops();
    map.fire('fw-drops-drawn'); // the map re-places every drop's tag
  };

  // Below the map, next to the other legends; closed on phones.
  const wide = window.innerWidth >= NARROW;
  const legend = new L.Control({ position: DOCK_LEGENDS });
  let legendEl: HTMLElement | null = null;
  const renderLegend = () => {
    if (!legendEl) return;
    const stale = (res?.stations ?? []).filter((s) => s.stale).length;
    const latest = res?.latest_observation_at ? ` · latest ${colomboTime(res.latest_observation_at)}` : '';
    legendEl.innerHTML = `<summary>Rain in the last 24 h (observed)</summary>
      ${RAIN_DROP_BANDS.map((band) => `<div class="fw-legend-row"><span style="flex:none">${rainDropSvg(rainDropSize(SIZE, band.min), band.color)}</span>${band.label}</div>`).join('')}
      <div class="fw-legend-row"><span style="flex:none">${rainDropSvg(SIZE, 'none')}</span>No reading for over 3 h${stale ? ` (${stale})` : ''}</div>
      ${!showAll && res?.stations?.length ? `<p>Showing ${ISLAND_MIN_MM} mm or more. Zoom in to see all ${res.stations.length} gauges.</p>` : ''}
      ${!res ? '<p>Loading rain gauges…</p>' : ''}
      ${res?.stale && res.stations?.length ? '<p>Source unavailable: showing the last good update.</p>' : ''}
      ${res?.stale && !res.stations?.length ? '<p>Could not load rain gauges. Turn this layer off and on to try again.</p>' : ''}
      ${res && !res.stale && !res.stations?.length ? '<p>No rain gauge data available right now.</p>' : ''}
      <p>Met Dept drops (white tags) use the same colours, but count rain since 08:30.</p>
      <p>${RAIN24_CREDIT}${latest}</p>`;
    if (res && (res.stale || !res.stations?.length)) legendEl.setAttribute('open', ''); // a problem must show, even on phones
  };
  legend.onAdd = () => {
    legendEl = L.DomUtil.create('details', 'fw-panel fw-rain-legend');
    if (wide) legendEl.setAttribute('open', '');
    renderLegend();
    L.DomEvent.disableClickPropagation(legendEl);
    return legendEl;
  };
  const redraw = () => { if (res) draw(); renderLegend(); };

  const onZoom = () => {
    const next = map.getZoom() >= ALL_GAUGES_ZOOM;
    if (next === showAll) return;
    showAll = next;
    redraw();
  };

  // Fetched on first switch-on, then on each later switch-on (the backend caches for 10 min).
  layer.on('add', () => {
    legend.addTo(map);
    map.on('zoomend', onZoom);
    map.on('moveend', syncTabStops);
    showAll = map.getZoom() >= ALL_GAUGES_ZOOM;
    if (res) draw();
    api.getRain24h()
      .then((r) => {
        res = r && Array.isArray(r.stations) ? r : { source: RAIN24_CREDIT, stations: [], latest_observation_at: null, stale: true };
        if (map.hasLayer(layer)) redraw();
      })
      .catch((e) => {
        console.error('Failed to load 24 h rain:', e);
        res = res ? { ...res, stale: true } : { source: RAIN24_CREDIT, stations: [], latest_observation_at: null, stale: true };
        if (map.hasLayer(layer)) redraw();
      });
  });
  layer.on('remove', () => { map.off('zoomend', onZoom); map.off('moveend', syncTabStops); legend.remove(); });
  return layer;
}
