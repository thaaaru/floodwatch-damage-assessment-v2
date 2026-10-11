// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useState } from 'react';
import { api, RainHistoryResponse, RainVsNormal } from '@/lib/api';
import { MONTHS, RAIN_HISTORY_LABEL, fmtDay } from '@/lib/rainHistory';
import { ui } from '@/lib/ui';

// "30-year rainfall context": monthly normals, this month so far, wettest days and the
// annual-total trend for one district. ERA5 model data from the backend DB.
export default function RainContext() {
  const [districts, setDistricts] = useState<RainVsNormal[]>([]);
  const [district, setDistrict] = useState('');
  const [data, setData] = useState<RainHistoryResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.getRainVsNormal()
      .then((res) => {
        const list = res?.districts ?? [];
        setDistricts(list);
        const ready = list.filter((d) => d.as_of);
        setDistrict((ready.find((d) => d.district === 'Colombo') ?? ready[0] ?? list[0])?.district ?? '');
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (!district) return;
    setData(null);
    api.getRainHistory(district).then(setData).catch(() => setFailed(true));
  }, [district]);

  const ready = districts.filter((d) => d.as_of);

  return (
    <section aria-labelledby="rain-context-heading" className={`${ui.card} ${ui.cardPad} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="rain-context-heading" className={ui.h2}>30-year rainfall context</h2>
          <p className={`${ui.meta} mt-1`}>{RAIN_HISTORY_LABEL}</p>
        </div>
        {districts.length > 0 && (
          <label className={`flex items-center gap-2 ${ui.body}`}>
            District
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="focus-ring min-h-[44px] rounded-lg border border-slate-600 bg-slate-900 px-3 text-white"
            >
              {districts.map((d) => (
                <option key={d.district} value={d.district} disabled={!d.as_of}>
                  {d.district}{d.as_of ? '' : ' (loading history)'}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {failed && <p className={ui.body}>Rainfall history could not be loaded right now.</p>}
      {!failed && districts.length > 0 && ready.length < districts.length && (
        <p className={ui.muted}>
          History is being filled in: {ready.length} of {districts.length} districts so far.
        </p>
      )}
      {!failed && districts.length > 0 && ready.length === 0 && (
        <p className={ui.body}>No rainfall history stored yet.</p>
      )}

      {data?.as_of && data.monthly_normals_mm && <Details d={data} />}
    </section>
  );
}

function Details({ d }: { d: RainHistoryResponse }) {
  const normals = d.monthly_normals_mm ?? [];
  const month = d.month ?? 1;
  const max = Math.max(...normals.map((n) => n ?? 0), d.mtd_mm ?? 0, 1);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className={`${ui.inset} p-3 lg:col-span-2`}>
        <h3 className="text-sm font-semibold text-white">Usual rain by month (1996–2025 average)</h3>
        {d.pct_of_normal != null && (
          <p className={`${ui.body} mt-1`}>
            {MONTHS[month - 1]} so far (1 to {fmtDay(d.as_of as string)}): <b className="text-white">{d.mtd_mm} mm</b>,{' '}
            {d.pct_of_normal}% of the usual {d.normal_to_date_mm} mm for these days.
          </p>
        )}
        <div
          role="img"
          aria-label={`Average monthly rain: ${normals.map((n, i) => `${MONTHS[i]} ${n ?? 'no data'} mm`).join(', ')}`}
          className="mt-3 flex items-end gap-1 sm:gap-2 h-40"
        >
          {normals.map((n, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
              <span className="text-[10px] sm:text-xs text-slate-300 mb-1">{n == null ? '' : Math.round(n)}</span>
              <div
                className={`w-full rounded-t ${i === month - 1 ? 'bg-cyan-400' : 'bg-slate-500'}`}
                style={{ height: `${((n ?? 0) / max) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-1 sm:gap-2 mt-1" aria-hidden="true">
          {MONTHS.map((m, i) => (
            <span key={m} className={`flex-1 text-center text-[10px] sm:text-xs ${i === month - 1 ? 'text-cyan-300 font-semibold' : 'text-slate-400'}`}>
              {m[0]}<span className="hidden sm:inline">{m.slice(1, 3)}</span>
            </span>
          ))}
        </div>
        <p className={`${ui.muted} mt-2`}>mm per month. Current month highlighted.</p>
      </div>

      <div className="space-y-4">
        <div className={`${ui.inset} p-3`}>
          <h3 className="text-sm font-semibold text-white">Wettest days since {d.first_date?.slice(0, 4)}</h3>
          <ol className={`${ui.body} mt-2 space-y-1`}>
            {(d.wettest_days ?? []).map((w) => (
              <li key={w.date} className="flex justify-between gap-3">
                <span>{fmtDay(w.date)}</span>
                <span className="font-mono text-white">{w.mm} mm</span>
              </li>
            ))}
          </ol>
        </div>
        <Trend d={d} />
      </div>
    </div>
  );
}

function Trend({ d }: { d: RainHistoryResponse }) {
  const pts = d.annual_totals ?? [];
  const t = d.trend;
  if (pts.length < 10 || !t) {
    return (
      <div className={`${ui.inset} p-3`}>
        <h3 className="text-sm font-semibold text-white">Yearly totals</h3>
        <p className={`${ui.body} mt-1`}>Not enough complete years yet.</p>
      </div>
    );
  }
  const W = 260, H = 70;
  const ys = pts.map((p) => p.mm);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const x0 = pts[0].year, x1 = pts[pts.length - 1].year;
  const sx = (x: number) => ((x - x0) / (x1 - x0 || 1)) * W;
  const sy = (y: number) => H - ((y - lo) / (hi - lo || 1)) * H;
  const perDecade = Math.round(t.slope_mm_per_year * 10);

  return (
    <div className={`${ui.inset} p-3`}>
      <h3 className="text-sm font-semibold text-white">Yearly totals {x0}–{x1}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16 mt-2" role="img"
        aria-label={`Yearly totals from ${Math.round(lo)} to ${Math.round(hi)} mm`}>
        <polyline fill="none" stroke="#94a3b8" strokeWidth="1.5"
          points={pts.map((p) => `${sx(p.year)},${sy(p.mm)}`).join(' ')} />
        {t.significant && (
          <line x1={sx(x0)} y1={sy(t.intercept + t.slope_mm_per_year * x0)} x2={sx(x1)}
            y2={sy(t.intercept + t.slope_mm_per_year * x1)} stroke="#22d3ee" strokeWidth="2" />
        )}
      </svg>
      <p className={`${ui.body} mt-1`}>
        {t.significant
          ? `Yearly rain ${perDecade > 0 ? 'rose' : 'fell'} by about ${Math.abs(perDecade)} mm per decade (95% range ${Math.round(t.ci_low * 10)} to ${Math.round(t.ci_high * 10)} mm per decade).`
          : 'No clear trend in yearly rain over this period.'}
      </p>
    </div>
  );
}
