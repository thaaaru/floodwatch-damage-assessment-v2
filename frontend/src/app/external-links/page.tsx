// SPDX-License-Identifier: Apache-2.0

'use client';

import { useState } from 'react';

export default function ExternalLinks() {
  const [activeCategory, setActiveCategory] = useState<string>('all');

  return (
    <div className="min-h-screen bg-slate-50">
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
          {['all', 'navy', 'government', 'weather', 'international'].map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeCategory === cat
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        <div className="space-y-8">
          {/* 1. NAVY WLRS - River Monitoring */}
          {(activeCategory === 'all' || activeCategory === 'navy') && (
            <section className="card p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-3xl">🌊</span>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">NAVY WLRS - Real-Time River Monitoring</h2>
                  <p className="text-sm text-slate-600 mt-1">Water Level & Rainfall System - 24hr rainfall, water levels, real-time location maps</p>
                  <a
                    href="https://floodms.navy.lk/wlrs/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-brand-600 hover:text-brand-700 mt-1 inline-flex items-center gap-1"
                  >
                    <span>Base URL: https://floodms.navy.lk/wlrs/</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* Major Rivers (Ganga) */}
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-900 mb-3">🏞️ Major Rivers (Ganga)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { name: 'Kelani Ganga', code: 'RB 01', url: 'https://floodms.navy.lk/wlrs/index.php', stations: 'Nagalagam Street, Hanwella, Kitulgala, Glencourse, Deraniyagala, Holombuwa, Norwood' },
                    { name: 'Kalu Ganga', code: 'RB 03', url: 'https://floodms.navy.lk/wlrs/kaluganga.php', stations: 'Ellagawa, Putupaula, Magura, Ratnapura, Kalawellawa' },
                    { name: 'Gin Ganga', code: 'RB 09', url: 'https://floodms.navy.lk/wlrs/ginganga.php', stations: 'Baddegama, Tawalama' },
                    { name: 'Nilwala Ganga', code: 'RB 12', url: 'https://floodms.navy.lk/wlrs/nilwalaganga.php', stations: 'Panadugama, Thalgahagoda, Urawa, Pitabeddara' },
                    { name: 'Walawe Ganga', code: 'RB 18', url: 'https://floodms.navy.lk/wlrs/walaweganga.php', stations: 'Moraketiya' },
                    { name: 'Menik Ganga', code: 'RB 26', url: 'https://floodms.navy.lk/wlrs/menikganga.php', stations: '-' },
                    { name: 'Mahaweli Ganga', code: 'RB 60', url: 'https://floodms.navy.lk/wlrs/mahaweliganga.php', stations: '-' },
                  ].map((river) => (
                    <a
                      key={river.code}
                      href={river.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block bg-slate-50 rounded-lg p-4 border border-slate-200 hover:border-brand-500 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="font-semibold text-slate-900 group-hover:text-brand-600">{river.name}</div>
                          <div className="text-xs text-slate-500">{river.code}</div>
                        </div>
                        <svg className="w-4 h-4 text-slate-400 group-hover:text-brand-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </div>
                      <div className="text-xs text-slate-600">
                        <span className="font-medium">Stations:</span> {river.stations}
                      </div>
                    </a>
                  ))}
                </div>
              </div>

              {/* Streams (Oya) */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">💧 Streams (Oya)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { name: 'Kirindi Oya', code: 'RB 22', url: 'https://floodms.navy.lk/wlrs/kirindioya.php', region: 'Southern' },
                    { name: 'Kumbukkan Oya', code: 'RB 31', url: 'https://floodms.navy.lk/wlrs/kumbukkanoya.php', region: 'Eastern' },
                    { name: 'Heda Oya', code: 'RB 36', url: 'https://floodms.navy.lk/wlrs/hedaoya.php', region: 'Eastern' },
                    { name: 'Maduru Oya', code: 'RB 54', url: 'https://floodms.navy.lk/wlrs/maduruoya.php', region: 'Eastern' },
                    { name: 'Yan Oya', code: 'RB 67', url: 'https://floodms.navy.lk/wlrs/yanoya.php', region: 'Northern' },
                    { name: 'Maa Oya', code: 'RB 69', url: 'https://floodms.navy.lk/wlrs/maaoya.php', region: 'North Western' },
                    { name: 'Malwathu Oya', code: 'RB 90', url: 'https://floodms.navy.lk/wlrs/malwathuoya.php', region: 'North Central' },
                    { name: 'Mee Oya', code: 'RB 95', url: 'https://floodms.navy.lk/wlrs/meeoya.php', region: 'North Western' },
                    { name: 'Deduru Oya', code: 'RB 99', url: 'https://floodms.navy.lk/wlrs/deduruoya.php', region: 'North Western' },
                    { name: 'Maha Oya', code: 'RB 102', url: 'https://floodms.navy.lk/wlrs/mahaoya.php', region: 'Western' },
                    { name: 'Attanagalu Oya', code: 'RB 103', url: 'https://floodms.navy.lk/wlrs/attanagaluoya.php', region: 'Western' },
                  ].map((stream) => (
                    <a
                      key={stream.code}
                      href={stream.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block bg-blue-50 rounded-lg p-4 border border-blue-200 hover:border-blue-500 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <div className="font-semibold text-slate-900 group-hover:text-blue-600">{stream.name}</div>
                          <div className="text-xs text-slate-500">{stream.code}</div>
                        </div>
                        <svg className="w-4 h-4 text-slate-400 group-hover:text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </div>
                      <div className="text-xs text-blue-700">
                        <span className="font-medium">Region:</span> {stream.region}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* 2. RiverNet.LK */}
          {(activeCategory === 'all' || activeCategory === 'government') && (
            <section className="card p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-3xl">📱</span>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">RiverNet.LK - Irrigation Department Early Warning</h2>
                  <p className="text-sm text-slate-600 mt-1">Live river levels, flood alerts, mobile app interface</p>
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { name: 'Main Dashboard', url: 'https://rivernet.lk/', desc: 'Landing page' },
                  { name: 'Landing Portal', url: 'https://rivernet.lk/_landing/', desc: 'Main entry point' },
                  { name: 'Mobile Web App', url: 'https://web.rivernet.lk/', desc: 'Flutter-based mobile interface' },
                  { name: 'Kalu Ganga Overview', url: 'https://rivernet.lk/_kaluganga-overview/', desc: 'Basin-wide view' },
                  { name: 'Kelani Ganga Overview', url: 'https://rivernet.lk/_salford/', desc: 'Basin-wide view' },
                  { name: 'Kelaniya Station', url: 'https://rivernet.lk/kelaniya', desc: 'Kelani River at Kelaniya' },
                  { name: 'Ratnapura Station', url: 'https://rivernet.lk/ratnapura', desc: 'Kalu Ganga at Ratnapura' },
                  { name: 'Gampaha Station', url: 'https://rivernet.lk/gampaha', desc: 'Attanagalu Oya region' },
                  { name: 'Nilwala Station', url: 'https://rivernet.lk/nilwala', desc: 'Nilwala Ganga' },
                ].map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-emerald-50 rounded-lg p-4 border border-emerald-200 hover:border-emerald-500 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-semibold text-slate-900 group-hover:text-emerald-600">{link.name}</div>
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                    <div className="text-xs text-emerald-700">{link.desc}</div>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* 3. Navy Flood MS - Historical Maps */}
          {(activeCategory === 'all' || activeCategory === 'navy') && (
            <section className="card p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-3xl">🗺️</span>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Navy Flood MS - Historical Maps & Emergency</h2>
                  <p className="text-sm text-slate-600 mt-1">Dashboards, situation reports, district maps, rescue resources</p>
                  <a
                    href="https://floodms.navy.lk/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-brand-600 hover:text-brand-700 mt-1 inline-flex items-center gap-1"
                  >
                    <span>https://floodms.navy.lk/</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* Dashboards */}
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-700 mb-2">📊 Dashboards & Reports</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[
                    { name: 'Current Flood Situation', url: 'https://floodms.navy.lk/flood.php' },
                    { name: 'Historical Flood Data', url: 'https://floodms.navy.lk/historical.php' },
                    { name: 'Safe Places/Shelters', url: 'https://floodms.navy.lk/rescue.php' },
                  ].map((link) => (
                    <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm bg-slate-100 hover:bg-brand-50 px-3 py-2 rounded-lg flex items-center justify-between group">
                      <span className="text-slate-700 group-hover:text-brand-700 font-medium">{link.name}</span>
                      <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ))}
                </div>
              </div>

              {/* District Maps - Ratnapura */}
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-700 mb-2">🗺️ Sabaragamuwa Province (Ratnapura District)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {[
                    { name: 'Eheliyagoda', url: 'https://floodms.navy.lk/Eheliyagoda.php' },
                    { name: 'Elapatha', url: 'https://floodms.navy.lk/Elapatha.php' },
                    { name: 'Kalawana', url: 'https://floodms.navy.lk/Kalawana.php' },
                    { name: 'Ayagama', url: 'https://floodms.navy.lk/Ayagama.php' },
                    { name: 'Kiriella', url: 'https://floodms.navy.lk/Kiriella.php' },
                    { name: 'Kuruwita', url: 'https://floodms.navy.lk/Kuruwita.php' },
                    { name: 'Pelmadulla', url: 'https://floodms.navy.lk/Pelmadulla.php' },
                    { name: 'Ratnapura', url: 'https://floodms.navy.lk/Rathnapura.php' },
                    { name: 'Nivithigala', url: 'https://floodms.navy.lk/Nivithigala.php' },
                  ].map((dsd) => (
                    <a key={dsd.url} href={dsd.url} target="_blank" rel="noopener noreferrer" className="text-xs bg-amber-50 hover:bg-amber-100 px-2 py-2 rounded text-center border border-amber-200 hover:border-amber-400 transition-all">
                      {dsd.name}
                    </a>
                  ))}
                </div>
              </div>

              {/* Other Districts */}
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-700 mb-2">🗺️ Other Provinces</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {[
                    { name: 'Puttalam (North Western)', url: 'https://floodms.navy.lk/puttalam.php' },
                    { name: 'Colombo & Gampaha (Western)', url: 'https://floodms.navy.lk/colombo.php' },
                    { name: 'Kalutara (Western)', url: 'https://floodms.navy.lk/kaluthara.php' },
                    { name: 'Anuradhapura - Malwathu Oya (North Central)', url: 'https://floodms.navy.lk/anuradhapura.php' },
                    { name: 'Galle & Matara (Southern)', url: 'https://floodms.navy.lk/galle.php' },
                  ].map((district) => (
                    <a key={district.url} href={district.url} target="_blank" rel="noopener noreferrer" className="text-sm bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg border border-slate-300 hover:border-slate-400 transition-all text-slate-700">
                      {district.name}
                    </a>
                  ))}
                </div>
              </div>

              {/* Rescue Boats */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-2">🚤 Rescue Boat Locations</h3>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { year: '2022', url: 'https://floodms.navy.lk/boat_details_2022.php' },
                    { year: '2023', url: 'https://floodms.navy.lk/boat_details_2023.php' },
                    { year: '2024', url: 'https://floodms.navy.lk/boat_details_2024.php' },
                    { year: '2025', url: 'https://floodms.navy.lk/boat_details_2025.php' },
                  ].map((boat) => (
                    <a key={boat.url} href={boat.url} target="_blank" rel="noopener noreferrer" className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">
                      {boat.year}
                    </a>
                  ))}
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
                  <h2 className="text-2xl font-bold text-slate-900">Government & Official Portals</h2>
                  <p className="text-sm text-slate-600 mt-1">Official government monitoring systems and reports</p>
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
                    className="block bg-purple-50 rounded-lg p-4 border border-purple-200 hover:border-purple-500 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-semibold text-slate-900 group-hover:text-purple-600">{portal.name}</div>
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-purple-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                    <div className="text-xs text-purple-700">{portal.desc}</div>
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
                  <h2 className="text-2xl font-bold text-slate-900">Weather & Satellite Monitoring</h2>
                  <p className="text-sm text-slate-600 mt-1">Real-time weather maps, satellite imagery, rainfall monitoring</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { name: 'Windy.com (Sri Lanka)', url: 'https://www.windy.com/?6.872,79.894,5', desc: 'Interactive weather map - Colombo focus' },
                  { name: 'Windy.com (Central)', url: 'https://www.windy.com/?7.667,80.112,5', desc: 'Central highlands focus' },
                  { name: 'Himawari Satellite', url: 'http://www.data.jma.go.jp/mscweb/data/himawari/sat_img.php?area=ha5', desc: 'JMA satellite imagery (Asia)' },
                  { name: 'GSMaP Rainfall', url: 'https://sharaku.eorc.jaxa.jp/GSMaP/', desc: 'JAXA global rainfall map' },
                  { name: 'Navy Rainfall Monitoring', url: 'http://222.165.186.53/login', desc: 'Local rainfall stations' },
                ].map((weather) => (
                  <a
                    key={weather.url}
                    href={weather.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-cyan-50 rounded-lg p-4 border border-cyan-200 hover:border-cyan-500 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-semibold text-slate-900 group-hover:text-cyan-600">{weather.name}</div>
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-cyan-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                    <div className="text-xs text-cyan-700">{weather.desc}</div>
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
                  <h2 className="text-2xl font-bold text-slate-900">International & Regional Resources</h2>
                  <p className="text-sm text-slate-600 mt-1">Global disaster alerts and humanitarian updates</p>
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
                    className="block bg-indigo-50 rounded-lg p-4 border border-indigo-200 hover:border-indigo-500 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-semibold text-slate-900 group-hover:text-indigo-600">{intl.name}</div>
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                    <div className="text-xs text-indigo-700">{intl.desc}</div>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* 7. Reference Documents */}
          {(activeCategory === 'all' || activeCategory === 'navy') && (
            <section className="card p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-3xl">📄</span>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Reference Documents</h2>
                  <p className="text-sm text-slate-600 mt-1">Technical documentation and concept papers</p>
                </div>
              </div>

              <a
                href="https://floodms.navy.lk/Map_PDF/consept.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 hover:bg-red-100 hover:border-red-400 transition-all group"
              >
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <div>
                  <div className="font-semibold text-slate-900 group-hover:text-red-600">Navy Flood MS Concept Paper</div>
                  <div className="text-xs text-red-700">PDF Document</div>
                </div>
                <svg className="w-4 h-4 text-slate-400 group-hover:text-red-600 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </section>
          )}

          {/* Summary Statistics */}
          <section className="card p-6 bg-gradient-to-br from-slate-100 to-slate-50">
            <h2 className="text-xl font-bold text-slate-900 mb-4">📊 Summary Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Major Rivers (Ganga)', count: '7' },
                { label: 'Streams (Oya)', count: '11' },
                { label: 'River Basins Monitored', count: '18' },
                { label: 'District/DSD Maps', count: '14' },
                { label: 'Weather/Satellite Sources', count: '5' },
                { label: 'Government Portals', count: '6' },
                { label: 'Total URLs', count: '60+' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-3xl font-bold text-brand-600">{stat.count}</div>
                  <div className="text-xs text-slate-600 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
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
