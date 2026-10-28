'use client';

// SPDX-License-Identifier: Apache-2.0

// "Rivers to watch": the gauges that matter right now, beside the map. A fresh gauge is listed when it
// is at alert level or above, or rising; worst status first, then the soonest to reach its next level.
// Clicking a row zooms the map to that gauge and opens its popup.

import type { IrrigationStation } from '@/lib/api';
import { LEVEL_NAME, STATUS_COLOR, STATUS_LABEL, STATUS_TEXT, aboutHours } from '@/lib/gaugeStatus';
import { ui } from '@/lib/ui';

const SHOW = 8;
const RANK = { major: 3, minor: 2, alert: 1, normal: 0, unknown: 0 } as const;

export default function RiversToWatch({ gauges, onSelect }: { gauges: IrrigationStation[]; onSelect: (g: IrrigationStation) => void }) {
  const watch = gauges
    .filter((g) => !g.stale && g.lat != null && g.lon != null && (RANK[g.status] > 0 || g.trend === 'rising'))
    .sort((a, b) => RANK[b.status] - RANK[a.status]
      || (a.eta_next_threshold?.hours ?? Infinity) - (b.eta_next_threshold?.hours ?? Infinity)
      || (b.rise_rate_m_per_h ?? 0) - (a.rise_rate_m_per_h ?? 0));
  if (!gauges.length) return null;

  return (
    <section aria-labelledby="rivers-to-watch" className={`${ui.card} ${ui.cardPad}`}>
      <div className="flex items-baseline gap-3">
        <h2 id="rivers-to-watch" className={ui.h2}>Rivers to watch</h2>
        <a href="#rivers" className={`ml-auto ${ui.link} text-sm`}>All gauges →</a>
      </div>
      {watch.length === 0 ? (
        <p className={`${ui.body} mt-3`}>No gauge is at alert level or rising right now.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-700">
          {watch.slice(0, SHOW).map((g) => {
            const eta = g.eta_next_threshold;
            const rate = g.rise_rate_m_per_h;
            return (
              <li key={`${g.station}-${g.river}`}>
                <button type="button" onClick={() => onSelect(g)}
                  className="focus-ring flex w-full items-center gap-3 rounded py-2 text-left hover:bg-slate-700/40">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{g.station}</span>
                    <span className="block truncate text-xs text-slate-400">
                      {g.river}
                      {g.water_level_m != null && <> · {g.water_level_m.toFixed(2)} m</>}
                      {g.trend === 'rising' && <> · rising{rate ? ` ${Math.round(rate * 100)} cm/h` : ''}</>}
                    </span>
                    {eta && <span className="block text-xs text-amber-300">{LEVEL_NAME[eta.level]} in {aboutHours(eta.hours)} at this rate</span>}
                  </span>
                  <span className="shrink-0 rounded px-2 py-0.5 text-xs font-bold" style={{ background: STATUS_COLOR[g.status], color: STATUS_TEXT[g.status] }}>
                    {STATUS_LABEL[g.status]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {watch.length > SHOW && <p className={`${ui.muted} mt-2`}>{watch.length - SHOW} more in the river status table.</p>}
    </section>
  );
}
