// SPDX-License-Identifier: Apache-2.0

// Town and city names for the home map, drawn as DOM labels in a pane above every marker
// (the basemap's own place labels are off). Data: public/data/places.geojson, built from the
// Protomaps archive by scripts/build_places.mjs. Colours come from CSS vars set per theme.

import L from 'leaflet';

const PANE = 'fw-places'; // z 640: above gauges (620) and rain badges (610)
const ALL_TOWNS_ZOOM = 8; // below this only the major cities show

type Place = { name: string; major: boolean; at: L.LatLng };

let placesPromise: Promise<Place[]> | null = null;
function loadPlaces(): Promise<Place[]> {
  placesPromise ??= fetch('/data/places.geojson')
    .then((r) => {
      if (!r.ok) throw new Error(`places ${r.status}`);
      return r.json() as Promise<GeoJSON.FeatureCollection<GeoJSON.Point>>;
    })
    .then((fc) => fc.features.map((f) => ({
      name: String(f.properties?.name),
      major: !!f.properties?.major,
      at: L.latLng(f.geometry.coordinates[1], f.geometry.coordinates[0]),
    })))
    // Majors first, then the file's population order, so the greedy pass below keeps the big names.
    .then((ps) => [...ps.filter((p) => p.major), ...ps.filter((p) => !p.major)]);
  return placesPromise;
}

export function createPlaceLabels(map: L.Map): L.LayerGroup {
  if (!map.getPane(PANE)) {
    const pane = map.createPane(PANE);
    pane.style.zIndex = '640';
    pane.style.pointerEvents = 'none';
  }
  const layer = L.layerGroup();
  let places: Place[] = [];

  const render = () => {
    layer.clearLayers();
    const z = map.getZoom();
    const view = map.getBounds().pad(0.1);
    // Greedy collision check in screen space: a label is dropped if it would overlap one already placed.
    // ponytail: width estimated from character count; measure text if labels start to clip.
    const taken: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const p of places) {
      if ((!p.major && z < ALL_TOWNS_ZOOM) || !view.contains(p.at)) continue;
      const pt = map.latLngToContainerPoint(p.at);
      const w = p.name.length * (p.major ? 7.5 : 6.6) + 6;
      const box = { x0: pt.x - w / 2, x1: pt.x + w / 2, y0: pt.y + 3, y1: pt.y + (p.major ? 21 : 19) };
      if (taken.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) continue;
      taken.push(box);
      L.marker(p.at, {
        pane: PANE,
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'fw-place-wrap',
          html: `<span class="fw-place${p.major ? ' fw-place-major' : ''}">${p.name.replace(/[&<>]/g, '')}</span>`,
          iconSize: [0, 0],
        }),
      }).addTo(layer);
    }
  };

  layer.on('add', () => {
    map.on('zoomend moveend', render);
    loadPlaces()
      .then((ps) => { places = ps; if (map.hasLayer(layer)) render(); })
      .catch((e) => console.error('Failed to load place labels:', e));
  });
  layer.on('remove', () => map.off('zoomend moveend', render));
  return layer;
}
