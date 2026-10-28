// SPDX-License-Identifier: Apache-2.0

// Official bulletins on the home map, shown as published and linked to the source PDF:
//   - "Official — DMC situation report (<date>)": people affected per district (circle area), off by default.
//   - "Official — NBRO landslide warnings": highest level per district (numbered hatched square), on while
//     a warning is in force. Expired warnings come back from the API with active=false and no warnings.
// No district boundary file ships with the app, so both mark district centres (lib/districts.ts).

import L from 'leaflet';
import { api } from '@/lib/api';
import { districts } from '@/lib/districts';
import { DOCK_LEGENDS, NARROW } from '@/lib/gauges';
import type { Palette } from '@/lib/mapPalette';

export interface MetAdvisory { type: 'land' | 'sea' | 'lightning' | 'tsunami' | 'heat'; title: string; url: string; issued_at: string | null }
export interface MetAdvisoryResponse { advisories: MetAdvisory[]; checked_at: string | null; source_status: string | null }

export interface SitrepDistrict {
  district: string;
  affected_families: number; affected_people: number; deaths: number; injured: number; missing: number;
  houses_fully_damaged: number; houses_partially_damaged: number;
  safe_locations: number; safe_location_families: number; safe_location_people: number;
}
export interface SitrepResponse {
  report_date: string | null; report_time?: string | null; report_url: string | null;
  districts: SitrepDistrict[]; totals: Omit<SitrepDistrict, 'district'> | null; parsed_ok: boolean;
}

export interface LandslideWarning { district: string; ds_division: string; level: 1 | 2 | 3 }
export interface LandslideResponse {
  issued_at: string | null; valid_until: string | null; report_url: string | null; message_id?: string | null;
  warnings: LandslideWarning[]; parsed_ok: boolean; active: boolean;
}

// NBRO's level names; the PDF prints the colour, the action word is NBRO's own meaning of each level.
export const LANDSLIDE_LEVELS = ['', 'Level 1 (Yellow) – Watch', 'Level 2 (Amber) – Alert', 'Level 3 (Red) – Evacuate'];

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const n = (v: number) => v.toLocaleString('en-US');

/** '2026-10-27T16:00:00+05:30' -> '27 Oct, 16:00' (Colombo); withYear adds the year. */
export function colomboTime(iso: string | null | undefined, withYear = false): string {
  if (!iso) return 'time not stated';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Colombo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    ...(withYear ? { year: 'numeric' } : {}),
  });
}
const colomboDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Colombo', day: 'numeric', month: 'short', year: 'numeric' });

