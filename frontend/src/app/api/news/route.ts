// SPDX-License-Identifier: Apache-2.0

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
let slMetCache: { items: NewsItem[]; fetchedAt: number } | null = null;
let newsFirstCache: { items: NewsItem[]; fetchedAt: number } | null = null;
// bbcWeatherCache removed (only fetched a fixed Dec-2025 article URL).
// internationalNewsCache removed (it served hard-coded stale data, not real fetches).

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

    // Skip GDACS during build to avoid API errors
    // GDACS API is unreliable and often returns empty/malformed responses
    if (process.env.NODE_ENV === 'production' && !process.env.VERCEL_ENV) {
      return gdacsCache?.items || items;
    }

    // GDACS RSS/API for South Asia region
    const response = await fetch(
      'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC,FL&country=LKA,IND,BGD,MMR&fromdate=' +
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      {
        signal: AbortSignal.timeout(5000),
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      return gdacsCache?.items || items;
    }

    // Check if response has content before parsing JSON
    const contentLength = response.headers.get('content-length');
    if (!contentLength || contentLength === '0') {
      return gdacsCache?.items || items;
    }

    let data;
    try {
      const text = await response.text();
      if (!text || text.trim().length === 0) {
        return gdacsCache?.items || items;
      }
      data = JSON.parse(text);
    } catch {
      // Silent failure - GDACS is optional
      return gdacsCache?.items || items;
    }

    if (data && data.features && Array.isArray(data.features)) {
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
  } catch {
    // Silent failure - GDACS is optional
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
 * Fetch weather updates from Sri Lanka Met Department
 * This is the primary source for local weather news
 */
async function fetchSLMetNews(): Promise<NewsItem[]> {
  // Return cached data if we fetched recently
  if (slMetCache && !canFetchSource('slmet')) {
    return slMetCache.items;
  }

  const items: NewsItem[] = [];

  try {
    markSourceFetched('slmet');

    const response = await fetch('https://www.meteo.gov.lk/content.json', {
      signal: AbortSignal.timeout(10000),
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'FloodWatch.lk/1.0 (Weather Monitoring Service)'
      }
    });

    if (!response.ok) {
      return slMetCache?.items || items;
    }

    const data = await response.json();
    const now = new Date();

    // Extract English portion of public weather forecast
    if (data.public_weather_forecast) {
      const forecast = data.public_weather_forecast;
      // Find the English section (starts with "WEATHER FORECAST FOR")
      const englishMatch = forecast.match(/WEATHER FORECAST FOR[\s\S]+?(?=\r\n\r\n\d{4}|$)/i);
      if (englishMatch) {
        const englishForecast = englishMatch[0].trim();
        // Extract date from forecast
        const dateMatch = englishForecast.match(/(\d{1,2})\s+(DECEMBER|JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER)\s+(\d{4})/i);
        const issuedMatch = englishForecast.match(/Issued at ([\d.:]+\s*[ap]\.?m\.?)/i);

        // Check for heavy rain warnings
        const hasHeavyRain = /fairly heavy|heavy falls|75\s*mm|100\s*mm/i.test(englishForecast);
        const hasThunderstorms = /thundershower|thunder/i.test(englishForecast);

        items.push({
          id: `slmet-forecast-${now.toISOString().split('T')[0]}`,
          title: `Weather Forecast for ${dateMatch ? `${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]}` : 'Today'}`,
          summary: englishForecast.split('\n').slice(2, 5).join(' ').substring(0, 250) + '...',
          source: 'SL Met',
          sourceIcon: '🇱🇰',
          url: 'https://www.meteo.gov.lk',
          publishedAt: now.toISOString(),
          category: 'weather',
          severity: hasHeavyRain ? 'warning' : 'info',
        });
      }
    }

    // Check fleet/shipping forecast for cyclone info
    if (data.fleet_shipping_forecast) {
      const shippingForecast = data.fleet_shipping_forecast;
      // Look for cyclone/depression mentions
      const cycloneMatch = shippingForecast.match(/(Cyclonic Storm|Cyclone|Depression|Low[- ]?pressure area)[^.]+\./gi);
      if (cycloneMatch) {
        const cycloneInfo = cycloneMatch[0];
        // Extract cyclone name if present
        const nameMatch = cycloneInfo.match(/"([^"]+)"/);

        items.push({
          id: `slmet-cyclone-${now.toISOString().split('T')[0]}`,
          title: nameMatch ? `Cyclonic Storm "${nameMatch[1]}" Update` : 'Cyclone/Depression Advisory',
          summary: cycloneInfo.substring(0, 300),
          source: 'SL Met',
          sourceIcon: '🌀',
          url: 'https://www.meteo.gov.lk',
          publishedAt: now.toISOString(),
          category: 'cyclone',
          severity: /cyclonic storm|severe/i.test(cycloneInfo) ? 'critical' : 'warning',
        });
      }
    }

    // Check for sea weather warnings
    if (data.sea_weather_forecast) {
      const seaForecast = data.sea_weather_forecast;
      const englishSeaMatch = seaForecast.match(/WEATHER FORECAST FOR SEA AREAS[\s\S]+?(?=\r\n\r\n[^\x00-\x7F]|$)/i);
      if (englishSeaMatch) {
        const seaEnglish = englishSeaMatch[0].trim();
        const isRough = /rough|strong winds|gale/i.test(seaEnglish);

        if (isRough) {
          items.push({
            id: `slmet-sea-${now.toISOString().split('T')[0]}`,
            title: 'Sea Weather Advisory',
            summary: seaEnglish.split('\n').slice(2, 4).join(' ').substring(0, 200) + '...',
            source: 'SL Met',
            sourceIcon: '🌊',
            url: 'https://www.meteo.gov.lk',
            publishedAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(), // 1 hour ago
            category: 'weather',
            severity: 'warning',
          });
        }
      }
    }

    // Check for severe weather advisories
    if (data.severe_weather_advisory) {
      const { tsunami_pdf, land_pdf, sea_pdf, heat_pdf } = data.severe_weather_advisory;

      if (tsunami_pdf) {
        items.push({
          id: `slmet-tsunami-advisory`,
          title: 'Tsunami Advisory Active',
          summary: 'A tsunami advisory has been issued by the Department of Meteorology.',
          source: 'SL Met',
          sourceIcon: '🌊',
          url: `https://www.meteo.gov.lk/${tsunami_pdf}`,
          publishedAt: now.toISOString(),
          category: 'alert',
          severity: 'critical',
        });
      }

      if (land_pdf) {
        items.push({
          id: `slmet-land-advisory`,
          title: 'Severe Weather Advisory - Land',
          summary: 'A severe weather advisory for land areas has been issued.',
          source: 'SL Met',
          sourceIcon: '⚠️',
          url: `https://www.meteo.gov.lk/${land_pdf}`,
          publishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          category: 'alert',
          severity: 'warning',
        });
      }
    }

    // Update source cache
    slMetCache = { items, fetchedAt: Date.now() };
  } catch (error) {
    console.warn('SL Met fetch error:', error);
    return slMetCache?.items || items;
  }

  return items;
}

