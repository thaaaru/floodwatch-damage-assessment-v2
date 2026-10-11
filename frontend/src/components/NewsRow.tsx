// SPDX-License-Identifier: Apache-2.0

import { ui } from '@/lib/ui';
import { NewsItem, formatColombo, formatRelativeTime } from '@/lib/newsService';

// Official warning sources whose warnings/advisories get a coloured left edge.
const OFFICIAL = new Set(['SL Met', 'IMD RSMC', 'GDACS']);

// compact: title + meta only, for the home page panel.
export default function NewsRow({ item, compact = false }: { item: NewsItem; compact?: boolean }) {
  const flagged =
    OFFICIAL.has(item.source) && (item.kind === 'Warning' || item.kind === 'Advisory');
  // On an inner wrapper: the list's divide-y border colour would override it on the <li>.
  const edge = !flagged ? '' : item.severity === 'critical' ? 'border-l-4 border-red-500 pl-3' : 'border-l-4 border-amber-400 pl-3';

  return (
    <li className={compact ? 'py-2' : 'py-3'}>
      <div className={edge}>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`focus-ring block rounded font-semibold leading-snug text-white hover:text-cyan-300 hover:underline ${
          compact ? 'py-1 text-sm line-clamp-1' : 'py-[11px] text-[17px] line-clamp-2'
        }`}
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
      {!compact && item.summary && <p className="mt-1.5 text-slate-300 line-clamp-3">{item.summary}</p>}
      </div>
    </li>
  );
}
