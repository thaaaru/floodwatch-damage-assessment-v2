import { NextResponse } from 'next/server';

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceIcon: string;
  url: string;
  publishedAt: string;
  category: 'cyclone' | 'flood' | 'weather' | 'alert' | 'general';
  severity?: 'info' | 'warning' | 'critical';
}

// Cache for news items - longer TTL to prevent hitting API limits
let newsCache: { items: NewsItem[]; fetchedAt: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes - reduces API calls significantly

// Track last fetch time per source to prevent hammering
const lastFetchTime: Record<string, number> = {};
const MIN_FETCH_INTERVAL = 30 * 60 * 1000; // 30 min minimum between fetches per source

function canFetchSource(source: string): boolean {
  const lastFetch = lastFetchTime[source] || 0;
  return Date.now() - lastFetch >= MIN_FETCH_INTERVAL;
}

function markSourceFetched(source: string): void {
  lastFetchTime[source] = Date.now();
}

// Cache for individual source results
let imdCache: { items: NewsItem[]; fetchedAt: number } | null = null;
let gdacsCache: { items: NewsItem[]; fetchedAt: number } | null = null;
let reliefwebCache: { items: NewsItem[]; fetchedAt: number } | null = null;

/**
 * Fetch cyclone info from IMD RSMC
 * Rate limited: max 1 request per 30 minutes
 */
async function fetchIMDCycloneNews(): Promise<NewsItem[]> {
  // Return cached data if we fetched recently
  if (imdCache && !canFetchSource('imd')) {
    return imdCache.items;
  }

  const items: NewsItem[] = [];

  try {
    markSourceFetched('imd');

    // Fetch RSMC New Delhi page for active cyclones
    const response = await fetch('https://rsmcnewdelhi.imd.gov.in/', {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'FloodWatch.lk/1.0 (Weather Monitoring Service)'
      }
    });

    if (!response.ok) {
      return imdCache?.items || items;
    }

    const html = await response.text();

    // Check for active cyclone mentions in the page
    const cycloneMatch = html.match(/Cyclonic Storm[^<]+"([^"]+)"/i) ||
                         html.match(/Depression[^<]+over[^<]+/i);

    if (cycloneMatch) {
      items.push({
        id: `imd-cyclone-${Date.now()}`,
        title: cycloneMatch[0].slice(0, 100),
        summary: 'Active cyclonic disturbance in North Indian Ocean. Check IMD RSMC for latest bulletins.',
        source: 'IMD RSMC',
        sourceIcon: '🇮🇳',
        url: 'https://rsmcnewdelhi.imd.gov.in/',
        publishedAt: new Date().toISOString(),
        category: 'cyclone',
        severity: 'warning',
      });
    }

    // Update source cache
    imdCache = { items, fetchedAt: Date.now() };
  } catch (error) {
    console.warn('IMD fetch error:', error);
    return imdCache?.items || items;
  }

  return items;
}

/**
 * Fetch from GDACS API
 * Rate limited: max 1 request per 30 minutes
 */
