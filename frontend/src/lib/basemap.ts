// SPDX-License-Identifier: Apache-2.0

// Self-hosted basemap for every Leaflet map: a Sri Lanka Protomaps extract
// (scripts/build_basemap.sh) served same-origin at /tiles/lka.pmtiles with
// HTTP Range requests, rendered by protomaps-leaflet. No third-party tile
// requests on a normal visit. If the archive cannot be read, maps fall back to
// OSM raster tiles (tile.openstreetmap.org) so they never go blank.
//
// SSR-safe: Leaflet, protomaps-leaflet and pmtiles are imported lazily inside
// the functions, so server-rendered pages can import the constants below.

import type * as Leaflet from 'leaflet';
import type { PMTiles } from 'pmtiles';

export const PMTILES_URL = '/tiles/lka.pmtiles'; // Sri Lanka, data to z15
// Lower tiers fill the view outside the detailed extract. Bounds must match the
// bboxes in scripts/build_basemap.sh ([[south, west], [north, east]]).
type Bounds = [[number, number], [number, number]];
const TIERS: { url: string; bounds?: Bounds }[] = [
  { url: '/tiles/context.pmtiles' }, // 30,-25,140,40, data to z6
  { url: '/tiles/region.pmtiles', bounds: [[0, 65], [25, 95]] }, // data to z8
  { url: PMTILES_URL, bounds: [[5.8, 79.4], [10.0, 82.1]] }, // Sri Lanka, data to z15
];
export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &middot; ' +
  '<a href="https://protomaps.com">Protomaps</a>';
export const BASEMAP_MAX_ZOOM = 18; // protomaps-leaflet overzooms past the data's maxzoom

// Fallback only (and the standalone HTML export, which cannot reach /tiles).
export const OSM_RASTER_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_RASTER_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export type BasemapFlavor = 'light' | 'dark';

type Source = { pmtiles: PMTiles; maxDataZoom: number };
const sources = new Map<string, Promise<Source | null>>();

// One PMTiles instance per archive per page, so all maps share its header/directory cache.
function pmtilesSource(url: string): Promise<Source | null> {
  if (!sources.has(url)) {
    sources.set(url, import('pmtiles')
      .then(async ({ PMTiles }) => {
        const pmtiles = new PMTiles(url);
        const header = await pmtiles.getHeader();
        return { pmtiles, maxDataZoom: header.maxZoom };
      })
      .catch((e) => {
        console.warn(`Self-hosted basemap ${url} unavailable.`, e);
        return null;
      }));
  }
  return sources.get(url)!;
}

/**
 * Add the basemap to `map`: context (z<=6) under region (z<=8) under the
 * detailed Sri Lanka archive, each upper tier restricted to its bbox. Tiles
 * paint an opaque background, so a lower tier only shows where the tier above
 * has no tiles, and low zooms have no edge where the Sri Lanka extract ends.
 * Missing context/region archives are skipped; if the Sri Lanka archive cannot
 * be read, falls back to OSM raster tiles.
 */
export async function addBasemap(map: Leaflet.Map, flavor: BasemapFlavor = 'light'): Promise<Leaflet.Layer | null> {
  const L = (await import('leaflet')).default;
  const srcs = await Promise.all(TIERS.map((t) => pmtilesSource(t.url)));
  const lka = srcs[srcs.length - 1];
  let layer: Leaflet.Layer;
  if (lka) {
    const { leafletLayer } = await import('protomaps-leaflet');
    const vector = (src: Source, extra: object) => leafletLayer({
      url: src.pmtiles,
      flavor,
      lang: 'en', // protomaps-leaflet renders one label language per layer
      maxDataZoom: src.maxDataZoom,
      maxZoom: BASEMAP_MAX_ZOOM,
      ...extra,
    }) as unknown as Leaflet.Layer;
    const layers = TIERS.flatMap((t, i) => {
      const src = srcs[i];
      if (!src) return [];
      const top = i === TIERS.length - 1;
      return [vector(src, {
        zIndex: i,
        ...(t.bounds && { bounds: L.latLngBounds(t.bounds) }),
        attribution: top ? BASEMAP_ATTRIBUTION : '', // one credit for the whole stack
      })];
    });
    layer = L.layerGroup(layers);
  } else {
    console.warn('Falling back to OSM raster tiles.');
    layer = L.tileLayer(OSM_RASTER_URL, { maxZoom: 19, attribution: OSM_RASTER_ATTRIBUTION });
  }
  // map.remove() deletes _mapPane; skip if the map went away while the headers loaded.
  if (!(map as unknown as { _mapPane?: HTMLElement })._mapPane) return null;
  layer.addTo(map);
  return layer;
}

// Optional Esri imagery: only when NEXT_PUBLIC_ARCGIS_API_KEY was set at build
// time; off by default and nothing is requested until a user switches it on.
const ARCGIS_API_KEY = process.env.NEXT_PUBLIC_ARCGIS_API_KEY || '';
export const SATELLITE_ATTRIBUTION = 'Imagery: Esri, Maxar, Earthstar Geographics';

/** Adds the imagery overlay to `control`; returns false (and adds nothing) without a key. */
export function addSatelliteOption(
  L: typeof Leaflet,
  control: Leaflet.Control.Layers,
  label = 'Satellite (Esri)',
): boolean {
  if (!ARCGIS_API_KEY) return false;
  const imagery = L.tileLayer(
    'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' +
      `?token=${encodeURIComponent(ARCGIS_API_KEY)}`,
    { maxZoom: 19, zIndex: 10, attribution: SATELLITE_ATTRIBUTION },
  );
  control.addOverlay(imagery, label);
  return true;
}
