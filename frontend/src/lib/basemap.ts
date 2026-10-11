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

export const PMTILES_URL = '/tiles/lka.pmtiles';
export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &middot; ' +
  '<a href="https://protomaps.com">Protomaps</a>';
export const BASEMAP_MAX_ZOOM = 18; // data is z15; protomaps-leaflet overzooms above that

// Fallback only (and the standalone HTML export, which cannot reach /tiles).
export const OSM_RASTER_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_RASTER_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export type BasemapFlavor = 'light' | 'dark';

type Source = { pmtiles: PMTiles; maxDataZoom: number };
let sourcePromise: Promise<Source | null> | null = null;

// One PMTiles instance per page, so all maps share its header/directory cache.
function pmtilesSource(): Promise<Source | null> {
  sourcePromise ??= import('pmtiles')
    .then(async ({ PMTiles }) => {
      const pmtiles = new PMTiles(PMTILES_URL);
      const header = await pmtiles.getHeader();
      return { pmtiles, maxDataZoom: header.maxZoom };
    })
    .catch((e) => {
      console.warn(`Self-hosted basemap ${PMTILES_URL} unavailable; falling back to OSM raster tiles.`, e);
      return null;
    });
  return sourcePromise;
}

/** Add the basemap (self-hosted vector, or OSM raster fallback) to `map`. */
export async function addBasemap(map: Leaflet.Map, flavor: BasemapFlavor = 'light'): Promise<Leaflet.Layer | null> {
  const L = (await import('leaflet')).default;
  const source = await pmtilesSource();
  let layer: Leaflet.Layer;
  if (source) {
    const { leafletLayer } = await import('protomaps-leaflet');
    layer = leafletLayer({
      url: source.pmtiles,
      flavor,
      lang: 'en', // protomaps-leaflet renders one label language per layer
      maxDataZoom: source.maxDataZoom,
      maxZoom: BASEMAP_MAX_ZOOM,
      attribution: BASEMAP_ATTRIBUTION,
    }) as unknown as Leaflet.Layer;
  } else {
    layer = L.tileLayer(OSM_RASTER_URL, { maxZoom: 19, attribution: OSM_RASTER_ATTRIBUTION });
  }
  // map.remove() deletes _mapPane; skip if the map went away while the header loaded.
  if (!(map as unknown as { _mapPane?: HTMLElement })._mapPane) return null;
  layer.addTo(map);
  return layer;
}

// Optional Esri imagery: only when NEXT_PUBLIC_ARCGIS_API_KEY was set at build
// time; off by default and nothing is requested until a user switches it on.
const ARCGIS_API_KEY = process.env.NEXT_PUBLIC_ARCGIS_API_KEY || '';
export const SATELLITE_ATTRIBUTION = 'Imagery: Esri, Maxar, Earthstar Geographics';

/** Adds the imagery overlay to `control`; returns false (and adds nothing) without a key. */
export function addSatelliteOption(L: typeof Leaflet, control: Leaflet.Control.Layers): boolean {
  if (!ARCGIS_API_KEY) return false;
  const imagery = L.tileLayer(
    'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' +
      `?token=${encodeURIComponent(ARCGIS_API_KEY)}`,
    { maxZoom: 19, zIndex: 2, attribution: SATELLITE_ATTRIBUTION },
  );
  control.addOverlay(imagery, 'Satellite (Esri)');
  return true;
}
