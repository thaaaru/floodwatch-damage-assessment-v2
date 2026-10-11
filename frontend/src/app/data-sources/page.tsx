// SPDX-License-Identifier: Apache-2.0

'use client';

export default function DataSourcesPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800/50 backdrop-blur-md border-b border-slate-700/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <a href="/" className="text-slate-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </a>
            <div>
              <h1 className="text-2xl font-bold">Data Sources & Refresh Frequencies</h1>
              <p className="text-sm text-slate-400 mt-1">Comprehensive overview of all data sources powering FloodWatch LK</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-3xl font-bold text-blue-400">46+</div>
            <div className="text-sm text-slate-400 mt-1">Total Data Sources</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-3xl font-bold text-green-400">40+</div>
            <div className="text-sm text-slate-400 mt-1">API Endpoints</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-3xl font-bold text-yellow-400">85-90%</div>
            <div className="text-sm text-slate-400 mt-1">Cache Hit Rate</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-3xl font-bold text-purple-400">5 min</div>
            <div className="text-sm text-slate-400 mt-1">Fastest Refresh</div>
          </div>
        </div>

        {/* Weather & Climate Data */}
        <section className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="text-2xl">🌤️</span>
            Weather & Climate Data
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-700">
                  <th className="py-2 px-3">Source</th>
                  <th className="py-2 px-3">Cache/Refresh</th>
                  <th className="py-2 px-3">Description</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">Backend API - All Weather</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs">30 minutes</span></td>
                  <td className="py-3 px-3 text-xs">Weather data for all districts</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">Backend API - Forecasts</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs">30 minutes</span></td>
                  <td className="py-3 px-3 text-xs">7-day forecast for all districts</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">OpenWeatherMap One Call API 3.0</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs">30 minutes</span></td>
                  <td className="py-3 px-3 text-xs">Early warning system with hourly/daily forecasts</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-3 bg-slate-700/30 rounded-lg">
            <div className="text-sm font-semibold mb-2">Frontend Refresh Intervals:</div>
            <ul className="text-sm text-slate-300 space-y-1">
              <li>• <strong>Dashboard:</strong> No auto-refresh (backend cache: 60 min)</li>
              <li>• <strong>Early Warning Page:</strong> 30 minutes</li>
              <li>• <strong>Flood Info Page:</strong> 30 minutes</li>
              <li>• <strong>Rivers Page:</strong> 5 minutes</li>
            </ul>
          </div>
        </section>

        {/* River & Flood Monitoring */}
        <section className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="text-2xl">🌊</span>
            River & Flood Monitoring
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-700">
                  <th className="py-2 px-3">Source</th>
                  <th className="py-2 px-3">Cache/Refresh</th>
                  <th className="py-2 px-3">Description</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">SL Irrigation Department</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs">15 minutes</span></td>
                  <td className="py-3 px-3 text-xs">River gauges (~40 stations, 7-day history) and river basin outlines</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">
                    <a href="https://data.humdata.org/dataset/hotosm_lka_waterways" target="_blank" rel="noopener noreferrer" className="hover:underline">
                      Rivers: HOT/OSM via HDX (ODbL)
                    </a>
                  </td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-slate-600/20 text-slate-400 rounded text-xs">Static file</span></td>
                  <td className="py-3 px-3 text-xs">River network lines (Waterways of Sri Lanka, OpenStreetMap contributors)</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">RiverNet.lk</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-slate-600/20 text-slate-400 rounded text-xs">Manual link</span></td>
                  <td className="py-3 px-3 text-xs">Live river levels portal - External link</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">ArcGIS Dashboard</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-slate-600/20 text-slate-400 rounded text-xs">Manual link</span></td>
                  <td className="py-3 px-3 text-xs">Interactive river monitoring dashboard - External link</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">Backend Irrigation API</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs">5 minutes</span></td>
                  <td className="py-3 px-3 text-xs">Processed river data with flood thresholds and alerts</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">Backend Flood Threat API</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs">5 minutes</span></td>
                  <td className="py-3 px-3 text-xs">National flood threat assessment and district analysis</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* News Sources */}
        <section className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="text-2xl">📰</span>
            News Sources
          </h2>

          <div className="mb-4 text-sm text-slate-400">
            All news sources cached for <span className="text-blue-400 font-semibold">30 minutes</span> with rate limiting (max 1 request per 30 min per source)
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-700/30 rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3 text-slate-200">Local Sources</h3>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="text-lg">🇱🇰</span>
                  <span>SL Met Department</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-lg">🇱🇰</span>
                  <span>NewsFirst.lk</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-lg">🇱🇰</span>
                  <span>Newswire.lk</span>
                </li>
              </ul>
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3 text-slate-200">International Weather</h3>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="text-lg">🇮🇳</span>
                  <span>India Meteorological Dept (IMD)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-lg">🌍</span>
                  <span>BBC Weather</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-lg">🌍</span>
                  <span>GDACS (Global Disaster Alert)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-lg">🌍</span>
                  <span>ReliefWeb</span>
                </li>
              </ul>
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4 md:col-span-2">
              <h3 className="font-semibold text-sm mb-3 text-slate-200">Disaster & Emergency News</h3>
              <ul className="grid grid-cols-2 gap-2 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="text-lg">🏥</span>
                  <span>WHO (World Health Organization)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-lg">🇺🇳</span>
                  <span>UN News</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-lg">🌍</span>
                  <span>Al Jazeera</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-lg">🇺🇸</span>
                  <span>U.S. Embassy Sri Lanka</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-4 text-center">
            <div className="text-2xl font-bold text-blue-400">11</div>
            <div className="text-sm text-slate-400">Total News Sources</div>
          </div>
        </section>

        {/* Wind Data */}
        <section className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="text-2xl">🌬️</span>
            Wind Data
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-700">
                  <th className="py-2 px-3">Source</th>
                  <th className="py-2 px-3">Update Frequency</th>
                  <th className="py-2 px-3">Description</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">ICON (DWD Germany)</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-purple-600/20 text-purple-400 rounded text-xs">Every 6 hours</span></td>
                  <td className="py-3 px-3 text-xs">Weather model - Forecast up to 78 hours</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">GFS (NOAA USA)</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-purple-600/20 text-purple-400 rounded text-xs">Every 6 hours</span></td>
                  <td className="py-3 px-3 text-xs">Weather model - Forecast up to 384 hours (16 days)</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">ERA5 (ECMWF)</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-orange-600/20 text-orange-400 rounded text-xs">Daily</span></td>
                  <td className="py-3 px-3 text-xs">Reanalysis model - Historical data (~5 day lag)</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">OpenWeather</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs">Real-time</span></td>
                  <td className="py-3 px-3 text-xs">Current wind conditions only</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Intelligence & Alerts */}
        <section className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="text-2xl">🚨</span>
            Intelligence & Alerts
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-700">
                  <th className="py-2 px-3">Source</th>
                  <th className="py-2 px-3">Cache Duration</th>
                  <th className="py-2 px-3">Description</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">Emergency Facilities (OpenStreetMap)</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-orange-600/20 text-orange-400 rounded text-xs">24 hours</span></td>
                  <td className="py-3 px-3 text-xs">Hospitals, police, fire stations, shelters - Daily refresh ✅</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">Weather Alerts (WeatherAPI.com)</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 rounded text-xs">15 minutes</span></td>
                  <td className="py-3 px-3 text-xs">Official weather warnings and alerts - Auto-refresh ✅</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">Marine Conditions (Open-Meteo)</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs">30 minutes</span></td>
                  <td className="py-3 px-3 text-xs">Wave heights, sea temperatures, marine forecasts - Auto-refresh ✅</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">Traffic Incidents (TomTom)</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs">5 minutes</span></td>
                  <td className="py-3 px-3 text-xs">Road closures, accidents, flooding incidents - Auto-refresh ✅</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-3 font-medium">Traffic Flow (HERE & TomTom)</td>
                  <td className="py-3 px-3"><span className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs">5 minutes</span></td>
                  <td className="py-3 px-3 text-xs">Real-time traffic congestion and flow data - Auto-refresh ✅</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Emergency Services */}
        <section className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="text-2xl">📍</span>
            Emergency Services
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-700/30 rounded-lg p-4 text-center">
              <div className="text-3xl mb-2">🏥</div>
              <div className="text-2xl font-bold text-red-400">1,500+</div>
              <div className="text-xs text-slate-400 mt-1">Hospitals</div>
            </div>
            <div className="bg-slate-700/30 rounded-lg p-4 text-center">
              <div className="text-3xl mb-2">👮</div>
              <div className="text-2xl font-bold text-blue-400">400+</div>
              <div className="text-xs text-slate-400 mt-1">Police Stations</div>
            </div>
            <div className="bg-slate-700/30 rounded-lg p-4 text-center">
              <div className="text-3xl mb-2">🚒</div>
              <div className="text-2xl font-bold text-orange-400">100+</div>
              <div className="text-xs text-slate-400 mt-1">Fire Stations</div>
            </div>
            <div className="bg-slate-700/30 rounded-lg p-4 text-center">
              <div className="text-3xl mb-2">🏠</div>
              <div className="text-2xl font-bold text-green-400">200+</div>
              <div className="text-xs text-slate-400 mt-1">Shelters</div>
            </div>
          </div>

          <div className="mt-4 text-center text-sm text-slate-400">
            Source: <span className="font-semibold">OpenStreetMap</span> • Cache: <span className="text-orange-400 font-semibold">24 hours</span>
          </div>
        </section>

        {/* Refresh Frequency Summary */}
        <section className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg p-6 border border-blue-700/30">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            Data Refresh Frequencies Summary
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="text-green-400 font-bold text-lg mb-2">⚡ 5 minutes</div>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>• River levels</li>
                <li>• Traffic incidents</li>
                <li>• Irrigation data</li>
              </ul>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="text-yellow-400 font-bold text-lg mb-2">🔄 15 minutes</div>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>• Weather alerts</li>
              </ul>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="text-blue-400 font-bold text-lg mb-2">⏱️ 30 minutes</div>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>• Weather data</li>
                <li>• News feeds</li>
                <li>• Marine conditions</li>
                <li>• Early warnings</li>
              </ul>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="text-purple-400 font-bold text-lg mb-2">🕐 6 hours</div>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>• ICON wind model</li>
                <li>• GFS wind model</li>
              </ul>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="text-orange-400 font-bold text-lg mb-2">📅 24 hours</div>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>• Emergency facilities</li>
                <li>• Intel page (static snapshot, not refreshed)</li>
              </ul>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="text-red-400 font-bold text-lg mb-2">🗓️ Daily/Weekly</div>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>• ERA5 wind data</li>
                <li>• Environmental data</li>
              </ul>
            </div>
          </div>
        </section>

        {/* API Keys Required */}
        <section className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="text-2xl">🔑</span>
            API Keys Required
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-700/30 rounded p-3">✅ OpenWeatherMap One Call API 3.0</div>
            <div className="bg-slate-700/30 rounded p-3">✅ WeatherAPI.com</div>
            <div className="bg-slate-700/30 rounded p-3">✅ TomTom Traffic API</div>
            <div className="bg-slate-700/30 rounded p-3">✅ HERE Traffic API</div>
            <div className="bg-slate-700/30 rounded p-3">✅ ECMWF ERA5 (CDS_API_KEY)</div>
            <div className="bg-slate-700/30 rounded p-3">✅ Open-Meteo (no key required)</div>
          </div>
        </section>

      </div>
    </div>
  );
}
