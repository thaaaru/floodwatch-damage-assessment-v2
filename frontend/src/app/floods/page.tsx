// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useRef, useState } from 'react';
import { api, GoogleFloodGauge, GoogleFloodsResponse } from '@/lib/api';

// HydroSHEDS reference data clipped to Sri Lanka (bundled at build time).
// Source: HydroBASINS L8 + HydroRIVERS v1.0 (Lehner & Grill 2013).
// License: free for non-commercial use; attribution shown in the page footer.
import lkBasins from './data/lk_basins.json';
import lkRivers from './data/lk_rivers.json';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
  }
}

// Colour-coded severity that matches Google's Flood Hub conventions.
const SEVERITY_STYLES: Record<string, { color: string; label: string; bg: string; text: string }> = {
  EXTREME: { color: '#7f1d1d', label: 'Extreme danger', bg: 'bg-red-900', text: 'text-red-50' },
  SEVERE: { color: '#dc2626', label: 'Severe', bg: 'bg-red-600', text: 'text-red-50' },
  WARNING: { color: '#f59e0b', label: 'Warning', bg: 'bg-amber-500', text: 'text-amber-50' },
  NO_KNOWN_FLOODING: { color: '#16a34a', label: 'No known flooding', bg: 'bg-green-600', text: 'text-green-50' },
  UNKNOWN: { color: '#6b7280', label: 'Unknown', bg: 'bg-gray-500', text: 'text-gray-50' },
};

function styleFor(severity: string) {
  return SEVERITY_STYLES[severity?.toUpperCase()] ?? SEVERITY_STYLES.UNKNOWN;
}

function formatValue(value: number | null, unit: string | null): string {
  if (value === null || value === undefined) return '—';
  if (!unit) return value.toFixed(2);
  // Strip Google's GAUGE_VALUE_UNIT_* prefix so we render e.g. "3.21 m".
  const cleaned = unit.replace(/^GAUGE_VALUE_UNIT_/, '').toLowerCase();
  const short = cleaned === 'meters' ? 'm' : cleaned === 'cubic_meters_per_second' ? 'm³/s' : cleaned;
  return `${value.toFixed(2)} ${short}`;
}

// Microsoft AI for Good damage-assessment tile sources for Cyclone Ditwah
// (30 Nov 2025, Colombo metro area).
//   Source: https://visualizers.aiforgood.ai/damage-assessment/srilanka_cyclone_ditwah_11_30_2025.html
// These are publicly served XYZ tiles, no auth required. Coverage bbox is
// roughly Colombo + Negombo + Gampaha at zooms 10-17 (basemap goes to 20).
const AIG_TILE_BASE = 'https://opendata.aiforgood.ai/damage-assessment/tiles';
const AIG_LAYERS = {
  basemap: {
    name: 'srilanka_planetscope_basemap_tiles',
    minZoom: 10,
    maxZoom: 20,
    attribution: 'Imagery © Planet Labs / Microsoft AI for Good',
  },
  buildings: {
    name: 'srilanka_planetscope_11_30_buildings_damage_rgba_tiles',
    minZoom: 10,
    maxZoom: 17,
    attribution: 'Building damage predictions © Microsoft AI for Good',
  },
  flood: {
    name: 'srilanka_planetscope_11_30_predictions_rgba_tiles',
    minZoom: 10,
    maxZoom: 17,
    attribution: 'Flood extent predictions © Microsoft AI for Good',
  },
} as const;
const AIG_BOUNDS = {
  south: 6.848990517795159,
  west: 79.84365530400484,
  north: 7.026140203530698,
  east: 80.17956144588624,
};
const AIG_VISUALIZER_URL =
  'https://visualizers.aiforgood.ai/damage-assessment/srilanka_cyclone_ditwah_11_30_2025.html';

