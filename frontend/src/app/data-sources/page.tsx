// SPDX-License-Identifier: Apache-2.0

import PageHeader from '@/components/ui/PageHeader';
import Section from '@/components/ui/Section';
import { ui } from '@/lib/ui';

// Checked against the code: backend/app/jobs/scheduler.py intervals, backend/app/services/*
// fetchers, and frontend/src/lib/{basemap,gauges,forecast}.ts. Keep it in step with them.
type Row = { source: React.ReactNode; feeds: string; how: string; trust?: string; credit: React.ReactNode };

const ext = (href: string, text: string) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className={ui.link}>{text}</a>
);

const ROWS: Row[] = [
  {
    source: 'Irrigation Department of Sri Lanka: river gauges and hydrostations',
    feeds: 'Home map gauges, basin colours, "River status by basin"',
    how: 'Every 15 minutes',
    credit: 'Water levels: Irrigation Department of Sri Lanka',
  },
  {
    source: 'Irrigation Department of Sri Lanka: river basin outlines',
    feeds: 'Basin shapes on the home map',
    how: 'Static file, built 11 Oct 2026',
    credit: 'River basins: Irrigation Department of Sri Lanka',
  },
  {
    source: <>{ext('https://meteo.gov.lk', 'Sri Lanka Department of Meteorology')}: 3-hourly station rainfall</>,
    feeds: 'Measured rainfall at 24 stations on the home map',
    how: 'At most every 15 minutes, when someone opens the map (the bulletin is issued every 3 hours)',
    credit: 'Sri Lanka Department of Meteorology',
  },
  {
    source: <>{ext('https://open-meteo.com', 'Open-Meteo')}: weather and forecast</>,
    feeds: 'Optional "Rain forecast" map layer (a model, not measured)',
    how: 'Every 30 minutes',
    credit: <>CC BY 4.0. {ext('https://open-meteo.com', 'Weather data by Open-Meteo.com')}</>,
  },
  {
    source: <>{ext('https://open-meteo.com/en/docs/historical-weather-api', 'Open-Meteo Historical Weather API')}: ERA5 daily rainfall</>,
    feeds: '"Rainfall vs normal" map layer and "30-year rainfall context" (model data, not rain gauges)',
    how: 'Daily (ERA5 arrives about 5 days late); history from 1996 filled once',
    credit: <>CC BY 4.0. Contains modified Copernicus Climate Change Service information (ERA5). {ext('https://open-meteo.com', 'Weather data by Open-Meteo.com')}</>,
  },
  {
    source: <>Humanitarian OpenStreetMap Team via {ext('https://data.humdata.org', 'HDX')}: waterways</>,
    feeds: 'River lines on the home map',
    how: 'Static file, built 11 Oct 2026',
    credit: 'ODbL. © OpenStreetMap contributors',
  },
  {
    source: <>{ext('https://protomaps.com', 'Protomaps')} / OpenStreetMap basemap</>,
    feeds: 'Background of every map',
    how: 'Self-hosted, rebuilt monthly. Your browser makes no third-party map requests.',
    credit: 'ODbL. © OpenStreetMap contributors',
  },
  {
    source: 'News: SL Met, NewsFirst, IMD RSMC New Delhi, GDACS',
    feeds: 'News page',
    how: 'Every 15 minutes. NewsFirst items are kept only if they are about Sri Lanka.',
    credit: 'Each item links to its publisher',
  },
  {
    source: 'ReliefWeb',
    feeds: 'News page',
    how: 'Off: waiting for API approval',
    credit: 'UN OCHA ReliefWeb',
  },
  {
    source: 'Esri World Imagery (optional)',
    feeds: '"Satellite" map option',
    how: 'Only when you switch it on',
    credit: 'Imagery: Esri, Maxar, Earthstar Geographics',
  },
  {
    source: 'OpenStreetMap Overpass API',
    feeds: 'Public-mode nearby facility candidates',
    how: 'Daily',
    trust: 'Crowd-sourced and unverified. A map listing does not confirm that a facility is open, reachable, or suitable as a shelter.',
    credit: 'ODbL. © OpenStreetMap contributors',
  },
  {
    source: 'Google Maps Platform: Places, Routes and Elevation',
    feeds: 'Optional public-mode place search, candidate routes and elevation context',
    how: 'Requested only after a person searches, selects a location, or asks for a route; unavailable when the server key is not configured',
    trust: 'Third-party context only. Candidate routes are not flood-safety assessments.',
    credit: 'Google Maps Platform attribution is shown with returned data.',
  },
  {
    source: <>{ext('https://risesrilanka.org/docs/api', 'RISE Sri Lanka public data API')}: gauges, rainfall, derived flood risk and alerts</>,
    feeds: 'Additional flood intelligence only; never merged into measured map layers',
    how: 'Cached for 15 minutes; live read-only requests with stale last-good fallback',
    trust: 'Aggregator / decision support; non-official. Upstream provenance and data_status vary by feed.',
    credit: 'RISE attribution shown with each snapshot. Reuse terms are not specified, so FloodWatch does not persist or redistribute the records.',
  },
  {
    source: <>{ext('https://lk-flood-api.vercel.app/docs', 'Sri Lanka Flood Data API')}: community transformation of DMC bulletins via nuuuwan/lk_dmc_vis</>,
    feeds: 'Additional flood intelligence only; latest-level and alert counts',
    how: 'Cached for 15 minutes; upstream pipeline polls about every 15 minutes, while DMC bulletins are usually about 3-hourly',
    trust: 'Community-operated and DMC-derived; not an official DMC API.',
    credit: 'API software declares MIT. That does not grant rights to upstream DMC data; upstream reuse terms are not specified.',
  },
  {
    source: <>{ext('https://developers.google.com/flood-forecasting', 'Google Flood Forecasting API v1')}: gauge coverage and flood forecasts</>,
    feeds: 'Additional flood intelligence only; forecast summary, never measured map values',
    how: 'Cached for 15 minutes. Disabled until waitlist approval, API enablement and GOOGLE_FLOODS_API_KEY are configured.',
    trust: 'Third-party forecast model; not a measured observation or official Sri Lankan warning.',
    credit: 'Google Flood Forecasting data, CC BY 4.0.',
  },
];

