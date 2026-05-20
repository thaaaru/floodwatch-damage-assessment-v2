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

  // ------------------------------------------------------------------
  // Data fetch — cached server-side; safe to retry every few minutes.
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.getGoogleFloodGauges();
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        // The most common reason is the API key not being configured yet.
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
    const initMap = () => {
      if (!window.google?.maps) {
        setTimeout(initMap, 100);
        return;
      }
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
    };
    initMap();
    return () => {
      markersRef.current.forEach((m) => m.setMap?.(null));
      markersRef.current = [];
      basinLayerRef.current?.setMap?.(null);
      riverLayerRef.current?.setMap?.(null);
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
    data?.gauges.find((g) => g.gauge_id === selectedGaugeId) ?? null;
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
