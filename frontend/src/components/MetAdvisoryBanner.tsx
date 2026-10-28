// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { MetAdvisory } from '@/lib/bulletins'; // type only: that module loads Leaflet

const WINDOW_MS = 48 * 60 * 60 * 1000;
const issued = (iso: string) => new Date(iso).toLocaleString('en-GB', {
  timeZone: 'Asia/Colombo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
});
const DISMISS_KEY = 'fw-met-advisory-dismissed'; // holds the dismissed advisory's issue time

// Department of Meteorology land advisory issued in the last 48 h, above the map. Official wording stays in the
// PDF: the banner only names it and links out. Dismissal lasts for the browser session and that advisory only.
export default function MetAdvisoryBanner() {
  const [advisory, setAdvisory] = useState<MetAdvisory | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    try { setDismissed(window.sessionStorage.getItem(DISMISS_KEY)); } catch { /* storage unavailable: not remembered */ }
    api.getMetAdvisory()
      .then((r) => setAdvisory(r?.advisories?.find((a) =>
        a.type === 'land' && a.issued_at && Date.now() - Date.parse(a.issued_at) < WINDOW_MS) ?? null))
      .catch(() => setAdvisory(null));
  }, []);

  if (!advisory?.issued_at || dismissed === advisory.issued_at) return null;
  const dismiss = () => {
    setDismissed(advisory.issued_at);
    try { window.sessionStorage.setItem(DISMISS_KEY, advisory.issued_at!); } catch { /* not remembered */ }
  };
  return (
    <section aria-labelledby="met-advisory-heading" className="flex items-start gap-2 rounded-lg border border-amber-500 bg-amber-950/60 py-1.5 pl-3 pr-1 text-sm text-amber-50">
      <div className="min-w-0 flex-1 py-1.5">
        <h2 id="met-advisory-heading" className="inline font-semibold">Department of Meteorology: Severe weather advisory (land)</h2>
        {' '}— issued {issued(advisory.issued_at)}.{' '}
        <a href={advisory.url} target="_blank" rel="noopener noreferrer" className="focus-ring whitespace-nowrap font-semibold underline underline-offset-2">
          Read the advisory (PDF)
        </a>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss the Met Department advisory for this session"
        className="focus-ring flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-lg leading-none hover:bg-amber-900">
        <span aria-hidden="true">✕</span>
      </button>
    </section>
  );
}