export default function DataSourcesPage() {
  return (
    <div className={ui.page}>
      <PageHeader title="Data sources" subtitle="Where FloodWatch's data comes from and how often it is checked" />

      <main className={`max-w-7xl ${ui.container} space-y-6`}>
        <Section title="Sources">
          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <table className="w-full text-xs sm:text-sm min-w-[860px]">
              <thead>
                <tr className={ui.th}>
                  <th scope="col" className="text-left py-2 px-2">Source</th>
                  <th scope="col" className="text-left py-2 px-2">What it feeds</th>
                  <th scope="col" className="text-left py-2 px-2">How often FloodWatch checks</th>
                  <th scope="col" className="text-left py-2 px-2">Trust classification</th>
                  <th scope="col" className="text-left py-2 px-2">Licence / credit</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r, i) => (
                  <tr key={i} className={`${ui.tr} align-top`}>
                    <th scope="row" className="text-left py-2 px-2 font-medium text-white">{r.source}</th>
                    <td className="py-2 px-2 text-slate-300">{r.feeds}</td>
                    <td className="py-2 px-2 text-slate-300">{r.how}</td>
                    <td className="py-2 px-2 text-slate-300">{r.trust ?? 'Primary or established third-party source; see provenance and licence.'}</td>
                    <td className="py-2 px-2 text-slate-300">{r.credit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="What FloodWatch is not">
          <div className={`${ui.body} space-y-2`}>
            <p>
              FloodWatch is a free, unofficial public service. It is not a warning service and does not replace
              official advice. Data here can be late, missing or wrong.
            </p>
            <p>
              For warnings and evacuation orders, follow the{' '}
              {ext('https://www.dmc.gov.lk', 'Disaster Management Centre')} (call 117) and the{' '}
              {ext('https://meteo.gov.lk', 'Department of Meteorology')}.
            </p>
          </div>
        </Section>
      </main>
    </div>
  );
}
