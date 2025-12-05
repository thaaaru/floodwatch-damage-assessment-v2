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
      id: 'nbro-landslide-dec5',
      title: 'NBRO Red Alert: Critical Landslide Warning for 4 Districts',
      summary: 'Level 3 evacuation alerts issued for Kandy, Nuwara Eliya, Ratnapura, Kegalle. Highland areas recorded 500mm+ rainfall. 40 DS Divisions affected.',
      source: 'NBRO',
      sourceIcon: '🚨',
      url: 'https://www.nbro.gov.lk',
      publishedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
      category: 'alert',
      severity: 'critical',
    },
    {
      id: 'irrigation-malwathu-dec5',
      title: 'Flood Alert for Thanthrimale - Malwathu Oya Rising',
      summary: 'Irrigation Department issues flood alert for Thanthrimale area due to rising water levels in Malwathu Oya. Highest rainfall 120.8mm in Panadugama.',
      source: 'Irrigation Dept',
      sourceIcon: '💧',
      url: 'https://www.newswire.lk/2025/12/05/flood-alert-issued-for-thanthrimale-as-malwathu-oya-water-levels-rise/',
      publishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      category: 'flood',
      severity: 'warning',
    },
    {
      id: 'dmc-ditwah-recovery',
      title: 'Recovery Continues After Cyclone Ditwah Devastation',
      summary: '486 deaths confirmed, 170,000 in relief centers. Major river basins (Mahaweli, Kelani, Malwathu Oya, Mundeni Aru) severely flooded. Worst disaster since 2004 tsunami.',
      source: 'DMC',
      sourceIcon: '🇱🇰',
      url: 'https://www.aljazeera.com/news/2025/12/5/more-heavy-rain-slows-sri-lankas-recovery-after-deadly-cyclone',
      publishedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
      category: 'flood',
      severity: 'critical',
    },
    {
      id: 'slmet-continued-rain',
      title: 'Continued Heavy Rainfall Hampers Recovery Efforts',
      summary: 'More heavy rain slows cleanup and reconstruction after Cyclone Ditwah. Over 50,000 homes damaged across 25 districts.',
      source: 'Sri Lanka Met',
      sourceIcon: '🇱🇰',
      url: 'https://www.meteo.gov.lk',
      publishedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
      category: 'weather',
      severity: 'warning',
    },
    {
      id: 'dmc-river-status',
      title: 'River Water Levels Monitoring Update',
      summary: 'Most river levels remain normal as of 6:30 AM. Continued monitoring of Mahaweli, Kelani, and northern river basins.',
      source: 'DMC',
      sourceIcon: '⚠️',
      url: 'https://www.dmc.gov.lk',
      publishedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
      category: 'flood',
      severity: 'info',
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
