// SPDX-License-Identifier: Apache-2.0

// Single basemap for every Leaflet map. OSM tile usage policy: no {s}
// subdomains, visible attribution, no bulk prefetching / offline caching.
export const BASEMAP_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const BASEMAP_MAX_ZOOM = 19;

// Add to a map container to darken only its tile pane (see globals.css).
export const DARK_BASEMAP_CLASS = 'fw-dark-basemap';
