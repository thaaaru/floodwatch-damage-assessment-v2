// SPDX-License-Identifier: Apache-2.0
// Build public/data/places.geojson (city/town labels for the home map) from the
// self-hosted Protomaps archive. Re-run after scripts/build_basemap.sh:
//   node scripts/build_places.mjs [pmtiles URL]
import { writeFileSync } from 'node:fs';
import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';

const URL_ = process.argv[2] ?? 'https://floodwatch.teklab.dev/tiles/lka.pmtiles';
const Z = 10;
const [W, S, E, N] = [79.4, 5.8, 82.1, 10.0];
const MAJOR = ['Jaffna', 'Trincomalee', 'Anuradhapura', 'Batticaloa', 'Kandy', 'Colombo', 'Ratnapura', 'Galle'];

const tx = (lon) => Math.floor(((lon + 180) / 360) * 2 ** Z);
const ty = (lat) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** Z);

const pm = new PMTiles(URL_);
const seen = new Map();
for (let x = tx(W); x <= tx(E); x++) {
  for (let y = ty(N); y <= ty(S); y++) {
    const t = await pm.getZxy(Z, x, y);
    const layer = t && new VectorTile(new Pbf(new Uint8Array(t.data))).layers.places;
    for (let i = 0; layer && i < layer.length; i++) {
      const f = layer.feature(i).toGeoJSON(x, y, Z);
      const p = f.properties;
      if (p.kind !== 'locality' || !['city', 'town'].includes(p.kind_detail)) continue;
      const name = p['name:en'] ?? p.name;
      if (!name || seen.has(name)) continue;
      const [lon, lat] = f.geometry.coordinates;
      if (lon < W || lon > E || lat < S || lat > N) continue;
      seen.set(name, { type: 'Feature', geometry: { type: 'Point', coordinates: [+lon.toFixed(4), +lat.toFixed(4)] },
        properties: { name, major: MAJOR.includes(name), population: p.population ?? null } });
    }
  }
}
const missing = MAJOR.filter((m) => !seen.has(m));
if (missing.length) throw new Error(`major cities not found: ${missing.join(', ')}`);
const features = [...seen.values()].sort((a, b) => (b.properties.population ?? 0) - (a.properties.population ?? 0));
writeFileSync(new URL('../public/data/places.geojson', import.meta.url), JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`${features.length} places written`);
