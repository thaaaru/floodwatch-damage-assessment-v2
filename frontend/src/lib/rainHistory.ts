// SPDX-License-Identifier: Apache-2.0

// 30-year rainfall context shared bits. No Leaflet import here, so server-rendered pages can use it.

export const RAIN_HISTORY_LABEL = 'Model data (ERA5 reanalysis via Open-Meteo), 1996–2025. Not rain-gauge measurements.';
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];

export const PCT_BANDS: { max: number; label: string; color: string }[] = [
  { max: 50, label: '<50%', color: '#b45309' },
  { max: 90, label: '50–90%', color: '#fcd34d' },
  { max: 110, label: '90–110%', color: '#e2e8f0' },
  { max: 150, label: '110–150%', color: '#60a5fa' },
  { max: Infinity, label: '>150%', color: '#1d4ed8' },
];
export const pctColor = (pct: number) => (PCT_BANDS.find((b) => pct < b.max) ?? PCT_BANDS[PCT_BANDS.length - 1]).color;

export const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
};
