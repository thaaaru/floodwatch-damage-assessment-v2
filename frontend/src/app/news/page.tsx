// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useState } from 'react';
import { NewsItem, getMockNews, formatRelativeTime } from '@/lib/newsService';

const categoryConfig: Record<NewsItem['category'], { icon: string; bgColor: string; textColor: string }> = {
  cyclone: { icon: '🌀', bgColor: 'bg-purple-100', textColor: 'text-purple-700' },
  flood: { icon: '🌊', bgColor: 'bg-blue-100', textColor: 'text-blue-700' },
  weather: { icon: '⛈️', bgColor: 'bg-slate-100', textColor: 'text-slate-700' },
  alert: { icon: '⚠️', bgColor: 'bg-amber-100', textColor: 'text-amber-700' },
  general: { icon: '📰', bgColor: 'bg-gray-100', textColor: 'text-gray-700' },
};

const severityConfig: Record<NonNullable<NewsItem['severity']>, { border: string; dot: string; badge: string }> = {
  critical: { border: 'border-l-red-500', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700' },
  warning: { border: 'border-l-amber-500', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  info: { border: 'border-l-blue-500', dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
};

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<NewsItem['category'] | 'all'>('all');

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const response = await fetch('/api/news');
        if (response.ok) {
          const data = await response.json();
          setNews(data);
        } else {
          setNews(getMockNews());
        }
      } catch {
        setNews(getMockNews());
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
  }, []);

  const filteredNews = selectedCategory === 'all'
    ? news
    : news.filter(item => item.category === selectedCategory);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="glass border-b border-slate-200 sticky top-0 z-10 shadow-md">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center gap-3 mb-4">
            <a href="/" className="text-slate-400 hover:text-slate-900 transition-colors flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </a>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">News & Updates</h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">Latest flood alerts and weather warnings for Sri Lanka</p>
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-all font-medium ${
                selectedCategory === 'all'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md'
                  : 'glass text-slate-700 hover:bg-white/90'
              }`}
            >
              All Updates
            </button>
            {(['alert', 'flood', 'weather', 'cyclone'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-all flex items-center gap-1.5 font-medium ${
                  selectedCategory === cat
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md'
                    : 'glass text-slate-700 hover:bg-white/90'
                }`}
              >
                <span>{categoryConfig[cat].icon}</span>
                <span className="capitalize">{cat}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-8 py-6 sm:py-8">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse glass rounded-xl h-32 shadow-sm" />
            ))}
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="glass rounded-2xl text-center py-16 shadow-md">
            <div className="text-6xl mb-4">📰</div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">No updates available</h3>
            <p className="text-slate-600">Check back later for the latest news and alerts.</p>
          </div>
        ) : (
          <>
            {/* Featured Story - First Item */}
            {filteredNews.length > 0 && (
              <div className="glass rounded-2xl overflow-hidden shadow-lg mb-6 border border-white/20">
                <a
                  href={filteredNews[0].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <div className="relative bg-gradient-to-br from-blue-600 to-cyan-500 p-8 sm:p-12">
                    <div className="absolute top-4 right-4">
                      <span className="px-3 py-1.5 rounded-full text-xs font-bold uppercase bg-white/20 text-white backdrop-blur-sm">
                        Featured Story
                      </span>
                    </div>
                    <div className="max-w-3xl">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-4xl">{categoryConfig[filteredNews[0].category].icon}</span>
                        <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-white/20 text-white backdrop-blur-sm">
                          {filteredNews[0].category}
                        </span>
                        {filteredNews[0].severity && (
                          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-white/20 text-white backdrop-blur-sm">
                            {filteredNews[0].severity}
                          </span>
                        )}
                      </div>
                      <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4 leading-tight group-hover:underline">
                        {filteredNews[0].title}
                      </h2>
                      <p className="text-base sm:text-lg text-white/90 mb-6 leading-relaxed">
                        {filteredNews[0].summary}
                      </p>
                      <div className="flex items-center gap-3 text-sm text-white/80">
                        <span className="flex items-center gap-1.5">
                          <span className="text-xl">{filteredNews[0].sourceIcon}</span>
                          <span className="font-medium">{filteredNews[0].source}</span>
                        </span>
                        <span>•</span>
                        <span>{formatRelativeTime(filteredNews[0].publishedAt)}</span>
                      </div>
                    </div>
                  </div>
                </a>
              </div>
            )}

            {/* News Grid - 3 columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredNews.slice(1).map((item) => (
                <NewsCard key={item.id} item={item} />
              ))}
            </div>
          </>
        )}

        {/* Source Attribution */}
        <div className="mt-12 p-6 glass rounded-2xl shadow-md">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Official Sources</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <a
              href="https://www.nbro.gov.lk"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-slate-600 hover:text-cyan-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span>NBRO - National Building Research Organisation</span>
            </a>
            <a
              href="https://www.dmc.gov.lk"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-slate-600 hover:text-cyan-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span>DMC - Disaster Management Centre</span>
            </a>
            <a
              href="https://www.meteo.gov.lk"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-slate-600 hover:text-cyan-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span>Met Department - Meteorological Department</span>
            </a>
            <a
              href="https://www.irrigation.gov.lk"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-slate-600 hover:text-cyan-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span>Irrigation Department - River Monitoring</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const category = categoryConfig[item.category];
  const severity = item.severity ? severityConfig[item.severity] : severityConfig.info;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-xl glass hover:shadow-lg transition-all p-4 sm:p-6 border-l-4 ${severity.border} group`}
    >
      <div className="flex items-start gap-4">
        {/* Category Badge */}
        <div className={`flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center text-2xl ${category.bgColor}`}>
          {category.icon}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex flex-wrap items-start gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${category.bgColor} ${category.textColor}`}>
              {item.category}
            </span>
            {item.severity && (
              <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${severity.badge}`}>
                {item.severity}
              </span>
            )}
            <span className="text-xs text-slate-500 ml-auto">{formatRelativeTime(item.publishedAt)}</span>
          </div>

          {/* Title */}
          <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight mb-2">
            {item.title}
          </h3>

          {/* Summary */}
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-3">
            {item.summary}
          </p>

          {/* Meta */}
          <div className="flex items-center gap-3 text-xs sm:text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="text-base">{item.sourceIcon}</span>
              <span className="font-medium">{item.source}</span>
            </span>
            <span className="flex items-center gap-1 text-cyan-600 group-hover:text-cyan-700 font-medium">
              <span>Read more</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}
