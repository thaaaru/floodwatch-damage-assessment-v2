// SPDX-License-Identifier: Apache-2.0

'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, isDisabledMapFeature } from '@/lib/api';
import type {
  CandidateRoute,
  ElevationContext,
  EmergencyFacility,
  IrrigationStation,
  MapCoordinate,
  MapWeather,
  MetStation,
  MetStationsResponse,
  PlaceSuggestion,
} from '@/lib/api';
import { ui } from '@/lib/ui';
import BasinStatusTable from '@/components/BasinStatusTable';
import LatestNews, { ActiveWarnings, useNews } from '@/components/LatestNews';
import RainContext from '@/components/RainContext';
import ExternalFloodSources from '@/components/ExternalFloodSources';

const MetStationsMap = dynamic(() => import('@/components/MetStationsMap'), {
  ssr: false,
  loading: () => <MapMessage text="Loading map…" busy />,
});

type Mode = 'public' | 'technical';
type TechnicalSource = 'all' | 'rainfall' | 'gauges';
type Freshness = 'all' | 'current' | 'stale';
type ContextSourceState = 'idle' | 'loading' | 'success' | 'empty' | 'disabled' | 'error';

const fmt = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(digits);

export default function Dashboard() {
  const [mode, setMode] = useState<Mode>('technical');
  const [data, setData] = useState<MetStationsResponse | null>(null);
  const [selected, setSelected] = useState<MetStation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [gauges, setGauges] = useState<IrrigationStation[]>([]);
  const [technicalSource, setTechnicalSource] = useState<TechnicalSource>('all');
  const [rainSourceState, setRainSourceState] = useState<ContextSourceState>('loading');
  const [gaugeSourceState, setGaugeSourceState] = useState<ContextSourceState>('loading');
  const [freshness, setFreshness] = useState<Freshness>('all');
  const news = useNews();

  const [location, setLocation] = useState<MapCoordinate | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'disabled' | 'error'>('idle');
  const [contextLoading, setContextLoading] = useState(false);
  const [weatherState, setWeatherState] = useState<ContextSourceState>('idle');
  const [elevationState, setElevationState] = useState<ContextSourceState>('idle');
  const [facilitiesState, setFacilitiesState] = useState<ContextSourceState>('idle');
  const [weather, setWeather] = useState<MapWeather | null>(null);
  const [elevation, setElevation] = useState<ElevationContext | null>(null);
  const [facilities, setFacilities] = useState<EmergencyFacility[]>([]);
  const [destination, setDestination] = useState<EmergencyFacility | null>(null);
  const [route, setRoute] = useState<CandidateRoute | null>(null);
  const [routeState, setRouteState] = useState<'idle' | 'loading' | 'disabled' | 'error'>('idle');
  const contextRequestRef = useRef(0);
  const routeRequestRef = useRef(0);
  const monitoringRequestRef = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++monitoringRequestRef.current;
    setLoading(true);
    setRainSourceState('loading');
    setGaugeSourceState('loading');
    const [rainResult, gaugeResult] = await Promise.allSettled([
      api.getMetStations(),
      api.getIrrigationData(),
    ]);
    if (requestId !== monitoringRequestRef.current) return;
    if (rainResult.status === 'fulfilled') {
      setData(rainResult.value);
      setRainSourceState(rainResult.value.stations.length === 0 ? 'empty' : 'success');
    } else {
      setRainSourceState('error');
    }
    if (gaugeResult.status === 'fulfilled') {
      const nextGauges = gaugeResult.value?.stations ?? [];
      setGauges(nextGauges);
      setGaugeSourceState(nextGauges.length === 0 ? 'empty' : 'success');
    } else {
      setGaugeSourceState('error');
    }
    const failed = rainResult.status === 'rejected' || gaugeResult.status === 'rejected';
    setError(failed ? 'One or more measured monitoring sources are temporarily unavailable.' : null);
    if (rainResult.status === 'fulfilled' || gaugeResult.status === 'fulfilled') setLastFetched(new Date());
    setLoading(false);
  }, []);
  useEffect(() => {
    if (mode !== 'technical') return;
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData, mode]);

  const loadPublicContext = useCallback(async (point: MapCoordinate) => {
    const requestId = ++contextRequestRef.current;
    routeRequestRef.current += 1;
    setLocation(point);
    setDestination(null);
    setRoute(null);
    setContextLoading(true);
    setWeatherState('loading');
    setElevationState('loading');
    setFacilitiesState('loading');
    const [weatherResult, elevationResult, facilityResult] = await Promise.allSettled([
      api.getMapWeather(point.latitude, point.longitude),
      api.getElevation(point.latitude, point.longitude),
      api.getNearbyFacilities(point.latitude, point.longitude, 10, 4),
    ]);
    if (requestId !== contextRequestRef.current) return;
    if (weatherResult.status === 'fulfilled') {
      setWeather(weatherResult.value);
      setWeatherState('success');
    } else {
      setWeather(null);
      setWeatherState(isDisabledMapFeature(weatherResult.reason) ? 'disabled' : 'error');
    }
    if (elevationResult.status === 'fulfilled') {
      setElevation(elevationResult.value);
      setElevationState(elevationResult.value.elevation_m === null ? 'empty' : 'success');
    } else {
      setElevation(null);
      setElevationState(isDisabledMapFeature(elevationResult.reason) ? 'disabled' : 'error');
    }
    if (facilityResult.status === 'fulfilled') {
      const response = facilityResult.value;
      const nextFacilities = [
        ...(response.shelters ?? []),
        ...(response.hospitals ?? []),
        ...(response.police ?? []),
        ...(response.fire_stations ?? []),
      ];
      setFacilities(nextFacilities);
      setFacilitiesState(nextFacilities.length === 0 ? 'empty' : 'success');
    } else {
      setFacilities([]);
      setFacilitiesState(isDisabledMapFeature(facilityResult.reason) ? 'disabled' : 'error');
    }
    setContextLoading(false);
  }, []);

  const searchPlaces = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSearchState('loading');
    try {
      const results = await api.autocompletePlaces(query.trim());
      setSuggestions(results);
      setSearchState('idle');
    } catch (err) {
      setSuggestions([]);
      setSearchState(isDisabledMapFeature(err) ? 'disabled' : 'error');
    }
  };

  const choosePlace = async (place: PlaceSuggestion) => {
    setSearchState('loading');
    try {
      const details = await api.getPlace(place.place_id);
      setQuery(details.formatted_address ?? details.name ?? place.description);
      setSuggestions([]);
      setSearchState('idle');
      await loadPublicContext(details);
    } catch (err) {
      setSearchState(isDisabledMapFeature(err) ? 'disabled' : 'error');
    }
  };

  const requestRoute = async (facility: EmergencyFacility) => {
    const requestId = ++routeRequestRef.current;
    if (!location) return;
    setDestination(facility);
    setRoute(null);
    setRouteState('loading');
    try {
      const candidate = await api.getCandidateRoute(location, { latitude: facility.lat, longitude: facility.lon });
      if (requestId !== routeRequestRef.current) return;
      setRoute(candidate);
      setRouteState('idle');
    } catch (err) {
      if (requestId !== routeRequestRef.current) return;
      setRouteState(isDisabledMapFeature(err) ? 'disabled' : 'error');
    }
  };

  const stations = data?.stations ?? [];
  const visibleStations = useMemo(() => {
    if (technicalSource === 'gauges') return [];
    if (freshness === 'all') return stations;
    const now = Date.now();
    return stations.filter((station) => {
      const stale = now - new Date(station.report_time_utc).getTime() > 4 * 60 * 60 * 1000;
      return freshness === 'stale' ? stale : !stale;
    });
  }, [freshness, stations, technicalSource]);
  const visibleGauges = useMemo(() => {
    if (technicalSource === 'rainfall') return [];
    if (freshness === 'all') return gauges;
    return gauges.filter((gauge) => (freshness === 'stale' ? gauge.stale : !gauge.stale));
  }, [freshness, gauges, technicalSource]);

  const exportVisible = () => {
    const rows: string[][] = [['kind', 'name', 'latitude', 'longitude', 'observed_at', 'value', 'unit', 'source']];
    visibleStations.forEach((station) => rows.push([
      'rainfall_station', station.name, String(station.latitude), String(station.longitude), station.report_time_utc,
      String(station.rainfall_since_830am_mm ?? ''), 'mm', 'Sri Lanka Department of Meteorology',
    ]));
    visibleGauges.forEach((gauge) => rows.push([
      'river_gauge', gauge.station, String(gauge.lat ?? ''), String(gauge.lon ?? ''), gauge.observed_at,
      String(gauge.water_level_m ?? ''), 'm', 'Irrigation Department of Sri Lanka',
    ]));
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `floodwatch-visible-measured-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const outageLabel = (state: ContextSourceState) => (state === 'error' ? 'unavailable' : state === 'empty' ? 'returning no observations' : null);
  const sourceOutage = [
    outageLabel(rainSourceState) && `Rainfall feed (Department of Meteorology) is ${outageLabel(rainSourceState)}.`,
    outageLabel(gaugeSourceState) && `River gauge feed (Irrigation Department) is ${outageLabel(gaugeSourceState)}.`,
  ].filter(Boolean).join(' ');

  const selectedWeather = (weather?.weather && typeof weather.weather === 'object' ? weather.weather : weather) as Record<string, unknown> | null;
  const reportTime = data?.summary?.report_time_utc
    ? new Date(data.summary.report_time_utc).toLocaleString('en-LK', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
    : null;

  return (
    <div className={ui.page}>
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className={ui.h1}>FloodWatch map</h1>
              <p className={`${ui.intro} mt-1 hidden sm:block`}>{mode === 'public' ? 'Plan with model context and clearly labelled candidate facilities.' : 'Inspect measured rainfall and river-gauge observations.'}</p>
            </div>
            <div role="group" aria-label="Map mode" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900 p-1">
              {(['public', 'technical'] as const).map((value) => (
                <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`${mode === value ? 'bg-cyan-700 text-white' : 'text-slate-300 hover:bg-slate-700'} focus-ring min-h-[44px] rounded-lg px-4 text-sm font-semibold capitalize`}>
                  {value === 'public' ? 'Public evacuation' : 'Technical monitoring'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-8 py-4 space-y-4">
        <ActiveWarnings items={news} />
        {mode === 'public' ? (
          <section className="space-y-4" aria-labelledby="public-map-heading">
            <div className="rounded-xl border border-amber-600/60 bg-amber-950/50 p-3 text-sm text-amber-100" role="note">
              <strong>Road safety:</strong> Candidate routes may be flooded, blocked, or outdated. Never enter floodwater. Follow official evacuation orders and local emergency services.
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
              <aside className={`${ui.card} ${ui.cardPad} space-y-4`}>
                <div>
                  <h2 id="public-map-heading" className={ui.h2}>Choose a location</h2>
                  <p className={`${ui.meta} mt-1`}>Search when available, click a point, or pan the map and choose “Use map centre”.</p>
                </div>
                <form onSubmit={searchPlaces} className="space-y-2">
                  <label htmlFor="place-search" className="block text-sm font-medium text-slate-200">Place search</label>
                  <div className="flex gap-2">
                    <input id="place-search" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" className="focus-ring min-h-[44px] min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-white" placeholder="Town or address" />
                    <button type="submit" disabled={searchState === 'loading' || query.trim().length < 2} className="focus-ring min-h-[44px] rounded-lg bg-cyan-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{searchState === 'loading' ? 'Searching…' : 'Search'}</button>
                  </div>
                  {searchState === 'disabled' && <p className="text-xs text-amber-300" role="status">Place search is unavailable because the server integration is not configured. Select the map instead.</p>}
                  {searchState === 'error' && <p className="text-xs text-red-300" role="alert">Place search failed. Select the map or try again.</p>}
                </form>
                {suggestions.length > 0 && (
                  <div className="space-y-1">
                    <ul aria-label="Place suggestions" className="divide-y divide-slate-700 rounded-lg border border-slate-700">
                      {suggestions.map((place) => <li key={place.place_id}><button type="button" onClick={() => choosePlace(place)} className="focus-ring min-h-[44px] w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700">{place.description}</button></li>)}
                    </ul>
                    {suggestions[0].source === 'OpenStreetMap Nominatim' && (
                      <p className="text-xs text-slate-400">Search data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">OpenStreetMap contributors</a></p>
                    )}
                  </div>
                )}
                {location ? (
                  <div className="space-y-3" aria-live="polite">
                    <div className={`${ui.inset} p-3`}>
                      <div className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Selected location</div>
                      <div className="mt-1 font-mono text-sm">{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</div>
                    </div>
                    <div className="min-h-[116px]" aria-busy={contextLoading}>
                      {contextLoading ? (
                        <div className="grid grid-cols-2 gap-2" role="status">
                          <ContextStat label="24h model rain" value="Loading…" source="Open-Meteo model" />
                          <ContextStat label="Elevation" value="Loading…" source="Elevation service" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <ContextStat label="24h model rain" value={weatherState === 'success' ? `${fmt(Number(selectedWeather?.rainfall_24h_mm))} mm` : sourceStateLabel(weatherState)} source="Open-Meteo model" />
                          <ContextStat label="Elevation" value={elevationState === 'success' ? `${fmt(elevation?.elevation_m)} m` : sourceStateLabel(elevationState)} source={elevation?.source ?? 'Elevation service'} />
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">Nearby facility candidates</h3>
                      <p className="mt-1 text-xs text-amber-300">Unverified OpenStreetMap data. Confirm availability before travel.</p>
                    </div>
                    {facilitiesState === 'error' || facilitiesState === 'disabled' ? (
                      <p className={facilitiesState === 'disabled' ? 'text-xs text-amber-300' : 'text-xs text-red-300'} role={facilitiesState === 'error' ? 'alert' : 'status'}>
                        Nearby facilities are {facilitiesState === 'disabled' ? 'not configured' : 'temporarily unavailable'}.
                      </p>
                    ) : facilitiesState === 'empty' ? (
                      <p className={ui.meta} role="status">No nearby facility candidates were returned for this point.</p>
                    ) : facilities.length > 0 ? (
                      <ul className="max-h-64 space-y-2 overflow-y-auto">
                        {facilities.map((facility) => (
                          <li key={`${facility.type}-${facility.id}`} className={`${ui.inset} p-3`}>
                            <div className="text-sm font-medium text-white">{facility.name}</div>
                            <div className="text-xs text-slate-400">{facility.label}{facility.distance_km !== undefined ? ` · ${facility.distance_km.toFixed(1)} km` : ''}</div>
                            {facility.phone && (
                              <a href={`tel:${facility.phone.split(';', 1)[0].replace(/[^\d+]/g, '')}`} className="focus-ring mt-2 inline-flex min-h-[44px] items-center rounded-lg px-1 text-sm font-semibold text-cyan-200 underline underline-offset-2" aria-label={`Call ${facility.name} at ${facility.phone}`}>
                                Call {facility.phone}
                              </a>
                            )}
                            <button type="button" onClick={() => requestRoute(facility)} className="focus-ring mt-2 min-h-[44px] w-full rounded-lg border border-cyan-700 px-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-950">Show candidate route</button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {!contextLoading && [weatherState, elevationState, facilitiesState].some((state) => state === 'error') && (
                      <button type="button" onClick={() => loadPublicContext(location)} className="focus-ring min-h-[44px] rounded-lg border border-cyan-700 px-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-950">Retry unavailable context</button>
                    )}
                    {routeState === 'loading' && <p className={ui.meta} role="status">Loading candidate route…</p>}
                    {routeState === 'disabled' && <p className="text-xs text-amber-300" role="status">Candidate routing is unavailable because the server integration is not configured.</p>}
                    {routeState === 'error' && destination && <p className="text-xs text-red-300" role="alert">A candidate route could not be loaded. <button type="button" onClick={() => requestRoute(destination)} className="focus-ring min-h-[44px] underline">Retry route</button></p>}
                    {route && destination && <div className="rounded-lg border border-cyan-800 bg-cyan-950/40 p-3 text-xs text-cyan-100"><strong>Candidate route to {destination.name}</strong><p className="mt-1">{route.safety_disclaimer}</p><p className="mt-1 text-cyan-300">Source: {route.source}</p></div>}
                  </div>
                ) : <p className={ui.meta}>No location selected. Search, click the map, or use the “Use map centre” control.</p>}
              </aside>
              <div className={`${ui.card} relative h-[55vh] min-h-[420px] overflow-hidden lg:h-[calc(100dvh-13rem)]`}>
                <MetStationsMap mode="public" stations={[]} selectedWmoId={null} onStationSelect={() => {}} selectedLocation={location} onLocationSelect={loadPublicContext} facilities={facilities} route={route} />
              </div>
            </div>
          </section>
        ) : (
          <section className="flex flex-col gap-4" aria-labelledby="technical-map-heading">
            {sourceOutage && (
              <div className="order-1 rounded-xl border border-amber-500 bg-amber-950/60 p-3 text-sm text-amber-50 lg:order-none" role="alert">
                <strong>{sourceOutage}</strong> Missing markers do not mean no rain or normal rivers. Check the DMC and Met Department, and the aggregator sources further down.
              </div>
            )}
            <div className={`${ui.card} ${ui.cardPad} order-3 flex flex-col gap-3 lg:order-none xl:flex-row xl:items-start xl:justify-between`}>
              <div><h2 id="technical-map-heading" className={ui.h2}>Measured monitoring</h2><p className={`${ui.meta} mt-1`}>Measured observations only. Model overlays are labelled in the map layer control.</p></div>
              <div className="flex flex-wrap gap-3">
                <FilterGroup label="Source" value={technicalSource} values={[['all', 'All measured'], ['rainfall', 'Rain stations'], ['gauges', 'River gauges']]} onChange={setTechnicalSource} />
                <FilterGroup label="Freshness" value={freshness} values={[['all', 'All'], ['current', 'Current'], ['stale', 'Stale']]} onChange={setFreshness} />
                <button type="button" onClick={exportVisible} disabled={visibleStations.length + visibleGauges.length === 0} className="focus-ring min-h-[44px] self-end rounded-lg border border-cyan-700 px-4 text-sm font-semibold text-cyan-200 hover:bg-cyan-950 disabled:opacity-50">Export visible measured CSV</button>
              </div>
            </div>
            <div className="order-2 grid gap-4 lg:order-none lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className={`${ui.card} relative h-[max(420px,60vh)] overflow-hidden lg:h-[max(500px,calc(100dvh-12rem))]`}>
                {loading && stations.length === 0 ? (
                  <MapMessage text="Loading measured observations…" busy />
                ) : error && stations.length === 0 && gauges.length === 0 ? (
                  <MapMessage text={error} kind="error" actionLabel="Retry measured data" onAction={fetchData} />
                ) : stations.length === 0 && gauges.length === 0 ? (
                  <MapMessage text="No measured observations are available yet." kind="empty" actionLabel="Check again" onAction={fetchData} />
                ) : (
                  <MetStationsMap mode="technical" stations={visibleStations} selectedWmoId={selected?.wmo_id ?? null} onStationSelect={setSelected} gauges={visibleGauges} />
                )}
                {selected && <StationCard station={selected} onClose={() => setSelected(null)} />}
              </div>
              <div className="space-y-4 lg:max-h-[max(500px,calc(100dvh-12rem))] lg:overflow-y-auto">
                <div className={`${ui.card} ${ui.cardPad} space-y-2 text-sm text-slate-300`}>
                  <div><strong className="text-white">{visibleStations.length}</strong> measured rain stations · <strong className="text-white">{visibleGauges.length}</strong> measured river gauges</div>
                  <div>Rainfall source: Sri Lanka Department of Meteorology {rainSourceState === 'error' ? '· temporarily unavailable' : reportTime ? `· report ${reportTime}` : rainSourceState === 'empty' ? '· no observations returned' : '· report time unavailable'}</div>
                  <div>Gauge source: Irrigation Department of Sri Lanka · {gaugeSourceState === 'error' ? 'temporarily unavailable' : gaugeSourceState === 'empty' ? 'no observations returned' : `${visibleGauges.filter((gauge) => gauge.stale).length} stale visible`}</div>
                  {lastFetched && <div>Interface refreshed {lastFetched.toLocaleTimeString('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit' })}</div>}
                  {error && <div className="space-y-2" role="alert"><p className="text-red-300">{error}</p><button type="button" onClick={fetchData} className="focus-ring min-h-[44px] rounded-lg border border-cyan-700 px-3 font-semibold text-cyan-200 hover:bg-cyan-950">Retry unavailable sources</button></div>}
                </div>
                <LatestNews items={news} />
              </div>
            </div>
            <div className="order-4 space-y-4 lg:order-none">
              <BasinStatusTable stations={visibleGauges} />
              <RainContext />
              <ExternalFloodSources />
              <p className={ui.muted}>CSV export includes only the currently visible measured Sri Lanka Department of Meteorology stations and Irrigation Department gauges. It never exports model, route, place, facility, or Google Flood Forecasting data.</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function MapMessage({ text, busy = false, kind = 'empty', actionLabel, onAction }: { text: string; busy?: boolean; kind?: 'empty' | 'error'; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-900 px-4 text-center text-sm text-slate-300" role={busy || kind === 'empty' ? 'status' : 'alert'} aria-busy={busy || undefined}>
      <p>{text}</p>
      {actionLabel && onAction && <button type="button" onClick={onAction} className="focus-ring min-h-[44px] rounded-lg border border-cyan-700 px-4 font-semibold text-cyan-200 hover:bg-cyan-950">{actionLabel}</button>}
    </div>
  );
}

function sourceStateLabel(state: ContextSourceState) {
  if (state === 'disabled') return 'Not configured';
  if (state === 'empty') return 'No data';
  return 'Temporarily unavailable';
}

function ContextStat({ label, value, source }: { label: string; value: string; source: string }) {
  return <div className={`${ui.inset} p-3`}><div className="text-xs text-slate-400">{label}</div><div className="font-mono font-semibold text-white">{value}</div><div className="mt-1 text-[10px] text-slate-400">{source}</div></div>;
}

function FilterGroup<T extends string>({ label, value, values, onChange }: { label: string; value: T; values: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  return <fieldset><legend className="mb-1 text-xs font-medium text-slate-300">{label}</legend><div className="flex flex-wrap gap-1" role="group">{values.map(([key, text]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)} className={`${value === key ? 'bg-cyan-800 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-700'} focus-ring min-h-[44px] min-w-[44px] rounded-lg border border-slate-700 px-3 text-xs font-medium`}>{text}</button>)}</div></fieldset>;
}

function StationCard({ station, onClose }: { station: MetStation; onClose: () => void }) {
  return <div className="absolute inset-x-3 bottom-3 z-10 rounded-xl border border-slate-700 bg-slate-800 p-3 shadow-2xl sm:left-auto sm:max-w-sm"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-white">{station.name}</div><div className="text-xs text-slate-400">{station.district} · measured · WMO {station.wmo_id}</div></div><button type="button" onClick={onClose} className="focus-ring min-h-[44px] min-w-[44px] rounded-lg text-slate-300 hover:bg-slate-700" aria-label="Close station details">×</button></div><dl className="mt-2 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-slate-400">Since 08:30</dt><dd className="font-mono text-white">{fmt(station.rainfall_since_830am_mm)} mm</dd></div><div><dt className="text-slate-400">Last 3h</dt><dd className="font-mono text-white">{fmt(station.rainfall_3h_mm)} mm</dd></div></dl></div>;
}
