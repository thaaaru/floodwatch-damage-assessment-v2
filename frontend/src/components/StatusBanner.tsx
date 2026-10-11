// SPDX-License-Identifier: Apache-2.0
'use client';

import { useEffect, useState } from 'react';
import { api, CacheStatus } from '@/lib/api';

const STALE_AFTER_MS = 3 * 60 * 60 * 1000;
const POLL_MS = 5 * 60 * 1000;

function formatColombo(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Colombo',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' (Colombo)';
}

// Always-visible, non-dismissible disclaimer + data freshness line.
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

  const lastUpdate = status?.last_update ? new Date(status.last_update).getTime() : null;
  const stale =
    failed ||
    (status !== null && (lastUpdate === null ||
      Date.now() - lastUpdate > STALE_AFTER_MS ||
      status.last_attempt_ok === false));

  return (
    <div role="note" className="bg-amber-100 text-amber-950 text-xs sm:text-sm px-4 py-1.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5 text-center">
      <span>
        <strong>Not an official warning service.</strong> For warnings, follow the Disaster Management Centre (DMC) and the Department of Meteorology.
      </span>
      <span data-testid="data-last-updated" className={stale ? 'font-semibold text-red-700' : 'text-amber-900'}>
        Data last updated: {status?.last_update ? formatColombo(status.last_update) : failed ? 'unavailable' : status ? 'never' : '…'}
        {stale && ' — data may be stale; latest fetch failed or is over 3 hours old.'}
      </span>
    </div>
  );
}
