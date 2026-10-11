// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader';
import { ui } from '@/lib/ui';
import { NewsItem, NewsSourceStatus, formatColombo, formatRelativeTime } from '@/lib/newsService';

const SOURCE_CHIPS = ['SL Met', 'NewsFirst', 'IMD RSMC', 'GDACS'] as const;
const CHIP_LABEL: Record<string, string> = { 'IMD RSMC': 'IMD' };
// Official warning sources whose warnings/advisories get a coloured left edge.
const OFFICIAL = new Set(['SL Met', 'IMD RSMC', 'GDACS']);

const RECENT_DAYS = 7;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const colomboDay = (d: Date) =>
  d.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' }); // YYYY-MM-DD, Colombo

function dayLabel(key: string): string {
  const now = new Date();
  if (key === colomboDay(now)) return 'Today';
  if (key === colomboDay(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`; // "11 Oct 2026" (en-GB would give "Sept")
}

// Height of the site's sticky header + banner, so day headers stick below it.
function useStickyOffset(): number {
  const [top, setTop] = useState(0);
  useEffect(() => {
    const el = document.getElementById('site-sticky-header');
    if (!el) return;
    const update = () => setTop(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return top;
}

const STATUS_TEXT: Record<NewsSourceStatus['status'], string> = {
  ok: 'OK', empty: 'No current items', disabled: 'Not configured', error: 'Error',
};

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [sources, setSources] = useState<NewsSourceStatus[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<string>('all');
  const [showOlder, setShowOlder] = useState(false);
  const stickyTop = useStickyOffset();

  useEffect(() => {
    // Served from the backend's 15-minute snapshot; no mock items on failure.
    const fetchNews = async () => {
      try {
        const data = await api.getNews();
        setNews(data?.items ?? []);
        setSources(data?.sources ?? []);
        setFailed(!data?.items);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    };
    fetchNews();
    const id = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const bySource = useMemo(() => (source === 'all' ? news : news.filter((i) => i.source === source)), [news, source]);
  // Last 7 days by default; undated items stay visible so no warning is hidden.
  const cutoff = Date.now() - RECENT_DAYS * 86_400_000;
  const olderCount = bySource.filter((i) => i.publishedAt && Date.parse(i.publishedAt) < cutoff).length;
  const filtered = showOlder ? bySource : bySource.filter((i) => !i.publishedAt || Date.parse(i.publishedAt) >= cutoff);

  // Items arrive newest first, undated last; group by Colombo day.
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: NewsItem[] }[] = [];
    for (const item of filtered) {
      const key = item.publishedAt ? colomboDay(new Date(item.publishedAt)) : 'undated';
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: key === 'undated' ? 'Undated' : dayLabel(key), items: [] };
        out.push(g);
      }
      g.items.push(item);
    }
    return out;
  }, [filtered]);

  return (
    <div className={ui.page}>
      <PageHeader
        title="News & updates"
        subtitle="Weather, flood and cyclone updates for Sri Lanka from official sources and news outlets."
        width="max-w-2xl"
      />

      {/* max-w-2xl keeps summaries near 70 characters per line */}
      <main className={`max-w-2xl ${ui.container} text-base leading-[1.55]`}>
        {/* Source filter */}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by source">
          {['all', ...SOURCE_CHIPS].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              aria-pressed={source === s}
              className={`chip ${source === s ? 'chip-active' : ''}`}
            >
              {s === 'all' ? 'All' : CHIP_LABEL[s] ?? s}
            </button>
          ))}
          {!loading && (
            <span className={`ml-auto ${ui.meta}`} aria-live="polite">
              {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>

        {loading ? (
          <div className="mt-6 space-y-6" aria-busy="true">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-lg bg-slate-800 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="mt-10 text-slate-300">
            {failed ? 'News could not be loaded right now.' : `No items from the last ${showOlder ? 30 : RECENT_DAYS} days.`} Please check back later.
          </p>
        ) : (
          <div className={`mt-4 ${ui.card} ${ui.cardPad} pt-0 sm:pt-0`}>
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`day-${g.key}`}>
              <h2
                id={`day-${g.key}`}
                style={{ top: stickyTop }}
                className={`sticky z-10 -mx-3 sm:-mx-4 px-3 sm:px-4 py-2 bg-slate-800/95 backdrop-blur border-b border-slate-700 ${ui.h2}`}
              >
                {g.label}
              </h2>
              <ul className="divide-y divide-slate-700">
                {g.items.map((item) => <NewsRow key={item.id} item={item} />)}
              </ul>
            </section>
          ))}
          </div>
        )}

        {!loading && olderCount > 0 && (
          <button type="button" onClick={() => setShowOlder((v) => !v)} className="chip mt-4 w-full">
            {showOlder ? `Show last ${RECENT_DAYS} days only` : `Show older (${olderCount})`}
          </button>
        )}

        {/* Source status, collapsed */}
        {sources.length > 0 && (
          <details className={`mt-6 ${ui.card}`}>
            <summary className="focus-ring cursor-pointer select-none min-h-[44px] flex items-center px-3 sm:px-4 text-sm font-semibold text-slate-200 rounded-2xl">
              Sources and last checked
            </summary>
            <ul className={`px-3 sm:px-4 pb-4 ${ui.body} space-y-3`}>
              <li>Checked every 15 minutes. Times are Colombo time. Items older than 30 days are hidden.</li>
              {sources.map((s) => (
                <li key={s.source} className="border-t border-slate-700 pt-3">
                  <div className="flex flex-wrap justify-between gap-x-3">
                    <span className="font-medium text-white">{s.source}</span>
                    <span className={s.status === 'ok' ? 'text-emerald-300' : s.status === 'error' ? 'text-red-300' : 'text-slate-300'}>
                      {STATUS_TEXT[s.status]} · {s.itemCount} {s.itemCount === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                  <div className="text-slate-300">
                    Newest {s.newest ? formatColombo(s.newest) : '—'} · checked {formatColombo(s.lastChecked)}
                  </div>
                  {s.message && s.status !== 'ok' && <div className="text-slate-300 break-words">{s.message}</div>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
    </div>
  );
}

function NewsRow({ item }: { item: NewsItem }) {
  const flagged =
    OFFICIAL.has(item.source) && (item.kind === 'Warning' || item.kind === 'Advisory');
  // On an inner wrapper: the list's divide-y border colour would override it on the <li>.
  const edge = !flagged ? '' : item.severity === 'critical' ? 'border-l-4 border-red-500 pl-3' : 'border-l-4 border-amber-400 pl-3';

  return (
    <li className="py-3">
      <div className={edge}>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="focus-ring block rounded py-[11px] text-[17px] font-semibold leading-snug text-white hover:text-cyan-300 hover:underline line-clamp-2"
      >
        {item.title}
      </a>
      <div className={`flex flex-wrap items-center gap-x-2 ${ui.meta}`}>
        <span>{item.source}</span>
        {item.publishedAt && (
          <>
            <span aria-hidden="true">·</span>
            <time dateTime={item.publishedAt} title={`${formatColombo(item.publishedAt)} (Colombo)`}>
              {formatRelativeTime(item.publishedAt)}
            </time>
          </>
        )}
        {item.kind && (
          <>
            <span aria-hidden="true">·</span>
            <span className="rounded-md bg-slate-900 border border-slate-700 px-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-200">
              {item.kind}
            </span>
          </>
        )}
      </div>
      {item.summary && <p className="mt-1.5 text-slate-300 line-clamp-3">{item.summary}</p>}
      </div>
    </li>
  );
}
