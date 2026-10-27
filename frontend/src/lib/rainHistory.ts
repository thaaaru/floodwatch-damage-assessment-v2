// SPDX-License-Identifier: Apache-2.0

// 30-year rainfall context shared bits. No Leaflet import here, so server-rendered pages can use it.

export const RAIN_HISTORY_LABEL = 'Model data (ERA5 reanalysis via Open-Meteo), 1996–2025. Not rain-gauge measurements.';
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];

export const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
};