const PANE = 'fw-official'; // z 600 (DMC circles): above basins, below rain-vs-normal (610), gauges (620), place labels (640)
const WARN_PANE = 'fw-official-warn'; // z 615 (landslide marks): above the modelled rain badges, below gauges
// Keep an opened popup clear of the layers button and zoom bar.
const POPUP = { className: 'fw-light-popup', autoPanPaddingTopLeft: L.point(60, 12), autoPanPaddingBottomRight: L.point(60, 12) };
const centre = (name: string) => districts.find((d) => d.name === name);
const pdfLink = (url: string | null, text: string) =>
  url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${text}</a>` : '';

function legendControl(open: boolean) {
  const control = new L.Control({ position: DOCK_LEGENDS });
  let el: HTMLElement | null = null;
  let html = '';
  control.onAdd = () => {
    el = L.DomUtil.create('details', 'fw-panel fw-bulletin-legend');
    if (open) el.setAttribute('open', '');
    el.innerHTML = html;
    L.DomEvent.disableClickPropagation(el);
    return el;
  };
  const setOpen = (on: boolean) => el?.toggleAttribute('open', on);
  return { control, set: (h: string) => { html = h; if (el) el.innerHTML = h; }, setOpen };
}

// --- DMC situation report ------------------------------------------------------

function sitrepPopup(d: SitrepDistrict, s: SitrepResponse): string {
  const row = (k: string, v: string) => `<div style="color:#6b7280">${k}</div><div style="font-weight:600">${v}</div>`;
  return `<div class="fw-gauge-popup" style="max-width:250px">
    <div style="font-weight:700;font-size:14px">${esc(d.district)}</div>
    <div style="color:#6b7280;font-size:11px;margin-bottom:6px">DMC situation report, ${esc(colomboTime(s.report_time ?? s.report_date, true))}</div>
    <div style="display:grid;grid-template-columns:auto auto;gap:3px 10px;font-size:11px">
      ${row('Affected', `${n(d.affected_people)} people (${n(d.affected_families)} families)`)}
      ${row('Deaths', n(d.deaths))}${row('Injured', n(d.injured))}${row('Missing', n(d.missing))}
      ${row('Houses damaged', `${n(d.houses_fully_damaged)} fully, ${n(d.houses_partially_damaged)} partially`)}
      ${row('Safe locations', `${n(d.safe_locations)} (${n(d.safe_location_people)} people)`)}
    </div>
    <div style="font-size:10px;color:#6b7280;margin-top:6px">Figures as reported by DMC · ${pdfLink(s.report_url, 'Report (PDF)')}</div>
  </div>`;
}

function createSitrepLayer(map: L.Map, s: SitrepResponse, getPal: () => Palette) {
  const layer = L.layerGroup();
  // The summary line stays in the dock while the overlay is off (collapsed), so the date and link are always one tap away.
  const legend = legendControl(false);
  const rows = s.parsed_ok ? s.districts.filter((d) => d.affected_people > 0 && centre(d.district)) : [];
  // Circle area ~ people affected; capped so a very large event stays readable.
  const radius = (people: number) => Math.min(32, 4 + Math.sqrt(people) * 0.3);
  const draw = () => {
    const pal = getPal();
    layer.clearLayers();
    if (map.hasLayer(layer)) [...rows].sort((a, b) => b.affected_people - a.affected_people).forEach((d) => {
      const c = centre(d.district)!;
      L.circleMarker([c.latitude, c.longitude], {
        pane: PANE, radius: radius(d.affected_people), color: pal.impact.stroke, weight: 1.5,
        fillColor: pal.impact.fill, fillOpacity: pal.impact.fillOpacity,
      })
        .bindTooltip(`<b>${esc(d.district)}</b>: ${n(d.affected_people)} people affected (as reported by DMC)`, { className: 'fw-gauge-tip' })
        .bindPopup(sitrepPopup(d, s), { ...POPUP, maxWidth: 270 })
        .addTo(layer);
    });
    const pal2 = pal.impact;
    const dot = (people: number) => {
      const r = radius(people);
      return `<span aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-right:4px;width:${r * 2}px;height:${r * 2}px;border-radius:50%;border:1.5px solid ${pal2.stroke};background:color-mix(in srgb, ${pal2.fill} ${Math.round(pal2.fillOpacity * 100)}%, transparent)"></span>`;
    };
    const t = s.totals;
    legend.set(`<summary>DMC situation report, ${esc(colomboTime(s.report_time ?? s.report_date, true))}</summary>
      ${s.parsed_ok && t ? `<div>People affected: ${dot(100)}100 ${dot(500)}500 ${dot(2000)}2,000</div>
        <p>As reported by DMC: ${n(t.affected_people)} people affected, ${n(t.deaths)} deaths, ${n(t.missing)} missing ·
        ${pdfLink(s.report_url, 'Report (PDF)')}</p>`
        : `<p>Figures could not be read from this report. ${pdfLink(s.report_url, 'Open the report (PDF)')}</p>`}`);
  };
  legend.control.addTo(map);
  draw();
  layer.on('add', () => { draw(); legend.setOpen(window.innerWidth >= NARROW); });
  layer.on('remove', () => { layer.clearLayers(); legend.setOpen(false); });
  return { layer, redraw: draw };
}

// --- NBRO landslide early warning --------------------------------------------------

export function landslideIcon(level: 1 | 2 | 3, pal: Palette, size = 22): string {
  const b = pal.landslide[level - 1];
  // Diagonal hatching = landslide, whatever the colour; flood gauges never use a square.
  return `<span class="fw-landslide-mark" style="display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;box-sizing:border-box;
    border-radius:3px;font:800 ${Math.round(size * 0.55)}px/1 system-ui,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,0.4);
    width:${size}px;height:${size}px;color:${b.text};border:2px solid ${b.border};
    background:repeating-linear-gradient(135deg, color-mix(in srgb, ${b.text} 22%, transparent) 0 2px, transparent 2px 6px), ${b.fill}"
    aria-hidden="true">${level}</span>`;
}