async function fetchGDACSAlerts(): Promise<NewsItem[]> {
  // Return cached data if we fetched recently
  if (gdacsCache && !canFetchSource('gdacs')) {
    return gdacsCache.items;
  }

  const items: NewsItem[] = [];

  try {
    markSourceFetched('gdacs');

    // GDACS RSS/API for South Asia region
    const response = await fetch(
      'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC,FL&country=LKA,IND,BGD,MMR&fromdate=' +
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      {
        signal: AbortSignal.timeout(10000),
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      return gdacsCache?.items || items;
    }

    const data = await response.json();

    if (data.features && Array.isArray(data.features)) {
      for (const feature of data.features.slice(0, 5)) {
        const props = feature.properties || {};
        const alertLevel = props.alertlevel || 'Green';

        items.push({
          id: `gdacs-${props.eventid || Date.now()}`,
          title: props.name || props.eventtype || 'GDACS Alert',
          summary: props.description || `${props.eventtype} event in ${props.country}`,
          source: 'GDACS',
          sourceIcon: '🔴',
          url: props.url || 'https://www.gdacs.org',
          publishedAt: props.fromdate || new Date().toISOString(),
          category: props.eventtype === 'TC' ? 'cyclone' : 'flood',
          severity: alertLevel === 'Red' ? 'critical' : alertLevel === 'Orange' ? 'warning' : 'info',
        });
      }
    }

    // Update source cache
    gdacsCache = { items, fetchedAt: Date.now() };
  } catch (error) {
    console.warn('GDACS fetch error:', error);
    return gdacsCache?.items || items;
  }

  return items;
}

/**
 * Fetch from ReliefWeb API
 * Rate limited: max 1 request per 30 minutes
 */
async function fetchReliefWebNews(): Promise<NewsItem[]> {
  // Return cached data if we fetched recently
  if (reliefwebCache && !canFetchSource('reliefweb')) {
    return reliefwebCache.items;
  }

  const items: NewsItem[] = [];

  try {
    markSourceFetched('reliefweb');

    const response = await fetch(
      'https://api.reliefweb.int/v1/reports?appname=floodwatch-lk&limit=5&filter[field]=primary_country.iso3&filter[value]=LKA&filter[field]=disaster_type.name&filter[value][]=Flood&filter[value][]=Tropical Cyclone&sort[]=date:desc',
      {
        signal: AbortSignal.timeout(10000),
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      return reliefwebCache?.items || items;
    }

    const data = await response.json();

    if (data.data && Array.isArray(data.data)) {
      for (const report of data.data) {
        const fields = report.fields || {};
        const disasterType = fields.disaster_type?.[0]?.name || 'Weather';

        items.push({
          id: `reliefweb-${report.id}`,
          title: fields.title || 'ReliefWeb Report',
          summary: fields.body?.slice(0, 200) || 'Humanitarian update for Sri Lanka',
          source: 'ReliefWeb',
          sourceIcon: '🌐',
          url: fields.url || 'https://reliefweb.int',
          publishedAt: fields.date?.created || new Date().toISOString(),
          category: disasterType.includes('Cyclone') ? 'cyclone' : disasterType.includes('Flood') ? 'flood' : 'weather',
          severity: 'info',
        });
      }
    }

    // Update source cache
    reliefwebCache = { items, fetchedAt: Date.now() };
  } catch (error) {
    console.warn('ReliefWeb fetch error:', error);
    return reliefwebCache?.items || items;
  }

  return items;
}

/**
 * Generate mock/fallback news
 */
function getMockNews(): NewsItem[] {
  const now = new Date();

  return [
    {
      id: 'mock-cyclone-1',
      title: 'Northeast monsoon active over Bay of Bengal',
      summary: 'Northeast monsoon conditions prevail over Sri Lanka. Showers expected in Eastern and Northern provinces.',
      source: 'SL Met',
      sourceIcon: '🇱🇰',
      url: 'https://www.meteo.gov.lk',
      publishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      category: 'weather',
      severity: 'info',
    },
    {
      id: 'mock-flood-1',
      title: 'Minor flood warning - Kelani River',
      summary: 'Water levels slightly elevated at Nagalagam Street gauge. Situation being monitored.',
      source: 'DMC',
      sourceIcon: '⚠️',
      url: 'https://www.dmc.gov.lk',
      publishedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
      category: 'flood',
      severity: 'warning',
    },
    {
      id: 'mock-weather-1',
      title: 'Heavy rainfall advisory for Western Province',
      summary: 'Heavy rainfall (>75mm) expected in Colombo, Gampaha, and Kalutara districts during next 24 hours.',
      source: 'SL Met',
      sourceIcon: '🇱🇰',
      url: 'https://www.meteo.gov.lk',
      publishedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
      category: 'weather',
      severity: 'warning',
    },
    {
      id: 'mock-general-1',
      title: 'Reservoir levels update',
      summary: 'Major reservoirs in wet zone at normal operating levels. No spill warnings issued.',
      source: 'Irrigation',
      sourceIcon: '💧',
      url: 'https://www.irrigation.gov.lk',
      publishedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      category: 'flood',
      severity: 'info',
    },
  ];
}

export async function GET() {
  try {
    // Check cache
    if (newsCache && (Date.now() - newsCache.fetchedAt) < CACHE_TTL) {
      return NextResponse.json(newsCache.items);
    }

    // Fetch from all sources in parallel
    const [imdNews, gdacsNews, reliefwebNews] = await Promise.all([
      fetchIMDCycloneNews(),
      fetchGDACSAlerts(),
      fetchReliefWebNews(),
    ]);

    // Combine all news
    let allNews = [...imdNews, ...gdacsNews, ...reliefwebNews];

    // Add mock/supplementary news if we don't have many items
    if (allNews.length < 3) {
      const mockNews = getMockNews();
      // Add mock news that don't duplicate existing categories
      const existingCategories = new Set(allNews.map(n => n.category));
      for (const mock of mockNews) {
        if (!existingCategories.has(mock.category) || allNews.length < 2) {
          allNews.push(mock);
        }
      }
    }

    // Sort by date (newest first)
    allNews.sort((a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    // Update cache
    newsCache = {
      items: allNews,
      fetchedAt: Date.now(),
    };

    return NextResponse.json(allNews);
  } catch (error) {
    console.error('News API error:', error);
    // Return mock data on error
    return NextResponse.json(getMockNews());
  }
}
