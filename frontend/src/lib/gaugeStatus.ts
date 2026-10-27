// SPDX-License-Identifier: Apache-2.0

// Gauge status vocabulary shared by pages and maps. No Leaflet import here,
// so server-rendered pages can use it.

import { GaugeStatus, IrrigationStation } from '@/lib/api';

export const GAUGE_CREDIT = 'Water levels: Irrigation Department of Sri Lanka';
export const BASIN_CREDIT = 'River basins: Irrigation Department of Sri Lanka';

export const STATUS_COLOR: Record<GaugeStatus, string> = {
  major: '#dc2626',
  minor: '#f97316',
  alert: '#eab308',
  normal: '#16a34a',
  unknown: '#94a3b8',
};

// Text/glyph colour on a STATUS_COLOR background: white only reaches 4.5:1 on red.
export const STATUS_TEXT: Record<GaugeStatus, string> = {
  major: '#ffffff',
  minor: '#0f172a',
  alert: '#0f172a',
  normal: '#0f172a',
  unknown: '#0f172a',
};

export const STATUS_LABEL: Record<GaugeStatus, string> = {
  major: 'MAJOR FLOOD',
  minor: 'MINOR FLOOD',
  alert: 'ALERT',
  normal: 'NORMAL',
  unknown: 'NO THRESHOLD',
};

const STATUS_RANK: Record<GaugeStatus, number> = { major: 4, minor: 3, alert: 2, normal: 1, unknown: 0 };

export function worstStatus(gauges: IrrigationStation[]): GaugeStatus | null {
  if (!gauges.length) return null;
  return gauges.reduce((w, g) => (STATUS_RANK[g.status] > STATUS_RANK[w] ? g.status : w), 'unknown' as GaugeStatus);
}

export function trendArrow(trend: IrrigationStation['trend']): string {
  return trend === 'rising' ? '&uarr;' : trend === 'falling' ? '&darr;' : trend === 'steady' ? '&rarr;' : '';
}

export function colomboTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Colombo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
