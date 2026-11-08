// SPDX-License-Identifier: Apache-2.0
'use client';

import { useEffect, useState } from 'react';
import { api, DataHealth } from '@/lib/api';
import { colomboTime } from '@/lib/gaugeStatus';
import { ui } from '@/lib/ui';

const NAMES = { met: 'Met Dept stations', nbro: 'NBRO rain gauges', rivers: 'River gauges', era5: 'ERA5 rainfall history' };
// Icon + word, never colour alone.
const STATUS = {
  ok: { icon: '✓', label: 'OK', cls: 'text-emerald-300' },
  warn: { icon: '!', label: 'Check', cls: 'text-amber-300' },
  fail: { icon: '✕', label: 'No data', cls: 'text-red-300' },
};

export default function DataHealthPanel() {
  const [data, setData] = useState<DataHealth | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api.getDataHealth().then(setData).catch(() => setFailed(true)); }, []);

  if (failed) return <p className={ui.body}>Could not load the data check. Try again later.</p>;
  if (!data) return <p className={ui.body}>Loading data check…</p>;

  return (
    <div className="space-y-3">
      <ul className="grid gap-2 sm:grid-cols-2">
        {data.sources.map((s) => {
          const st = STATUS[s.status];
          const age = s.source === 'era5'
            ? (s.lag_days != null ? `${s.lag_days} days behind` : '')
            : (s.latest ? `latest ${colomboTime(s.latest)}` : '');
          return (
            <li key={s.source} className={`${ui.inset} p-2.5`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-white">{NAMES[s.source]}</span>
                <span className={`text-xs font-semibold ${st.cls}`}><span aria-hidden="true">{st.icon} </span>{st.label}</span>
              </div>
              <p className={`${ui.meta} mt-1`}>
                {s.count} {s.source === 'era5' ? 'districts' : 'stations'}{s.stale_count ? `, ${s.stale_count} silent` : ''}{age ? ` · ${age}` : ''}
              </p>
              {s.issues.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs text-amber-200">
                  {s.issues.slice(0, 4).map((i) => <li key={i}>{i}</li>)}
                  {s.issues.length > 4 && <li>and {s.issues.length - 4} more</li>}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {data.disagreements.length > 0 && (
        <div className={ui.body}>
          <p className="font-medium text-white">Met station far wetter than every NBRO gauge within 10 km:</p>
          <ul className="mt-1 list-disc pl-4 text-xs">
            {data.disagreements.map((d) => (
              <li key={d.met}>{d.met}: {d.met_mm} mm since 08:30, but {d.nbro} has {d.nbro_24h_mm} mm in 24 h</li>
            ))}
          </ul>
        </div>
      )}
      <p className={ui.muted}>
        Checked {data.checked_at ? colomboTime(data.checked_at) : '—'}, every 30 minutes: how old each source is, impossible
        values (below 0 or above 600 mm a day), readings frozen for 6 hours, and Met stations against nearby NBRO gauges.
        It flags problems; it does not change the data.
      </p>
    </div>
  );
}
