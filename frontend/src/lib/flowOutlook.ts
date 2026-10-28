// SPDX-License-Identifier: Apache-2.0

// One line for the basin popup: the GloFAS modelled river-flow trend over the coming days, taken
// at the basin's gauge with the largest modelled flow (the most downstream one, so the best proxy
// for the basin). It is a model trend, so it is plain grey text and never a status colour.
// Data: /api/rivers/discharge-forecast/stations (Open-Meteo Flood API, one point per Irrigation
// gauge, keyed by station name, the same names the basin GeoJSON lists), fetched once, on the
// first basin popup.

import { api, DischargeForecastStations } from '@/lib/api';

type Forecast = NonNullable<NonNullable<DischargeForecastStations['stations']>[number]['forecast']>;

let forecastsPromise: Promise<Map<string, Forecast>> | null = null;
const loadForecasts = () => (forecastsPromise ??= api.getDischargeForecastStations().then((r) => new Map(
  (Array.isArray(r?.stations) ? r.stations : [])
    .filter((s) => s.forecast?.dates?.length)
    .map((s) => [s.station_name, s.forecast as Forecast]),
)).catch((e) => {
  forecastsPromise = null; // try again on the next popup
  throw e;
}));

const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Outlook sentence for one gauge's forecast, or null when the series is too short. Exported for checks. */
export function outlookText(f: Forecast, today = new Date().toISOString().slice(0, 10)): string | null {
  const q = f.river_discharge_m3s;
  let t = f.dates.indexOf(today);
  if (t < 0) t = f.dates.findIndex((d) => d > today); // series starts after today (should not happen)
  if (t < 0 || q[t] == null) return null;
  const end = Math.min(t + 7, q.length - 1);
  if (end - t < 2) return null;
  let peak = t;
  for (let i = t; i <= end; i++) if ((q[i] ?? -Infinity) > (q[peak] as number)) peak = i;
  const q0 = q[t] as number;
  const pct = q0 > 0 && q[end] != null ? Math.round(((q[end] as number) - q0) / q0 * 100) : null;
  const trend = pct === null ? 'trend unavailable'
    : Math.abs(pct) < 10 ? `roughly steady (${pct >= 0 ? '+' : ''}${pct}%)`
    : `${pct > 0 ? 'rising' : 'falling'} ${Math.abs(pct)}%`;
  return `${trend} over ${end - t} days, peak ${peak === t ? 'today' : `on ${dayLabel(f.dates[peak])}`}`;
}

/** Fills the basin popup's outlook slot; leaves it empty when no gauge in the basin has a forecast. */
export function fillFlowOutlook(el: HTMLElement, gauges: string[]): void {
  if (!gauges.length) return;
  loadForecasts()
    .then((byStation) => {
      const fs = gauges.map((g) => [g, byStation.get(g)] as const).filter((x): x is readonly [string, Forecast] => !!x[1]);
      if (!fs.length) return;
      const today = new Date().toISOString().slice(0, 10);
      const flow = (f: Forecast) => f.river_discharge_m3s[Math.max(0, f.dates.indexOf(today))] ?? 0;
      const [station, f] = fs.reduce((a, b) => (flow(b[1]) > flow(a[1]) ? b : a));
      const text = outlookText(f, today);
      if (!text || !el.isConnected) return;
      el.innerHTML = `<div style="font-size:11px;color:#374151;margin-top:6px"><b style="font-weight:600">Modelled river-flow outlook</b>
        (GloFAS, ~5 km grid): ${text}</div>
        <div style="font-size:9px;color:#9ca3af">Model trend near the ${station.replace(/[&<>"']/g, '')} gauge, not a measured level or a flood warning &middot; Open-Meteo Flood API</div>`;
    })
    .catch(() => { /* optional line: the popup stands without it */ });
}