/**
 * Fetch weather news from NewsFirst.lk
 * Rate limited: max 1 request per 30 minutes
 */
async function fetchNewsFirstWeather(): Promise<NewsItem[]> {
  // Return cached data if we fetched recently
  if (newsFirstCache && !canFetchSource('newsfirst')) {
    return newsFirstCache.items;
  }

  const items: NewsItem[] = [];

  try {
    markSourceFetched('newsfirst');

    // NewsFirst.lk weather tag page
    const response = await fetch('https://www.newsfirst.lk/tag/weather/', {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FloodWatch/1.0)'
      }
    });

    if (!response.ok) {
      return newsFirstCache?.items || items;
    }

    const html = await response.text();

    // Extract article titles and links
    const articlePattern = /<article[^>]*>[\s\S]*?<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<time[^>]*datetime="([^"]+)"[\s\S]*?<\/article>/gi;
    const matches = Array.from(html.matchAll(articlePattern));

    for (const match of matches.slice(0, 3)) {
      const [, url, title, publishedAt] = match;
      const cleanTitle = title.replace(/&#\d+;/g, '').trim();

      // Determine severity based on keywords
      const lowerTitle = cleanTitle.toLowerCase();
      let severity: 'info' | 'warning' | 'critical' = 'info';
      let category: NewsItem['category'] = 'weather';

      if (lowerTitle.includes('cyclone') || lowerTitle.includes('storm')) {
        category = 'cyclone';
        severity = 'warning';
      } else if (lowerTitle.includes('flood') || lowerTitle.includes('landslide')) {
        category = 'flood';
        severity = 'warning';
      } else if (lowerTitle.includes('heavy rain') || lowerTitle.includes('severe')) {
        severity = 'warning';
      } else if (lowerTitle.includes('alert') || lowerTitle.includes('warning')) {
        category = 'alert';
        severity = 'warning';
      }

      items.push({
        id: `newsfirst-${Date.now()}-${items.length}`,
        title: cleanTitle,
        summary: `Latest weather update from NewsFirst Sri Lanka.`,
        source: 'NewsFirst',
        sourceIcon: '🇱🇰',
        url: url.startsWith('http') ? url : `https://www.newsfirst.lk${url}`,
        publishedAt: publishedAt || new Date().toISOString(),
        category,
        severity,
      });
    }

    // Update source cache
    newsFirstCache = { items, fetchedAt: Date.now() };
  } catch (error) {
    console.warn('NewsFirst fetch error:', error);
    return newsFirstCache?.items || items;
  }

  return items;
}

// fetchBBCWeather() removed: it fetched a single hard-coded Dec-2025
// article URL, not a live BBC feed.

// fetchInternationalNews() removed: it served hard-coded stale articles
// from Nov-Dec 2025 (Cyclone Ditwah) rather than live data. Per the
// 'only publish solid data from trusted sources' rule, we no longer
// surface those static items.

// getMockNews() removed: per 'only publish solid data from trusted
// sources' rule, we never fabricate news items. If real fetches fail
// the API returns an empty array.

export async function GET() {
  try {
    // Check cache
    if (newsCache && (Date.now() - newsCache.fetchedAt) < CACHE_TTL) {
      return NextResponse.json(newsCache.items);
    }

    // Fetch from all sources in parallel
    // SL Met is the primary source for local weather news
    // Only live, refreshable sources. Stale hard-coded entries removed.
    const [slMetNews, imdNews, gdacsNews, reliefwebNews, newsFirstNews] = await Promise.all([
      fetchSLMetNews(),
      fetchIMDCycloneNews(),
      fetchGDACSAlerts(),
      fetchReliefWebNews(),
      fetchNewsFirstWeather(),
    ]);

    // Combine all news - Critical international news first, then SL Met, then other sources
    let allNews = [...slMetNews, ...newsFirstNews, ...imdNews, ...gdacsNews, ...reliefwebNews];

    // Intentionally NO mock/fallback news: if no real source returns
    // anything, we'd rather show an empty list than fake items.

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
    // On total failure, return an empty list rather than fake items.
    return NextResponse.json([]);
  }
}
