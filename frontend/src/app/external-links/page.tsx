// SPDX-License-Identifier: Apache-2.0

'use client';

import { useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import Section from '@/components/ui/Section';
import { ui } from '@/lib/ui';

type Category = 'government' | 'weather' | 'international';
type LinkItem = { name: string; url: string; desc: string };

const SECTIONS: { id: string; category: Category; icon: string; title: string; desc: string; links: LinkItem[] }[] = [
  {
    id: 'rivernet', category: 'government', icon: '📱', title: 'RiverNet.LK',
    desc: 'Live river levels and flood alerts',
    links: [{ name: 'RiverNet.LK', url: 'https://rivernet.lk/', desc: 'rivernet.lk' }],
  },
  {
    id: 'gov', category: 'government', icon: '🏛️', title: 'Government & official portals',
    desc: 'Official government monitoring systems and reports',
    links: [
      { name: 'ArcGIS Realtime Rivers Dashboard', url: 'https://www.arcgis.com/apps/dashboards/2cffe83c9ff5497d97375498bdf3ff38', desc: 'Interactive river level map' },
      { name: 'CRIP Operations Dashboard', url: 'https://crip.irrigation.gov.lk/portal/apps/opsdashboard/index.html#/6e201b03ab9d471d81ca613b12daa5cf', desc: 'Irrigation Dept. ArcGIS portal' },
      { name: 'DMC River Reports', url: 'https://www.dmc.gov.lk/index.php?option=com_dmcreports&view=reports&Itemid=277&report_type_id=6&lang=en', desc: 'Official DMC situation reports' },
      { name: 'Irrigation Dept - Kelani', url: 'https://irrigation.gov.lk/web/index.php?option=com_content&view=article&id=142&Itemid=101&lang=en', desc: 'Kelani Ganga info page' },
      { name: 'Met Department', url: 'https://www.meteo.gov.lk/', desc: 'Weather forecasts & warnings' },
      { name: 'NBRO', url: 'https://www.nbro.gov.lk/', desc: 'Landslide warnings' },
    ],
  },
  {
    id: 'weather', category: 'weather', icon: '🛰️', title: 'Weather & satellite monitoring',
    desc: 'Real-time weather maps, satellite imagery, rainfall monitoring',
    links: [
      { name: 'Windy.com (Sri Lanka)', url: 'https://www.windy.com/?6.872,79.894,5', desc: 'Interactive weather map - Colombo focus' },
      { name: 'Windy.com (Central)', url: 'https://www.windy.com/?7.667,80.112,5', desc: 'Central highlands focus' },
      { name: 'Himawari Satellite', url: 'http://www.data.jma.go.jp/mscweb/data/himawari/sat_img.php?area=ha5', desc: 'JMA satellite imagery (Asia)' },
      { name: 'GSMaP Rainfall', url: 'https://sharaku.eorc.jaxa.jp/GSMaP/', desc: 'JAXA global rainfall map' },
    ],
  },
  {
    id: 'intl', category: 'international', icon: '🌍', title: 'International & regional resources',
    desc: 'Global disaster alerts and humanitarian updates',
    links: [
      { name: 'ReliefWeb Sri Lanka', url: 'https://reliefweb.int/country/lka', desc: 'UN humanitarian updates' },
      { name: 'GDACS', url: 'https://www.gdacs.org/', desc: 'Global Disaster Alert System' },
      { name: 'Floodlist Asia', url: 'https://floodlist.com/asia', desc: 'Regional flood news' },
    ],
  },
];

const FILTERS: { id: 'all' | Category; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'government', label: 'Government' },
  { id: 'weather', label: 'Weather' },
  { id: 'international', label: 'International' },
];

function ExternalIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

export default function ExternalLinks() {
  const [active, setActive] = useState<'all' | Category>('all');
  const sections = SECTIONS.filter((s) => active === 'all' || s.category === active);

  return (
    <div className={ui.page}>
      <PageHeader title="Flood information resources" subtitle="Directory of Sri Lanka flood and weather monitoring websites" />

      <main className={`max-w-7xl ${ui.container} space-y-6`}>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActive(f.id)}
              aria-pressed={active === f.id}
              className={`chip ${active === f.id ? 'chip-active' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {sections.map((s) => (
          <Section
            key={s.id}
            title={<><span aria-hidden="true" className="mr-2">{s.icon}</span>{s.title}</>}
            subtitle={s.desc}
          >
            <div className={`grid grid-cols-1 gap-3 ${s.links.length > 1 ? 'md:grid-cols-2 lg:grid-cols-3' : ''}`}>
              {s.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="link-tile group">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-white group-hover:text-cyan-300">{l.name}</span>
                    <ExternalIcon />
                  </div>
                  <div className={`mt-1 ${ui.body}`}>{l.desc}</div>
                </a>
              ))}
            </div>
          </Section>
        ))}

        <div className={`${ui.card} ${ui.cardPad} ${ui.body}`}>
          <p className="font-semibold text-white mb-1">External resources</p>
          <p>
            These sites are run by external organisations and government agencies. FloodWatch links to them for
            convenience; check official sources for warnings.
          </p>
        </div>
      </main>
    </div>
  );
}
