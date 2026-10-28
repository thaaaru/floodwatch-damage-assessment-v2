// SPDX-License-Identifier: Apache-2.0

// Every colour the home map draws with, per theme. Layer code reads these; it holds no hex.
// One hue family per meaning: warm = gauge/flood status, violet = rain above normal,
// earth = rain below normal, grey = normal rain. No imports: scripts/check-palette.mjs
// loads this file on its own and fails the build if a contrast check below fails.

export type Theme = 'light' | 'dark';
export type StatusKey = 'normal' | 'none' | 'alert' | 'minor' | 'major';
export type FloodKey = 'alert' | 'minor' | 'major';

export interface Badge { fill: string; border: string; borderWidth: number; ring?: string; text: string }
export interface Palette {
  land: string; water: string; coast: string;
  landcover?: string; // park/wood/scrub/farm fill; unset keeps the base flavour's
  river: string; riverOpacity: number; riverWeight: number; mainRiverWeight: number;
  label: string; labelHalo: string; waterLabel: string;
  rain: [Badge, Badge, Badge, Badge, Badge]; // <50, 50–90, 90–110, 110–150, >150 %
  status: Record<StatusKey, { fill: string; stroke: string }>;
  basin: Record<FloodKey, { fillOpacity: number; stroke: string; weight: number }>;
  basinIdle: string; // 1px outline when "Colour all basins" is on
  ui: { panel: string; border: string; text: string; muted: string; accent: string; shadow: string };
  trendBadge: { bg: string; border: string; glyph: string };
  pill: { bg: string; text: string; border: string };
}

// Values follow the approved prototype. Where it failed its own checks the colour was darkened
// just enough to pass; each is marked "was …".
export const PALETTES: Record<Theme, Palette> = {
  light: {
    land: '#F2F1EC', water: '#D6E6F0', coast: '#AEB8C2',
    landcover: '#F1F1EB', // 4% #E3E8DA over land: parks and forest add no visible patches
    river: '#7FA6C9', riverOpacity: 0.6, riverWeight: 1, mainRiverWeight: 1.5,
    label: '#222222', labelHalo: 'rgba(255, 255, 255, 0.92)', waterLabel: '#4F6F8E',
    rain: [
      { fill: '#7A3E0B', border: '#FFFFFF', borderWidth: 1.5, text: '#FFFFFF' },
      { fill: '#B07E2E', border: '#FFFFFF', borderWidth: 1.5, text: '#1A1A1A' },
      { fill: '#858A91', border: '#FFFFFF', borderWidth: 1.5, text: '#111111' }, // was #878C93 (2.99:1 on land)
      { fill: '#6F5BC0', border: '#FFFFFF', borderWidth: 1.5, text: '#FFFFFF' },
      { fill: '#3F1D8C', border: '#FFFFFF', borderWidth: 2, ring: '#3F1D8C', text: '#FFFFFF' },
    ],
    status: {
      normal: { fill: '#1B9E77', stroke: '#FFFFFF' },
      none: { fill: '#9E9E9E', stroke: '#FFFFFF' },
      alert: { fill: '#F2B705', stroke: '#6B5000' },
      minor: { fill: '#F57C00', stroke: '#7A3E00' },
      major: { fill: '#D7191C', stroke: '#6B0000' },
    },
    basin: {
      alert: { fillOpacity: 0.22, stroke: '#C99700', weight: 1.5 },
      minor: { fillOpacity: 0.28, stroke: '#E06F00', weight: 2 },
      major: { fillOpacity: 0.38, stroke: '#B30000', weight: 3 },
    },
    basinIdle: '#9AA3AD',
    ui: { panel: '#FFFFFF', border: '#DADDE1', text: '#1F2328', muted: '#5B636D', accent: '#1D5C8F', shadow: '0 2px 10px rgba(0, 0, 0, 0.14)' },
    trendBadge: { bg: '#FFFFFF', border: '#222222', glyph: '#1A1A1A' },
    pill: { bg: '#1A1A1A', text: '#FFFFFF', border: '#FFFFFF' },
  },
  dark: {
    land: '#2B3038', water: '#1D2A38', coast: '#4A5562',
    river: '#5C86AD', riverOpacity: 0.6, riverWeight: 1.1, mainRiverWeight: 1.7,
    label: '#ECECEC', labelHalo: 'rgba(0, 0, 0, 0.9)', waterLabel: '#7FA3C4',
    rain: [
      { fill: '#8C6239', border: '#C49A6C', borderWidth: 1.5, text: '#FFFFFF' },
      { fill: '#C9B08A', border: '#E6D5B8', borderWidth: 1.5, text: '#1A1A1A' },
      { fill: '#5F6670', border: '#8A929C', borderWidth: 1.5, text: '#FFFFFF' },
      { fill: '#7C6CAB', border: '#B9A9E8', borderWidth: 1.5, text: '#FFFFFF' }, // was #8E7CC3 (white text 3.61:1)
      { fill: '#C9A7FF', border: '#FFFFFF', borderWidth: 2, ring: '#C9A7FF', text: '#1A1033' },
    ],
    status: {
      normal: { fill: '#2BB673', stroke: '#0E1116' },
      none: { fill: '#8A929C', stroke: '#0E1116' },
      alert: { fill: '#FFD23F', stroke: '#3A2E00' },
      minor: { fill: '#FF8C1A', stroke: '#3D1E00' },
      major: { fill: '#FF3B30', stroke: '#3D0000' },
    },
    basin: {
      alert: { fillOpacity: 0.3, stroke: '#FFE07A', weight: 1.5 },
      minor: { fillOpacity: 0.45, stroke: '#FFB066', weight: 2 },
      major: { fillOpacity: 0.5, stroke: '#FF7A70', weight: 3 },
    },
    basinIdle: '#6B7480',
    ui: { panel: '#232831', border: '#3A414B', text: '#ECEDEF', muted: '#A3AAB3', accent: '#8FC1EA', shadow: '0 2px 10px rgba(0, 0, 0, 0.45)' },
    trendBadge: { bg: '#FFFFFF', border: '#222222', glyph: '#1A1A1A' },
    pill: { bg: '#1A1A1A', text: '#FFFFFF', border: '#FFFFFF' },
  },
};

