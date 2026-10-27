// SPDX-License-Identifier: Apache-2.0
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { api, CacheStatus } from '@/lib/api';

const STALE_AFTER_MS = 3 * 60 * 60 * 1000;
const POLL_MS = 5 * 60 * 1000;

const colomboDay = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: 'Asia/Colombo' });

// "13:17" in Colombo time, prefixed with "10 Oct " when it isn't today there.
function colomboTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: false });
  if (colomboDay(d) === colomboDay(new Date())) return time;
  return `${d.toLocaleDateString('en-GB', { timeZone: 'Asia/Colombo', day: 'numeric', month: 'short' })} ${time}`;
}

// Always-visible, non-dismissible one-line disclaimer + data freshness.
export default function StatusBanner() {
  const [status, setStatus] = useState<CacheStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const load = () =>
      api.getCacheStatus()
        // api.fetch swallows 5xx into [] for /weather paths; treat that as a failure.
        .then((s) => {
          if (!s || Array.isArray(s)) throw new Error('bad cache status');
          setStatus(s); setFailed(false);
        })
        .catch(() => setFailed(true));
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const last = status?.last_update ?? null;
  const delayed =
    failed ||
    status?.last_attempt_ok === false ||
    (last !== null && Date.now() - new Date(last).getTime() > STALE_AFTER_MS);

  let freshness: ReactNode;
  if (delayed) {
    freshness = (
      <span className="font-semibold text-red-700">
        Weather data delayed{last && <> · Last updated {colomboTime(last)}</>}
      </span>
    );
  } else if (!last) {
    freshness = <span>Checking weather data…</span>;
  } else {
    freshness = <span>Weather data · Last updated {colomboTime(last)}</span>;
  }

  const link = 'underline underline-offset-2 hover:text-amber-700';
  return (
    <aside aria-label="Disclaimer and data freshness" className="bg-amber-100 text-amber-950 text-xs sm:text-sm px-4 py-1.5 leading-snug">
      <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-x-6 gap-y-0.5 text-center sm:flex-row sm:text-left">
        <span>
          <strong>Unofficial.</strong> For warnings follow the{' '}
          <a href="https://www.dmc.gov.lk" target="_blank" rel="noopener noreferrer" className={link}>DMC</a> and the{' '}
          <a href="https://meteo.gov.lk" target="_blank" rel="noopener noreferrer" className={link}>Met Department</a>
        </span>
        <span data-testid="data-last-updated" className="shrink-0">{freshness}</span>
      </div>
    </aside>
  );
}
