// SPDX-License-Identifier: Apache-2.0

/**
 * News & updates types. Items are fetched server-side every 15 minutes by the
 * backend (services/news_feed.py) and served from its snapshot at /api/news;
 * the browser never calls the sources. No mock or fallback items: if nothing
 * is available the page says so.
 */

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceIcon: string;
  url: string;
  /** Real publish time from the source; null when the source gives none. */
  publishedAt: string | null;
  category: 'cyclone' | 'flood' | 'weather' | 'alert' | 'general';
  severity?: 'info' | 'warning' | 'critical';
  /** What the source says this is; null when it doesn't say. */
  kind?: 'Warning' | 'Advisory' | 'Forecast' | 'News' | null;
}

export interface NewsSourceStatus {
  source: string;
  status: 'ok' | 'empty' | 'error' | 'disabled';
  lastChecked: string;
  itemCount: number;
  newest: string | null;
  message: string | null;
}

export interface NewsResponse {
  refreshedAt: string | null;
  sources: NewsSourceStatus[];
  items: NewsItem[];
}

/** Relative time, or '' when the item has no real date. */
export function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-GB', { timeZone: 'Asia/Colombo', month: 'short', day: 'numeric' });
}

export function formatColombo(dateString: string): string {
  return new Date(dateString).toLocaleString('en-GB', {
    timeZone: 'Asia/Colombo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
