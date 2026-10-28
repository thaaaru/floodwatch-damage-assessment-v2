// SPDX-License-Identifier: Apache-2.0

// Every colour the home map draws with, per theme. Layer code reads these; it holds no hex.
// One hue family per meaning: warm = gauge/flood status, blue = rain (more rain = more opaque). No imports: scripts/check-palette.mjs
// loads this file on its own and fails the build if a contrast check below fails.

export type Theme = 'light' | 'dark';
export type StatusKey = 'normal' | 'none' | 'alert' | 'minor' | 'major';
export type FloodKey = 'alert' | 'minor' | 'major';

export interface Badge { fill: string; alpha: number; border: string; borderWidth: number; ring?: string; text: string }
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
    // Protomaps "light" flavour land with its green landcover, cyan sea and blue rivers (user's reference).
    land: '#E2DFDA', water: '#9DDAEA', coast: '#7FB8C9',
    river: '#2563EB', riverOpacity: 0.7, riverWeight: 1, mainRiverWeight: 1.5,
    label: '#222222', labelHalo: 'rgba(255, 255, 255, 0.92)', waterLabel: '#4F6F8E',
    rain: [ // one blue, opacity grows with % of normal
      { fill: '#1E40AF', alpha: 0.12, border: '#1E3A8A', borderWidth: 1.5, text: '#0F172A' },
      { fill: '#1E40AF', alpha: 0.3, border: '#1E3A8A', borderWidth: 1.5, text: '#0F172A' },
      { fill: '#1E40AF', alpha: 0.5, border: '#1E3A8A', borderWidth: 1.5, text: '#0F172A' },
      { fill: '#1E40AF', alpha: 0.75, border: '#1E3A8A', borderWidth: 1.5, text: '#FFFFFF' },
      { fill: '#1E40AF', alpha: 1, border: '#FFFFFF', borderWidth: 2, ring: '#1E3A8A', text: '#FFFFFF' },
    ],
    status: {
      normal: { fill: '#16A34A', stroke: '#FFFFFF' },
      none: { fill: '#94A3B8', stroke: '#FFFFFF' },
      alert: { fill: '#EAB308', stroke: '#854D0E' },
      minor: { fill: '#F97316', stroke: '#9A3412' },
      major: { fill: '#DC2626', stroke: '#7F1D1D' },
    },
    basin: {
      alert: { fillOpacity: 0.35, stroke: '#EAB308', weight: 2 },
      minor: { fillOpacity: 0.35, stroke: '#F97316', weight: 2 },
      major: { fillOpacity: 0.35, stroke: '#DC2626', weight: 3 },
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
    rain: [ // one blue, opacity grows with % of normal
      { fill: '#2563EB', alpha: 0.15, border: '#93C5FD', borderWidth: 1.5, text: '#FFFFFF' },
      { fill: '#2563EB', alpha: 0.3, border: '#93C5FD', borderWidth: 1.5, text: '#FFFFFF' },
      { fill: '#2563EB', alpha: 0.5, border: '#93C5FD', borderWidth: 1.5, text: '#FFFFFF' },
      { fill: '#2563EB', alpha: 0.75, border: '#93C5FD', borderWidth: 1.5, text: '#FFFFFF' },
      { fill: '#2563EB', alpha: 1, border: '#FFFFFF', borderWidth: 2, ring: '#93C5FD', text: '#FFFFFF' },
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
/** `hex` at `alpha` composited over `bg`, as a hex colour. */
export const over = (hex: string, alpha: number, bg: string) => {
  const [f, g] = [hex, bg].map((h) => (h.replace('#', '').match(/\w\w/g) ?? []).map((x) => parseInt(x, 16)));
  return '#' + f.map((v, i) => Math.round(v * alpha + g[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');
};
/** `hex` as a CSS rgba() at `alpha`. */
export const rgba = (hex: string, alpha: number) => {
  const [r, g, b] = (hex.replace('#', '').match(/\w\w/g) ?? []).map((x) => parseInt(x, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
      const seen = over(b.fill, b.alpha, p.land); // badge as drawn on land
      const m = Math.max(contrast(seen, p.land), contrast(b.border, p.land));
      need(m >= 3, `${theme}: rain ${RAIN_BANDS[i].label} badge vs land ${m.toFixed(2)} < 3`);
      const t = contrast(b.text, seen);
      need(t >= 4.5, `${theme}: rain ${RAIN_BANDS[i].label} text vs fill ${t.toFixed(2)} < 4.5`);
    });
  }
  return out;
}
