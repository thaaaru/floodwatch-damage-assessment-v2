// SPDX-License-Identifier: Apache-2.0

// 30-year rainfall context shared bits. No Leaflet import here, so server-rendered pages can use it.

import { COLORS } from '@/lib/mapColors';

export const RAIN_HISTORY_LABEL = 'Model data (ERA5 reanalysis via Open-Meteo), 1996–2025. Not rain-gauge measurements.';
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];

type RainBand = keyof typeof COLORS.rain;
export const PCT_BANDS: { max: number; label: string; key: RainBand }[] = [
  { max: 50, label: '<50%', key: 'lt50' },
  { max: 90, label: '50–90%', key: 'lt90' },
  { max: 110, label: '90–110%', key: 'normal' },
  { max: 150, label: '110–150%', key: 'lt150' },
  { max: Infinity, label: '>150%', key: 'gt150' },
];
export const pctBand = (pct: number) => (PCT_BANDS.find((b) => pct < b.max) ?? PCT_BANDS[PCT_BANDS.length - 1]).key;

export const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
};