function landslidePopup(district: string, ws: LandslideWarning[], r: LandslideResponse): string {
  const levels = ([3, 2, 1] as const).map((lv) => {
    const names = ws.filter((w) => w.level === lv).map((w) => esc(w.ds_division));
    return names.length ? `<div style="margin-top:6px"><b>${LANDSLIDE_LEVELS[lv]}</b><br>${names.join(', ')} DS division${names.length > 1 ? 's' : ''}</div>` : '';
  }).join('');
  return `<div class="fw-gauge-popup" style="max-width:260px">
    <div style="font-weight:700;font-size:14px">${esc(district)}: landslide early warning</div>
    <div style="font-size:11px">${levels}</div>
    <div style="font-size:10px;color:#6b7280;margin-top:8px">NBRO, issued ${esc(colomboTime(r.issued_at))}${r.valid_until ? `, valid until ${esc(colomboTime(r.valid_until))}` : ''} ·
      ${pdfLink(r.report_url, 'Warning (PDF)')}</div>
  </div>`;
}

function createLandslideLayer(map: L.Map, r: LandslideResponse, getPal: () => Palette) {
  const layer = L.layerGroup();
  const legend = legendControl(window.innerWidth >= NARROW);
  const byDistrict = new Map<string, LandslideWarning[]>();
  (r.active ? r.warnings : []).forEach((w) => {
    if (centre(w.district)) byDistrict.set(w.district, [...(byDistrict.get(w.district) ?? []), w]);
  });
  const draw = () => {
    const pal = getPal();
    layer.clearLayers();
    byDistrict.forEach((ws, district) => {
      const c = centre(district)!;
      const top = Math.max(...ws.map((w) => w.level)) as 1 | 2 | 3;
      L.marker([c.latitude, c.longitude], {
        pane: WARN_PANE, zIndexOffset: top * 1000, keyboard: true,
        title: `${district}: ${LANDSLIDE_LEVELS[top]} landslide warning (NBRO)`,
        icon: L.divIcon({ className: 'fw-landslide-wrap', html: landslideIcon(top, pal), iconSize: [26, 26], iconAnchor: [13, 13] }),
      })
        .bindPopup(landslidePopup(district, ws, r), { ...POPUP, maxWidth: 280 })
        .addTo(layer);
    });
    const when = r.issued_at ? `Issued ${esc(colomboTime(r.issued_at))}${r.valid_until ? `, valid until ${esc(colomboTime(r.valid_until))}` : ''}` : '';
    legend.set(`<summary>NBRO landslide warnings</summary>
      ${r.active && byDistrict.size ? ([3, 2, 1] as const).map((lv) =>
        `<div class="fw-legend-row">${landslideIcon(lv, pal, 16)} ${LANDSLIDE_LEVELS[lv]}</div>`).join('') +
        '<div>Highest level in each district; tap for DS divisions.</div>'
        : r.parsed_ok || !r.report_url ? '<div>No landslide warning in force.</div>' : '<div>Warning levels could not be read from the latest bulletin.</div>'}
      <p>${when}${when ? ' · ' : ''}${pdfLink(r.report_url, r.active ? 'Warning (PDF)' : 'Latest bulletin (PDF)')}</p>`);
  };
  layer.on('add', () => { legend.control.addTo(map); draw(); });
  layer.on('remove', () => legend.control.remove());
  return { layer, redraw: () => { if (map.hasLayer(layer)) draw(); }, on: byDistrict.size > 0 };
}

/** Adds both overlays to the layers control once their data arrives. */
export function addBulletinOverlays(map: L.Map, control: L.Control.Layers, getPal: () => Palette, onRetheme: (f: () => void) => void) {
  if (!map.getPane(PANE)) map.createPane(PANE).style.zIndex = '600';
  if (!map.getPane(WARN_PANE)) map.createPane(WARN_PANE).style.zIndex = '615';
  const alive = () => !!map.getPane('mapPane'); // false once the map is removed
  api.getDmcSitrep()
    .then((s) => {
      if (!alive() || !s?.report_url) return;
      const { layer, redraw } = createSitrepLayer(map, s, getPal);
      onRetheme(redraw);
      const date = s.report_time ?? s.report_date;
      control.addOverlay(layer, `Official — DMC situation report (${date ? esc(colomboDate(date)) : 'date not stated'})`);
    })
    .catch((e) => console.error('Failed to load DMC situation report:', e));
  api.getLandslideWarnings()
    .then((r) => {
      if (!alive() || !r?.report_url) return;
      const { layer, redraw, on } = createLandslideLayer(map, r, getPal);
      onRetheme(redraw);
      control.addOverlay(layer, 'Official — NBRO landslide warnings');
      if (on) layer.addTo(map);
    })
    .catch((e) => console.error('Failed to load landslide warnings:', e));
}