export default function FloodHubPage() {
  const [data, setData] = useState<GoogleFloodsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGaugeId, setSelectedGaugeId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);

  // HydroSHEDS overlay toggles. Both default on so the page communicates
  // "this is a hydrology product" the moment it loads, even before the API
  // key for live gauges is in place.
  const [showBasins, setShowBasins] = useState(true);
  const [showRivers, setShowRivers] = useState(true);

  // Microsoft AI for Good damage-assessment tile overlays (Cyclone Ditwah,
  // 30 Nov 2025, Colombo metro area). Default OFF — they cover only a small
  // bbox and shouldn't dominate the country-wide map by default.
  const [showAigBasemap, setShowAigBasemap] = useState(false);
  const [showAigBuildings, setShowAigBuildings] = useState(false);
  const [showAigFlood, setShowAigFlood] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const googleMapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  // Separate Data layers for each overlay so we can toggle independently.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const basinLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const riverLayerRef = useRef<any>(null);
  // Microsoft AI for Good ImageMapType overlays, created once on mount and
  // toggled by setting an opacity of 1 / 0 in the layers list.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aigBasemapLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aigBuildingsLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aigFloodLayerRef = useRef<any>(null);

  // ------------------------------------------------------------------
  // Data fetch — cached server-side; safe to retry every few minutes.
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.getGoogleFloodGauges();
        if (cancelled) return;
        // Defensive: the shared fetch helper returns `{}` on 5xx (to keep
        // other pages from crashing), so a successful await doesn't guarantee
        // we got a real GoogleFloodsResponse. Treat anything without a
        // `gauges` array as "not configured / upstream unavailable".
        if (!res || !Array.isArray((res as Partial<GoogleFloodsResponse>).gauges)) {
          setData(null);
          setError(
            'Google Flood Hub data is not configured yet. An API key needs to be set on the backend.',
          );
        } else {
          setData(res);
          setError(null);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setData(null);
        setError(
          msg.includes('503')
            ? 'Google Flood Hub data is not configured yet. An API key needs to be set on the backend.'
            : `Failed to load flood data: ${msg}`,
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    // Refresh every 10 minutes (server caches for 30, so this is essentially free).
    const interval = setInterval(load, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // ------------------------------------------------------------------
  // Initialise the Google Map once on mount, plus the static
  // HydroSHEDS overlays (basins + river network).
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;
    const initMap = () => {
      if (cancelled || !mapRef.current) return;
      if (!window.google?.maps) {
        // Google Maps JS still loading; retry shortly.
        setTimeout(initMap, 100);
        return;
      }
      // Guard against React strict-mode double-invocation: don't init twice.
      if (googleMapRef.current) return;

      try {
        googleMapRef.current = new window.google.maps.Map(mapRef.current!, {
          center: { lat: 7.8731, lng: 80.7718 }, // Sri Lanka center
          zoom: 8,
          mapTypeId: 'terrain',
          streetViewControl: false,
          fullscreenControl: true,
        });

        // --- HydroBASINS overlay: filled polygons, one per drainage basin.
        // Each basin gets a deterministic colour from its HYBAS_ID so the same
        // basin always looks the same across reloads.
        basinLayerRef.current = new window.google.maps.Data({ map: googleMapRef.current });
        basinLayerRef.current.addGeoJson(lkBasins);
        basinLayerRef.current.setStyle((feature: { getProperty: (k: string) => unknown }) => {
          const id = Number(feature.getProperty('HYBAS_ID')) || 0;
          // Cycle hues so adjacent basins are visually distinct.
          const hue = (id * 137.508) % 360;
          return {
            fillColor: `hsl(${hue}, 50%, 55%)`,
            fillOpacity: 0.18,
            strokeColor: `hsl(${hue}, 55%, 35%)`,
            strokeOpacity: 0.45,
            strokeWeight: 1,
            clickable: false,
            zIndex: 1,
          };
        });

        // --- HydroRIVERS overlay: blue polylines, width scales with Strahler order.
        riverLayerRef.current = new window.google.maps.Data({ map: googleMapRef.current });
        riverLayerRef.current.addGeoJson(lkRivers);
        riverLayerRef.current.setStyle((feature: { getProperty: (k: string) => unknown }) => {
          const order = Number(feature.getProperty('ORD_STRA')) || 1;
          // Order ranges 3-5 in our filtered file; map to 1.5-4px stroke.
          const weight = Math.max(1, Math.min(4, (order - 2) * 1.25));
          return {
            strokeColor: '#1d4ed8',
            strokeOpacity: 0.7,
            strokeWeight: weight,
            clickable: false,
            zIndex: 2,
          };
        });

        // --- Microsoft AI for Good damage-assessment tile overlays
        // (Cyclone Ditwah, 30 Nov 2025). Created here but NOT pushed onto
        // the map's overlayMapTypes yet; the toggle effects below add/remove
        // them based on user input. ImageMapType is the right Google Maps
        // primitive for XYZ tile sources.
        const buildAigLayer = (cfg: typeof AIG_LAYERS[keyof typeof AIG_LAYERS]) =>
          new window.google.maps.ImageMapType({
            name: cfg.name,
            tileSize: new window.google.maps.Size(256, 256),
            minZoom: cfg.minZoom,
            maxZoom: cfg.maxZoom,
            opacity: 1,
            // NOTE: Google Maps' ImageMapType.getTileUrl must return a string
            // (or empty string to skip). Returning null causes "null" to be
            // appended to the tile URL and crashes the load. We do an explicit
            // bbox check to avoid hammering the upstream with 404s for tiles
            // far outside the Colombo coverage area, returning '' to skip.
            getTileUrl: (
              coord: { x: number; y: number },
              zoom: number,
            ): string => {
              const n = Math.pow(2, zoom);
              const lon1 = (coord.x / n) * 360 - 180;
              const lon2 = ((coord.x + 1) / n) * 360 - 180;
              const latRad1 = Math.atan(Math.sinh(Math.PI * (1 - (2 * coord.y) / n)));
              const latRad2 = Math.atan(Math.sinh(Math.PI * (1 - (2 * (coord.y + 1)) / n)));
              const tileSouth = Math.min(latRad1, latRad2) * 180 / Math.PI;
              const tileNorth = Math.max(latRad1, latRad2) * 180 / Math.PI;
              const tileWest = Math.min(lon1, lon2);
              const tileEast = Math.max(lon1, lon2);
              const intersects = !(
                tileEast < AIG_BOUNDS.west ||
                tileWest > AIG_BOUNDS.east ||
                tileNorth < AIG_BOUNDS.south ||
                tileSouth > AIG_BOUNDS.north
              );
              if (!intersects) return '';
              return `${AIG_TILE_BASE}/${cfg.name}/${zoom}/${coord.x}/${coord.y}.png`;
            },
          });

        aigBasemapLayerRef.current = buildAigLayer(AIG_LAYERS.basemap);
        aigBuildingsLayerRef.current = buildAigLayer(AIG_LAYERS.buildings);
        aigFloodLayerRef.current = buildAigLayer(AIG_LAYERS.flood);
      } catch (err) {
        // Map init failure must NOT bubble up to the React tree (would trigger
        // the global error boundary). Log and let the rest of the page render.
        console.error('Failed to initialise flood map:', err);
      }
    };
    initMap();
    return () => {
      cancelled = true;
      try {
        markersRef.current.forEach((m) => m.setMap?.(null));
        markersRef.current = [];
        basinLayerRef.current?.setMap?.(null);
        riverLayerRef.current?.setMap?.(null);
      } catch (err) {
        console.error('Failed to tear down flood map layers:', err);
      }
    };
  }, []);

  // ------------------------------------------------------------------
  // Apply overlay toggle changes.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (basinLayerRef.current && googleMapRef.current) {
      basinLayerRef.current.setMap(showBasins ? googleMapRef.current : null);
    }
  }, [showBasins]);

  useEffect(() => {
    if (riverLayerRef.current && googleMapRef.current) {
      riverLayerRef.current.setMap(showRivers ? googleMapRef.current : null);
    }
  }, [showRivers]);

  // AIG tile overlay toggles. ImageMapType layers are managed via the map's
  // `overlayMapTypes` array — we push/remove by reference identity. A small
  // helper keeps the three effects below DRY.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toggleAigLayer = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    layerRef: { current: any },
    show: boolean,
  ) => {
    const map = googleMapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overlays = map.overlayMapTypes as { getArray: () => any[]; insertAt: (i: number, x: any) => void; removeAt: (i: number) => void };
    const arr = overlays.getArray();
    const idx = arr.indexOf(layer);
    if (show && idx === -1) overlays.insertAt(arr.length, layer);
    else if (!show && idx !== -1) overlays.removeAt(idx);
  };

  useEffect(() => {
    toggleAigLayer(aigBasemapLayerRef, showAigBasemap);
  }, [showAigBasemap]);

  useEffect(() => {
    toggleAigLayer(aigBuildingsLayerRef, showAigBuildings);
  }, [showAigBuildings]);

  useEffect(() => {
    toggleAigLayer(aigFloodLayerRef, showAigFlood);
  }, [showAigFlood]);

  // ------------------------------------------------------------------
  // Render markers whenever data or filter changes.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!googleMapRef.current || !data) return;
    // Clear prior markers.
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const gauges = data.gauges.filter(
      (g) =>
        g.latitude != null &&
        g.longitude != null &&
        (severityFilter === null || g.severity?.toUpperCase() === severityFilter),
    );

    gauges.forEach((gauge) => {
      const style = styleFor(gauge.severity);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const marker = new window.google.maps.Marker({
        position: { lat: gauge.latitude!, lng: gauge.longitude! },
        map: googleMapRef.current,
        title: `${gauge.river ?? 'River'} — ${style.label}`,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: style.color,
          fillOpacity: 0.85,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: gauge.severity === 'NO_KNOWN_FLOODING' ? 6 : 9,
        },
      });
      marker.addListener('click', () => setSelectedGaugeId(gauge.gauge_id));
      markersRef.current.push(marker);
    });
  }, [data, severityFilter]);

  const selectedGauge =
    // Note: `data?.gauges.find(...)` is NOT safe — `?.` only short-circuits on
    // the `data` access. If `data` is non-null but `gauges` is somehow missing
    // (defensive: API could change shape), `.find` would throw. Use `?.` twice.
    data?.gauges?.find((g) => g.gauge_id === selectedGaugeId) ?? null;
  const breakdown = data?.severity_breakdown ?? {};

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ---------------------------------------------- */}
      {/* Header strip                                    */}
      {/* ---------------------------------------------- */}
      <div className="bg-gradient-to-r from-blue-700 to-cyan-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold">Sri Lanka Flood Hub</h1>
              <p className="text-blue-100 text-sm mt-1">
                Real-time river-gauge forecasts powered by{' '}
                <a
                  className="underline hover:text-white"
                  href="https://sites.research.google/floods/l/7.873/80.7718/8"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google Flood Hub
                </a>
                .
              </p>
            </div>
            {data && (
              <div className="text-xs text-blue-100">
                Updated {new Date(data.fetched_at).toLocaleString()} ·{' '}
                {data.gauge_count} gauges · cache TTL {data.cache_ttl_minutes}m
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ---------------------------------------------- */}
        {/* Loading / error states                          */}
        {/* ---------------------------------------------- */}
        {loading && (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
            <div className="w-10 h-10 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Loading flood data…</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
            <p className="text-amber-900 text-sm font-medium">{error}</p>
            <p className="text-amber-700 text-xs mt-1">
              In the meantime, view the public map at{' '}
              <a
                className="underline"
                href="https://sites.research.google/floods/l/7.873/80.7718/8"
                target="_blank"
                rel="noopener noreferrer"
              >
                sites.research.google/floods
              </a>
              .
            </p>
          </div>
        )}

        {/* ---------------------------------------------- */}
        {/* Severity summary cards (also act as filters)    */}
        {/* ---------------------------------------------- */}
        {!loading && !error && data && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(['EXTREME', 'SEVERE', 'WARNING', 'NO_KNOWN_FLOODING', 'UNKNOWN'] as const).map((sev) => {
              const style = styleFor(sev);
              const count = breakdown[sev.toLowerCase()] ?? 0;
              const isActive = severityFilter === sev;
              return (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(isActive ? null : sev)}
                  className={`text-left rounded-lg p-3 transition-all ${
                    isActive
                      ? `${style.bg} ${style.text} ring-2 ring-offset-2 ring-blue-500`
                      : 'bg-white border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-2xl font-bold">{count}</div>
                  <div className={`text-xs font-medium ${isActive ? 'opacity-90' : 'text-slate-600'}`}>
                    {style.label}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ---------------------------------------------- */}
        {/* Map + side panel                                */}
        {/* ---------------------------------------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div
              ref={mapRef}
              className="w-full h-[60vh] min-h-[400px]"
              role="application"
              aria-label="Sri Lanka flood gauge map"
            />
            {/* Overlay toggles for the static hydrology layers. */}
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-700 flex flex-wrap items-center gap-4">
              <span className="font-medium text-slate-600">Layers:</span>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBasins}
                  onChange={(e) => setShowBasins(e.target.checked)}
                  className="rounded"
                />
                River basins
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showRivers}
                  onChange={(e) => setShowRivers(e.target.checked)}
                  className="rounded"
                />
                River network
              </label>
              <span className="ml-auto text-slate-400 text-[10px]">HydroSHEDS v1.0</span>
            </div>

            {/* Cyclone Ditwah damage-assessment layers (Microsoft AI for Good).
                Grouped separately because they're event-specific and only
                cover a small bbox; the "Zoom to" button is essential since
                without it users would never know where the data lives. */}
            <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-900 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">🛰️ Cyclone Ditwah (30 Nov 2025) — Colombo area:</span>
                <button
                  type="button"
                  onClick={() => {
                    const map = googleMapRef.current;
                    if (!map || !window.google?.maps) return;
                    const bounds = new window.google.maps.LatLngBounds(
                      new window.google.maps.LatLng(AIG_BOUNDS.south, AIG_BOUNDS.west),
                      new window.google.maps.LatLng(AIG_BOUNDS.north, AIG_BOUNDS.east),
                    );
                    map.fitBounds(bounds);
                    // Turn the basemap on automatically so users see something
                    // immediately when they zoom in.
                    if (!showAigBasemap) setShowAigBasemap(true);
                  }}
                  className="px-2 py-0.5 rounded bg-amber-600 text-white hover:bg-amber-700 text-[11px] font-medium"
                >
                  Zoom to area
                </button>
                <a
                  href={AIG_VISUALIZER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto underline hover:text-amber-700 text-[11px]"
                >
                  Open full visualizer (swipe comparison) ↗
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAigBasemap}
                    onChange={(e) => setShowAigBasemap(e.target.checked)}
                    className="rounded"
                  />
                  Pre-event satellite
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAigBuildings}
                    onChange={(e) => setShowAigBuildings(e.target.checked)}
                    className="rounded"
                  />
                  Building damage
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAigFlood}
                    onChange={(e) => setShowAigFlood(e.target.checked)}
                    className="rounded"
                  />
                  Flood extent
                </label>
                <span className="ml-auto text-amber-700/70 text-[10px]">
                  Imagery © Planet Labs, predictions © Microsoft AI for Good. Zoom level 10+ required.
                </span>
              </div>
            </div>
            {severityFilter && (
              <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                <span>
                  Showing only{' '}
                  <strong>{styleFor(severityFilter).label}</strong> gauges
                </span>
                <button
                  className="text-blue-600 hover:underline"
                  onClick={() => setSeverityFilter(null)}
                >
                  Clear filter
                </button>
              </div>
            )}
          </div>

          {/* Side panel: selected gauge details OR list of gauges */}
          <aside className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
            {selectedGauge ? (
              <GaugeDetail
                gauge={selectedGauge}
                onClose={() => setSelectedGaugeId(null)}
              />
            ) : (
              <GaugeList
                gauges={data?.gauges ?? []}
                severityFilter={severityFilter}
                onSelect={setSelectedGaugeId}
              />
            )}
          </aside>
        </div>

        {/* ---------------------------------------------- */}
        {/* Attribution footer                              */}
        {/* ---------------------------------------------- */}
        <div className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg p-3 space-y-1">
          {data && <div>{data.license_note}</div>}
          <div>
            River basins and river network:{' '}
            <a
              href="https://www.hydrosheds.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-700"
            >
              HydroSHEDS
            </a>{' '}
            (HydroBASINS L8, HydroRIVERS v1.0) — Lehner &amp; Grill (2013), free for non-commercial use.
          </div>
          <div>
            Cyclone Ditwah damage imagery and predictions:{' '}
            <a
              href={AIG_VISUALIZER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-700"
            >
              Microsoft AI for Good
            </a>{' '}
            (30 Nov 2025), basemap imagery © Planet Labs.
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Helper components
// ------------------------------------------------------------------

function GaugeList({
  gauges,
  severityFilter,
  onSelect,
}: {
  gauges: GoogleFloodGauge[];
  severityFilter: string | null;
  onSelect: (id: string) => void;
}) {
  const filtered = gauges.filter(
    (g) => severityFilter === null || g.severity?.toUpperCase() === severityFilter,
  );
  // Sort most-severe first so the worst situations surface at the top.
  const severityOrder: Record<string, number> = {
    EXTREME: 0,
    SEVERE: 1,
    WARNING: 2,
    NO_KNOWN_FLOODING: 3,
    UNKNOWN: 4,
  };
  const sorted = [...filtered].sort(
    (a, b) =>
      (severityOrder[a.severity?.toUpperCase()] ?? 9) -
      (severityOrder[b.severity?.toUpperCase()] ?? 9),
  );

  return (
    <>
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-800">
          Gauges{' '}
          <span className="text-slate-500 font-normal">({sorted.length})</span>
        </h2>
      </div>
      <ul className="overflow-y-auto divide-y divide-slate-100 max-h-[60vh]">
        {sorted.map((g) => {
          const style = styleFor(g.severity);
          return (
            <li key={g.gauge_id}>
              <button
                onClick={() => onSelect(g.gauge_id)}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {g.river ?? 'Unnamed river'}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {g.site_name ?? g.gauge_id}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}
                  >
                    {style.label}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
        {sorted.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-slate-500">
            No gauges in this category.
          </li>
        )}
      </ul>
    </>
  );
}

function GaugeDetail({
  gauge,
  onClose,
}: {
  gauge: GoogleFloodGauge;
  onClose: () => void;
}) {
  const style = styleFor(gauge.severity);
  const thresholds = gauge.thresholds;

  return (
    <div className="flex flex-col h-full">
      <div className={`${style.bg} ${style.text} px-4 py-3 flex items-start justify-between`}>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide opacity-80">{style.label}</div>
          <div className="text-base font-semibold truncate">{gauge.river ?? 'Unnamed river'}</div>
          <div className="text-xs opacity-90 truncate">{gauge.site_name ?? gauge.gauge_id}</div>
        </div>
        <button
          onClick={onClose}
          className="opacity-80 hover:opacity-100 text-sm"
          aria-label="Close gauge details"
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-4 text-sm overflow-y-auto">
        <div>
          <div className="text-xs uppercase text-slate-500 mb-1">Current reading</div>
          <div className="text-2xl font-bold text-slate-900">
            {formatValue(gauge.current_value, gauge.current_value_unit)}
          </div>
          {gauge.issued_time && (
            <div className="text-xs text-slate-500 mt-1">
              Issued {new Date(gauge.issued_time).toLocaleString()}
            </div>
          )}
        </div>

        <div>
          <div className="text-xs uppercase text-slate-500 mb-1">Thresholds</div>
          <div className="grid grid-cols-3 gap-2">
            <ThresholdCell label="Warning" value={thresholds.warning} unit={gauge.current_value_unit} accent="bg-amber-100 text-amber-900" />
            <ThresholdCell label="Danger" value={thresholds.danger} unit={gauge.current_value_unit} accent="bg-orange-100 text-orange-900" />
            <ThresholdCell label="Extreme" value={thresholds.extreme} unit={gauge.current_value_unit} accent="bg-red-100 text-red-900" />
          </div>
        </div>

        {gauge.latitude != null && gauge.longitude != null && (
          <div className="text-xs text-slate-500">
            Location: {gauge.latitude.toFixed(4)}, {gauge.longitude.toFixed(4)}
          </div>
        )}

        {gauge.source_url && (
          <a
            href={gauge.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-blue-600 hover:underline"
          >
            Open on Google Flood Hub ↗
          </a>
        )}
      </div>
    </div>
  );
}

function ThresholdCell({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: number | null;
  unit: string | null;
  accent: string;
}) {
  return (
    <div className={`${accent} rounded p-2 text-center`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-sm font-semibold">
        {value === null || value === undefined ? '—' : formatValue(value, unit)}
      </div>
    </div>
  );
}
