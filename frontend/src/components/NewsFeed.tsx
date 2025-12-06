'use client';

import { useEffect, useState } from 'react';
import { NewsItem, getMockNews, formatRelativeTime } from '@/lib/newsService';

interface NewsFeedProps {
  maxItems?: number;
  compact?: boolean;
}

const categoryConfig: Record<NewsItem['category'], { icon: string; bgColor: string; textColor: string }> = {
  cyclone: { icon: '🌀', bgColor: 'bg-purple-100', textColor: 'text-purple-700' },
  flood: { icon: '🌊', bgColor: 'bg-blue-100', textColor: 'text-blue-700' },
  weather: { icon: '⛈️', bgColor: 'bg-slate-100', textColor: 'text-slate-700' },
  alert: { icon: '⚠️', bgColor: 'bg-amber-100', textColor: 'text-amber-700' },
  general: { icon: '📰', bgColor: 'bg-gray-100', textColor: 'text-gray-700' },
};

const severityConfig: Record<NonNullable<NewsItem['severity']>, { border: string; dot: string }> = {
  critical: { border: 'border-l-red-500', dot: 'bg-red-500' },
  warning: { border: 'border-l-amber-500', dot: 'bg-amber-500' },
  info: { border: 'border-l-blue-500', dot: 'bg-blue-500' },
};

export default function NewsFeed({ maxItems = 10, compact = false }: NewsFeedProps) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<NewsItem['category'] | 'all'>('all');

  useEffect(() => {
    const fetchNews = async () => {
      try {
        // Try API first, fall back to mock data
        const response = await fetch('/api/news');
        if (response.ok) {
          const data = await response.json();
          setNews(data);
        } else {
          setNews(getMockNews());
        }
      } catch {
        // Use mock data on error
        setNews(getMockNews());
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
    // Refresh every 10 minutes (server caches for 30 min anyway)
    const interval = setInterval(fetchNews, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const filteredNews = selectedCategory === 'all'
    ? news
    : news.filter(item => item.category === selectedCategory);

  const displayNews = filteredNews.slice(0, maxItems);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-slate-100 rounded-lg h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Category Filter - only show in non-compact mode */}
      {!compact && (
        <div className="flex gap-1 mb-3 flex-wrap">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2 py-1 text-xs rounded-md transition-all ${
              selectedCategory === 'all'
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All
          </button>
          {(['cyclone', 'flood', 'weather', 'alert'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-1 text-xs rounded-md transition-all flex items-center gap-1 ${
                selectedCategory === cat
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{categoryConfig[cat].icon}</span>
              <span className="capitalize">{cat}</span>
            </button>
          ))}
        </div>
      )}

      {/* News List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {displayNews.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            No news updates available
          </div>
        ) : (
          displayNews.map((item) => (
            <NewsCard key={item.id} item={item} compact={compact} />
          ))
        )}
      </div>

      {/* View More Link */}
      {filteredNews.length > maxItems && (
        <div className="pt-3 border-t border-slate-100 mt-3">
          <button className="text-sm text-brand-600 hover:text-brand-700 font-medium w-full text-center">
            View all {filteredNews.length} updates
          </button>
        </div>
      )}
    </div>
  );
}

function NewsCard({ item, compact }: { item: NewsItem; compact: boolean }) {
  const category = categoryConfig[item.category];
  const severity = item.severity ? severityConfig[item.severity] : severityConfig.info;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all ${
        compact ? 'p-2.5' : 'p-3'
      } border-l-4 ${severity.border}`}
    >
      <div className="flex items-start gap-2">
        {/* Category Badge */}
        <span
          className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-sm ${category.bgColor}`}
        >
          {category.icon}
        </span>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <h4 className={`font-medium text-slate-900 leading-tight ${compact ? 'text-sm' : 'text-sm'} line-clamp-2`}>
            {item.title}
          </h4>

          {/* Summary - only in non-compact mode */}
          {!compact && (
            <p className="text-xs text-slate-600 mt-1 line-clamp-2">
              {item.summary}
            </p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span>{item.sourceIcon}</span>
              <span>{item.source}</span>
            </span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span>{formatRelativeTime(item.publishedAt)}</span>
            {item.severity === 'critical' && (
              <>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <span className="flex items-center gap-1 text-red-600 font-medium">
                  <span className={`w-1.5 h-1.5 rounded-full ${severity.dot} animate-pulse`} />
                  Critical
                </span>
              </>
            )}
          </div>
        </div>

        {/* External Link Icon */}
        <svg
          className="w-4 h-4 text-slate-400 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </div>
    </a>
  );
}
