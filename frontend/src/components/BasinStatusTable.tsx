// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useRef } from 'react';
import { GaugeStatus, IrrigationStation } from '@/lib/api';
import { BASIN_CREDIT, GAUGE_CREDIT, STATUS_COLOR, STATUS_LABEL, STATUS_TEXT, worstStatus } from '@/lib/gaugeStatus';
import { ui } from '@/lib/ui';

const ORDER: GaugeStatus[] = ['major', 'minor', 'alert', 'normal', 'unknown'];
const FLOODING: GaugeStatus[] = ['alert', 'minor', 'major'];
const ARROW = { rising: '↑', falling: '↓', steady: '→' } as const;
const fmtM = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toFixed(2)} m`);

const BASIN_NAME_SI: Record<string, string> = {
  'Aththanagalu Oya': 'අත්තනගලු ඔය',
  'Deduru Oya': 'දැදුරු ඔය',
  'Gal Oya': 'ගල් ඔය',
  'Gin Ganga': 'ගිං ගඟ',
  'Heda Oya': 'හැඩ ඔය',
  'Kalu Ganga': 'කළු ගඟ',
  'Kelani Ganga': 'කැලණි ගඟ',
  'Kirindi Oya': 'කිරිඳි ඔය',
  'Kumbukkan Oya': 'කුඹුක්කන් ඔය',
  'Ma Oya': 'මා ඔය',
  'Maduru Oya': 'මාදුරු ඔය',
  'Maha Oya': 'මහ ඔය',
  'Mahaweli Ganga': 'මහවැලි ගඟ',
  'Malwathu Oya': 'මල්වතු ඔය',
  'Mee Oya': 'මී ඔය',
  'Menik Ganga': 'මැණික් ගඟ',
  'Nilwala Ganga': 'නිල්වලා ගඟ',
  'Walawe Ganga': 'වලවේ ගඟ',
  'Yan Oya': 'යාන් ඔය',
};

function StatusPill({ status }: { status: GaugeStatus }) {
  return (
    <span className="px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap" style={{ background: STATUS_COLOR[status], color: STATUS_TEXT[status] }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function BasinTrend({ gauges }: { gauges: IrrigationStation[] }) {
  const rising = gauges.filter((g) => g.trend === 'rising').length;
  const trend = rising > 0
    ? { icon: '↑', label: `${rising} rising`, color: 'text-red-300' }
    : gauges.some((g) => g.trend === 'falling')
      ? { icon: '↓', label: 'falling', color: 'text-emerald-300' }
      : gauges.some((g) => g.trend === 'steady')
        ? { icon: '→', label: 'steady', color: 'text-sky-300' }
        : { icon: '—', label: 'unknown', color: 'text-slate-400' };

  return (
    <span className={`inline-flex items-center gap-1 font-semibold whitespace-nowrap ${trend.color}`} aria-label={`Basin trend: ${trend.label}`}>
      <span className="text-xl leading-none" aria-hidden="true">{trend.icon}</span>
      <span>{trend.label}</span>
    </span>
  );
}

// River status by basin (was the /rivers table). Open on wide screens or when linked as /#rivers;
// a one-line summary on phones.
export default function BasinStatusTable({ stations }: { stations: IrrigationStation[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current && (window.innerWidth >= 640 || window.location.hash === '#rivers')) ref.current.open = true;
  }, []);

  const basins = Object.entries(
    stations.reduce<Record<string, IrrigationStation[]>>((acc, g) => {
      (acc[g.basin ?? g.river ?? 'Unknown'] ??= []).push(g);
      return acc;
    }, {}),
  )
    .map(([basin, gauges]) => ({ basin, gauges, worst: (worstStatus(gauges) ?? 'unknown') as GaugeStatus }))
    .sort((a, b) => ORDER.indexOf(a.worst) - ORDER.indexOf(b.worst) || b.gauges.length - a.gauges.length);
  const onAlert = basins.filter((b) => FLOODING.includes(b.worst)).length;

  return (
    <section id="rivers" aria-labelledby="rivers-heading" className={`${ui.card} ${ui.cardPad} scroll-mt-32`}>
      <details ref={ref} className="group">
        <summary className="focus-ring rounded cursor-pointer list-none flex flex-wrap gap-x-3 gap-y-1 min-h-[44px] items-center">
          <h2 id="rivers-heading" className={ui.h2}>River status by basin</h2>
          {stations.length > 0 && (
            <span className={ui.meta}>
              {basins.length} basins ·{' '}
              {onAlert === 0 ? (
                <span className="text-emerald-300">all normal</span>
              ) : (
                <span className="text-amber-300">{onAlert} on alert</span>
              )}
            </span>
          )}
          <span className={`ml-auto ${ui.muted} group-open:hidden`} aria-hidden="true">Show ▾</span>
        </summary>

        {stations.length === 0 ? (
          <p className={`${ui.body} mt-3`}>No river gauge data yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-3 sm:mx-0 mt-3">
            <table className="w-full text-xs sm:text-sm min-w-[600px]">
              <thead>
                <tr className={ui.th}>
                  <th className="text-left py-2 px-2">Basin</th>
                  <th className="text-left py-2 px-2">Gauges (level, trend)</th>
                  <th className="text-center py-2 px-2">Trend</th>
                  <th className="text-center py-2 px-2">Stale</th>
                  <th className="text-center py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {basins.map((b) => (
                  <tr key={b.basin} className={`${ui.tr} align-top`}>
                    <td className="py-2 px-2 font-medium">
                      <span className="block">{b.basin}</span>
                      {Object.hasOwn(BASIN_NAME_SI, b.basin) && (
                        <span lang="si" className="block text-slate-300 font-normal">{BASIN_NAME_SI[b.basin]}</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-slate-300">
                      {b.gauges.map((g) => (
                        <span key={g.station} className="inline-block mr-3 whitespace-nowrap">
                          <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: STATUS_COLOR[g.status] }} />
                          {g.station} {fmtM(g.water_level_m)} {g.trend ? ARROW[g.trend] : ''}
                          {g.stale && <span className="text-red-300"> (stale)</span>}
                        </span>
                      ))}
                    </td>
                    <td className="text-center py-2 px-2"><BasinTrend gauges={b.gauges} /></td>
                    <td className="text-center py-2 px-2">{b.gauges.filter((g) => g.stale).length}</td>
                    <td className="text-center py-2 px-2"><StatusPill status={b.worst} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={`${ui.muted} mt-3`}>
          {GAUGE_CREDIT}. {BASIN_CREDIT}. Updated every 15 minutes. Stale = no reading for over 6 h.
        </p>
      </details>
    </section>
  );
}
