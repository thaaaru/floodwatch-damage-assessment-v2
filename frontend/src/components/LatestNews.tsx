// SPDX-License-Identifier: Apache-2.0

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ui } from '@/lib/ui';
import { NewsItem } from '@/lib/newsService';
import NewsRow from '@/components/NewsRow';

const SHOW = 8;
const ts = (i: NewsItem) => (i.publishedAt ? Date.parse(i.publishedAt) : 0);

// Newest items from the backend's 15-minute news snapshot; the full list is on /news.
export default function LatestNews() {
  const [items, setItems] = useState<NewsItem[] | null>(null);

  useEffect(() => {
    const load = () =>
      api.getNews().then((d) => setItems(d?.items ?? []), () => setItems((prev) => prev ?? []));
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const latest = (items ?? []).slice().sort((a, b) => ts(b) - ts(a)).slice(0, SHOW);

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
        <ul className="divide-y divide-slate-700">{latest.map((item) => <NewsRow key={item.id} item={item} />)}</ul>
      )}
    </section>
  );
}
