// SPDX-License-Identifier: Apache-2.0

// Town and city names for the home map, drawn as DOM labels in a pane above every marker
// (the basemap's own place labels are off). Data: public/data/places.geojson, built from the
// Protomaps archive by scripts/build_places.mjs. Colours come from CSS vars set per theme.

import L from 'leaflet';

const PANE = 'fw-places'; // z 640: above gauges (620) and rain badges (610)
const GAUGES = 'fw-gauges'; // flood markers names step around; rain badges move around names instead (lib/rainNormal.ts)
// How many names (in rank order: the 8 major cities, then by population) a zoom level may show.
// Collisions can drop some of these; zooming in raises the cap.
const nameCap = (z: number) => (z < 7 ? 4 : z < 8 ? 6 : z < 8.5 ? 8 : z < 9 ? 20 : z < 10 ? 60 : Infinity);

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

  // Label spots, as the label centre's offset from the point, tried in order: below, above, right, left,
  // the four diagonals, then further out. A name steps around flood markers instead of hiding under them.
  const spots = (w: number, h: number) => {
    const [x, y, dx, dy] = [w / 2 + 7, h / 2 + 4, w / 2 + 3, h / 2 + 2];
    return [[0, y], [0, -y], [x, 0], [-x, 0], [dx, dy], [-dx, dy], [dx, -dy], [-dx, -dy], [0, y + h], [0, -y - h], [x + 14, 0], [-x - 14, 0], [0, y + 2 * h], [0, -y - 2 * h]];
  };

  const render = () => {
    layer.clearLayers();
    const z = map.getZoom();
    const view = map.getBounds().pad(0.1);
    // Greedy collision check in screen space: a label is dropped only if every spot overlaps a flood
    // marker (read from the DOM, plus 3 px) or a label already placed.
    // ponytail: width estimated from character count; measure text if labels start to clip.
    const origin = map.getContainer().getBoundingClientRect();
    const taken: number[][] = [...map.getContainer().querySelectorAll(`.leaflet-${GAUGES}-pane .leaflet-marker-icon`)].flatMap((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 14) return []; // small normal/no-threshold gauge dots may sit under a name
      return [[r.left - origin.left - 3, r.top - origin.top - 3, r.right - origin.left + 3, r.bottom - origin.top + 3]];
    });
    const free = (b: number[]) => !taken.some((t) => t[0] < b[2] && b[0] < t[2] && t[1] < b[3] && b[1] < t[3]);
    for (const p of places.slice(0, nameCap(z))) {
      if (!view.contains(p.at)) continue;
      const pt = map.latLngToContainerPoint(p.at);
      const w = p.name.length * (p.major ? 7.5 : 6.6) + 6;
      const h = p.major ? 18 : 16;
      const spot = spots(w, h).find(([dx, dy]) => free([pt.x + dx - w / 2, pt.y + dy - h / 2, pt.x + dx + w / 2, pt.y + dy + h / 2]));
      if (!spot) continue;
      const [dx, dy] = spot;
      taken.push([pt.x + dx - w / 2, pt.y + dy - h / 2, pt.x + dx + w / 2, pt.y + dy + h / 2]);
      L.marker(p.at, {
        pane: PANE,
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'fw-place-wrap',
          html: `<span class="fw-place${p.major ? ' fw-place-major' : ''}" style="transform:translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))">${p.name.replace(/[&<>]/g, '')}</span>`,
          iconSize: [0, 0],
        }),
      }).addTo(layer);
    }
  };
  // Re-place after the view settles and whenever a gauge marker is added or removed.
  let frame = 0;
  const schedule = (e?: L.LeafletEvent) => {
    if (e?.type !== 'zoomend' && e?.type !== 'moveend' && (e as L.LayerEvent).layer?.options?.pane !== GAUGES) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  };

  layer.on('add', () => {
    map.on('zoomend moveend layeradd layerremove', schedule);
    loadPlaces()
      .then((ps) => { places = ps; if (map.hasLayer(layer)) render(); })
      .catch((e) => console.error('Failed to load place labels:', e));
  });
  layer.on('remove', () => { map.off('zoomend moveend layeradd layerremove', schedule); cancelAnimationFrame(frame); });
  return layer;
}
