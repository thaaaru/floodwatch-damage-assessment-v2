/**
 * News Service for FloodWatch.lk
 * Aggregates weather/flood news from multiple sources
 */

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceIcon: string;
  url: string;
  publishedAt: string;
  category: 'cyclone' | 'flood' | 'weather' | 'alert' | 'general';
  severity?: 'info' | 'warning' | 'critical';
  imageUrl?: string;
}

// IMD Cyclone Bulletin Parser
async function fetchIMDCycloneNews(): Promise<NewsItem[]> {
  try {
    const response = await fetch('/api/news/imd', {
      next: { revalidate: 900 } // 15 min cache
    });
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

// Sri Lanka Met Department
async function fetchSLMetNews(): Promise<NewsItem[]> {
  try {
    const response = await fetch('/api/news/slmet', {
      next: { revalidate: 900 }
    });
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

// ReliefWeb Disaster Updates
async function fetchReliefWebNews(): Promise<NewsItem[]> {
  try {
    const response = await fetch('/api/news/reliefweb', {
      next: { revalidate: 1800 } // 30 min cache
    });
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

// GDACS (Global Disaster Alert and Coordination System)
async function fetchGDACSAlerts(): Promise<NewsItem[]> {
  try {
    const response = await fetch('/api/news/gdacs', {
      next: { revalidate: 600 } // 10 min cache
    });
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

/**
 * Fetch all news from multiple sources
 */
export async function fetchAllNews(): Promise<NewsItem[]> {
  const [imd, slmet, reliefweb, gdacs] = await Promise.all([
    fetchIMDCycloneNews(),
    fetchSLMetNews(),
    fetchReliefWebNews(),
    fetchGDACSAlerts(),
  ]);

  // Combine and sort by date
  const allNews = [...imd, ...slmet, ...reliefweb, ...gdacs];

  // Sort by published date (newest first)
  allNews.sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return allNews;
}

/**
 * Get mock news for development/fallback
 */
export function getMockNews(): NewsItem[] {
  const now = new Date();

  return [
    {
      id: 'imd-cyclone-1',
      title: 'Cyclone Ditwah moves over Arabian Sea',
      summary: 'Deep Depression over central Arabian Sea intensified into Cyclonic Storm "Ditwah". Currently located about 780km west of Mumbai.',
      source: 'IMD',
      sourceIcon: '🇮🇳',
      url: 'https://rsmcnewdelhi.imd.gov.in/',
      publishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      category: 'cyclone',
      severity: 'warning',
    },
    {
      id: 'slmet-1',
      title: 'Heavy rainfall expected in Western Province',
      summary: 'Met Department warns of heavy rainfall (>100mm) in Western and Sabaragamuwa provinces during next 24 hours.',
      source: 'Sri Lanka Met',
      sourceIcon: '🇱🇰',
      url: 'https://www.meteo.gov.lk',
      publishedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
      category: 'weather',
      severity: 'warning',
    },
    {
      id: 'dmc-1',
      title: 'Flood warning for Kelani River basin',
      summary: 'DMC issues amber alert for areas along Kelani River. Water levels rising due to upstream rainfall.',
      source: 'DMC',
      sourceIcon: '⚠️',
      url: 'https://www.dmc.gov.lk',
      publishedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
      category: 'flood',
      severity: 'warning',
    },
    {
      id: 'reliefweb-1',
      title: 'South Asia monsoon update - December 2024',
      summary: 'Northeast monsoon active over Sri Lanka and Tamil Nadu. Above normal rainfall expected through mid-December.',
      source: 'ReliefWeb',
      sourceIcon: '🌐',
      url: 'https://reliefweb.int',
      publishedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
      category: 'weather',
      severity: 'info',
    },
    {
      id: 'gdacs-1',
      title: 'Tropical Storm Alert - Bay of Bengal',
      summary: 'GDACS monitoring potential cyclonic development in Bay of Bengal. Low probability of significant impact on Sri Lanka.',
      source: 'GDACS',
      sourceIcon: '🔴',
      url: 'https://www.gdacs.org',
      publishedAt: new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString(),
      category: 'cyclone',
      severity: 'info',
    },
    {
      id: 'irrigation-1',
      title: 'Reservoir levels update',
      summary: 'Major reservoirs in wet zone at 75% capacity. Irrigation Dept monitoring Castlereagh and Maussakelle closely.',
      source: 'Irrigation Dept',
      sourceIcon: '💧',
      url: 'https://www.irrigation.gov.lk',
      publishedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      category: 'flood',
      severity: 'info',
    },
  ];
}

/**
 * Format relative time
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-LK', {
    month: 'short',
    day: 'numeric'
  });
}
