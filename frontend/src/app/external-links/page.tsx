// SPDX-License-Identifier: Apache-2.0

'use client';

import { useState } from 'react';

export default function ExternalLinks() {
  const [activeCategory, setActiveCategory] = useState<string>('all');

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-gradient-to-r from-brand-600 to-brand-700 text-white px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold">Flood Information Resources</h1>
          <p className="text-brand-100 mt-1">Complete URL directory for Sri Lanka flood monitoring systems</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Category Filter */}
        <div className="mb-8 flex flex-wrap gap-2">
          {['all', 'government', 'weather', 'international'].map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeCategory === cat
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-900'
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        <div className="space-y-8">
          {/* 2. RiverNet.LK */}
          {(activeCategory === 'all' || activeCategory === 'government') && (
            <section className="card p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-3xl">📱</span>
                <div>
                  <h2 className="text-2xl font-bold text-white">RiverNet.LK</h2>
                  <p className="text-sm text-slate-300 mt-1">Live river levels and flood alerts</p>
                  <a
                    href="https://rivernet.lk/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-brand-600 hover:text-brand-700 mt-1 inline-flex items-center gap-1"
                  >
                    <span>https://rivernet.lk/</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            </section>
          )}

          {/* 4. Government & Official Portals */}
          {(activeCategory === 'all' || activeCategory === 'government') && (
            <section className="card p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-3xl">🏛️</span>
                <div>
                  <h2 className="text-2xl font-bold text-white">Government & Official Portals</h2>
                  <p className="text-sm text-slate-300 mt-1">Official government monitoring systems and reports</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { name: 'ArcGIS Realtime Rivers Dashboard', url: 'https://www.arcgis.com/apps/dashboards/2cffe83c9ff5497d97375498bdf3ff38', desc: 'Interactive river level map' },
                  { name: 'CRIP Operations Dashboard', url: 'https://crip.irrigation.gov.lk/portal/apps/opsdashboard/index.html#/6e201b03ab9d471d81ca613b12daa5cf', desc: 'Irrigation Dept. ArcGIS portal' },
                  { name: 'DMC River Reports', url: 'https://www.dmc.gov.lk/index.php?option=com_dmcreports&view=reports&Itemid=277&report_type_id=6&lang=en', desc: 'Official DMC situation reports' },
                  { name: 'Irrigation Dept - Kelani', url: 'https://irrigation.gov.lk/web/index.php?option=com_content&view=article&id=142&Itemid=101&lang=en', desc: 'Kelani Ganga info page' },
                  { name: 'Met Department', url: 'https://www.meteo.gov.lk/', desc: 'Weather forecasts & warnings' },
                  { name: 'NBRO', url: 'https://www.nbro.gov.lk/', desc: 'Landslide warnings' },
                ].map((portal) => (
                  <a
                    key={portal.url}
                    href={portal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-purple-600/20 rounded-lg p-4 border border-purple-700/50 hover:border-purple-500 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-semibold text-white group-hover:text-purple-600">{portal.name}</div>
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-purple-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                    <div className="text-xs text-purple-300">{portal.desc}</div>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* 5. Weather & Satellite Monitoring */}
          {(activeCategory === 'all' || activeCategory === 'weather') && (
            <section className="card p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-3xl">🛰️</span>
                <div>
                  <h2 className="text-2xl font-bold text-white">Weather & Satellite Monitoring</h2>
                  <p className="text-sm text-slate-300 mt-1">Real-time weather maps, satellite imagery, rainfall monitoring</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { name: 'Windy.com (Sri Lanka)', url: 'https://www.windy.com/?6.872,79.894,5', desc: 'Interactive weather map - Colombo focus' },
                  { name: 'Windy.com (Central)', url: 'https://www.windy.com/?7.667,80.112,5', desc: 'Central highlands focus' },
                  { name: 'Himawari Satellite', url: 'http://www.data.jma.go.jp/mscweb/data/himawari/sat_img.php?area=ha5', desc: 'JMA satellite imagery (Asia)' },
                  { name: 'GSMaP Rainfall', url: 'https://sharaku.eorc.jaxa.jp/GSMaP/', desc: 'JAXA global rainfall map' },
                ].map((weather) => (
                  <a
                    key={weather.url}
                    href={weather.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-cyan-600/20 rounded-lg p-4 border border-cyan-700/50 hover:border-cyan-500 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-semibold text-white group-hover:text-cyan-600">{weather.name}</div>
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-cyan-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                    <div className="text-xs text-cyan-300">{weather.desc}</div>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* 6. International & Regional Resources */}
          {(activeCategory === 'all' || activeCategory === 'international') && (
            <section className="card p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-3xl">🌍</span>
                <div>
                  <h2 className="text-2xl font-bold text-white">International & Regional Resources</h2>
                  <p className="text-sm text-slate-300 mt-1">Global disaster alerts and humanitarian updates</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { name: 'ReliefWeb Sri Lanka', url: 'https://reliefweb.int/country/lka', desc: 'UN humanitarian updates' },
                  { name: 'GDACS', url: 'https://www.gdacs.org/', desc: 'Global Disaster Alert System' },
                  { name: 'Floodlist Asia', url: 'https://floodlist.com/asia', desc: 'Regional flood news' },
                ].map((intl) => (
                  <a
                    key={intl.url}
                    href={intl.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-indigo-600/20 rounded-lg p-4 border border-indigo-700/50 hover:border-indigo-500 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-semibold text-white group-hover:text-indigo-600">{intl.name}</div>
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                    <div className="text-xs text-indigo-300">{intl.desc}</div>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Info Box */}
          <div className="bg-blue-600/20 border border-blue-700/50 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">External Resources</p>
                <p>These resources are provided by external organizations and government agencies. FloodWatch LK aggregates these links for convenient access. Please verify information with official sources.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
