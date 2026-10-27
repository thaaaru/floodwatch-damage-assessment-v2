// SPDX-License-Identifier: Apache-2.0

// Every colour the home map draws with. One hue family per meaning, so no colour means two things:
// warm (yellow → orange → red) = gauge/flood status only, violet = rain above normal,
// muted earth = rain below normal, neutral grey = normal rain. No Leaflet import here.

export const COLORS = {
  basemap: '#1E2124', // approx. dark basemap land, for contrast checks
  river: '#4A6B8A',
  status: {
    normal: '#2BB673',
    alert: '#FFD23F',
    minor: '#FF8C1A',
    major: '#FF3B30',
    unknown: '#9AA0A6',
  },
  outline: '#0F172A', // marker edge and dark text on light fills
  glyph: '#FFFFFF',
  glyphOutline: '#000000',
  basinIdle: '#64748B', // outline of basins with no alert
  rain: {
    // fill, stroke (ring), label text, label halo
    lt50: { fill: '#8C6239', stroke: '#C49A6C', text: '#FFFFFF', halo: '#1A1A1A' },
    lt90: { fill: '#C9B08A', stroke: '#E6D5B8', text: '#1A1A1A', halo: '#FFFFFF' },
    normal: { fill: '#5F6670', stroke: '#8A929C', text: '#FFFFFF', halo: '#1A1A1A' },
    // spec #8E7CC3 gave white text 4.48:1 at 0.85 opacity; nudged darker to reach 4.66:1
    lt150: { fill: '#8A78C0', stroke: '#B9A9E8', text: '#FFFFFF', halo: '#1A1033' },
    gt150: { fill: '#C9A7FF', stroke: '#FFFFFF', text: '#1A1033', halo: '#FFFFFF' },
  },
  // glyph and legend values are mirrored in styles/globals.css (.fw-gauge-trend, .fw-*-legend)
  legend: { bg: 'rgba(30, 34, 40, 0.92)', text: '#E8EAED', rule: '#3A4048' },
} as const;