export const MARKER_RING = '#FFFFFF';

export const RAIN_BANDS = [
  { max: 50, label: '<50%' },
  { max: 90, label: '50–90%' },
  { max: 110, label: '90–110%' },
  { max: 150, label: '110–150%' },
  { max: Infinity, label: '>150%' },
] as const;
export const rainBand = (pct: number) => {
  const i = RAIN_BANDS.findIndex((b) => pct < b.max);
  return i === -1 ? RAIN_BANDS.length - 1 : i;
};

// UI tokens as CSS custom properties, set on the map container so panels follow the theme.
export function cssVars(p: Palette): Record<string, string> {
  return {
    '--fw-panel': p.ui.panel, '--fw-panel-border': p.ui.border, '--fw-panel-text': p.ui.text,
    '--fw-panel-muted': p.ui.muted, '--fw-accent': p.ui.accent, '--fw-panel-shadow': p.ui.shadow,
    '--fw-label': p.label, '--fw-label-halo': p.labelHalo, '--fw-water-label': p.waterLabel,
    '--fw-trend-bg': p.trendBadge.bg, '--fw-trend-border': p.trendBadge.border, '--fw-trend-glyph': p.trendBadge.glyph,
    '--fw-pill-bg': p.pill.bg, '--fw-pill-text': p.pill.text, '--fw-pill-border': p.pill.border,
  };
}

// --- WCAG 2.x contrast (relative luminance) ---------------------------------
const channel = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = (hex: string) => {
  const [r, g, b] = (hex.replace('#', '').match(/\w\w/g) ?? []).map((x) => channel(parseInt(x, 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Acceptance checks; returns a message per failure (empty = pass). */
export function paletteFailures(): string[] {
  const out: string[] = [];
  const need = (ok: boolean, msg: string) => { if (!ok) out.push(msg); };
  for (const [theme, p] of Object.entries(PALETTES)) {
    const r = contrast(p.label, p.land);
    need(r >= 4.5, `${theme}: place label vs land ${r.toFixed(2)} < 4.5`);
    // Flood markers only (normal and no-threshold dots are deliberately quiet). Their edge is the
    // dark stroke plus a white outer ring (gauges.ts shapeSvg); one of the two must stand off the land.
    for (const k of ['alert', 'minor', 'major'] as const) {
      const m = Math.max(contrast(p.status[k].stroke, p.land), contrast(MARKER_RING, p.land));
      need(m >= 3, `${theme}: ${k} marker edge vs land ${m.toFixed(2)} < 3`);
    }
    p.rain.forEach((b, i) => {
      const m = Math.max(contrast(b.fill, p.land), contrast(b.border, p.land));
      need(m >= 3, `${theme}: rain ${RAIN_BANDS[i].label} badge vs land ${m.toFixed(2)} < 3`);
      const t = contrast(b.text, b.fill);
      need(t >= 4.5, `${theme}: rain ${RAIN_BANDS[i].label} text vs fill ${t.toFixed(2)} < 4.5`);
    });
  }
  return out;
}
