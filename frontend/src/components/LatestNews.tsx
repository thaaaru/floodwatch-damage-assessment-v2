// SPDX-License-Identifier: Apache-2.0

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ui } from '@/lib/ui';
import { NewsItem, formatRelativeTime } from '@/lib/newsService';
import NewsRow, { isOfficialWarning } from '@/components/NewsRow';

const SHOW = 6;
const WARNING_WINDOW_MS = 48 * 60 * 60 * 1000;
const ts = (i: NewsItem) => (i.publishedAt ? Date.parse(i.publishedAt) : 0);

// Newest items from the backend's 15-minute news snapshot, refreshed every 5 minutes.
// null = still loading.
export function useNews() {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  useEffect(() => {
    const load = () =>
      api.getNews().then((d) => setItems(d?.items ?? []), () => setItems((prev) => prev ?? []));
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return items;
}

// Official warnings/advisories from the last 48 h, pinned above the map so they don't sit among news.
const activeWarnings = (items: NewsItem[] | null) => {
  const now = Date.now();
  return (items ?? [])
    .filter((i) => isOfficialWarning(i) && now - ts(i) < WARNING_WINDOW_MS)
    .sort((a, b) => (b.severity === 'critical' ? 1 : 0) - (a.severity === 'critical' ? 1 : 0) || ts(b) - ts(a))
    .slice(0, 3);
};

export function ActiveWarnings({ items }: { items: NewsItem[] | null }) {
  const active = activeWarnings(items);
  if (active.length === 0) return null;
  return (
    <section aria-label="Active official warnings" className="space-y-2">
      {active.map((item) => {
        const critical = item.severity === 'critical';
        return (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`focus-ring flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-1.5 text-sm hover:underline ${
              critical ? 'border-red-500 bg-red-950/70 text-red-50' : 'border-amber-500 bg-amber-950/60 text-amber-50'
            }`}
          >
            <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${critical ? 'bg-red-600 text-white' : 'bg-amber-400 text-amber-950'}`}>
              {item.kind ?? 'Warning'}
            </span>
            <strong className="font-semibold">{item.title}</strong>
            <span className="text-xs opacity-80">
              {item.source}{item.publishedAt ? ` · ${formatRelativeTime(item.publishedAt)}` : ''}
            </span>
          </a>
        );
      })}
    </section>
  );
}

export default function LatestNews({ items }: { items: NewsItem[] | null }) {
  // Warnings already pinned in the strip above the map aren't repeated here.
  const pinned = new Set(activeWarnings(items).map((i) => i.id));
  const latest = (items ?? []).filter((i) => !pinned.has(i.id)).sort((a, b) => ts(b) - ts(a)).slice(0, SHOW);

  return (
    <section aria-labelledby="latest-news" className={`${ui.card} ${ui.cardPad}`}>
      <div className="flex items-baseline gap-3">
        <h2 id="latest-news" className={ui.h2}>Latest news &amp; warnings</h2>
        <Link href="/news" className={`ml-auto ${ui.link} text-sm`}>All news →</Link>
      </div>
      {items === null ? (
        <div className="mt-3 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-slate-900 animate-pulse" />)}</div>
      ) : latest.length === 0 ? (
        <p className={`${ui.body} mt-3`}>No news right now.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-700">{latest.map((item) => <NewsRow key={item.id} item={item} compact />)}</ul>
      )}
    </section>
  );
}
