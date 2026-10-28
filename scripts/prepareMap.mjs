// Convert the source geography to a local GeoJSON asset. Run: node scripts/prepareMap.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { feature } from 'topojson-client';

const source = new URL('../node_modules/world-atlas/countries-110m.json', import.meta.url);
const topology = JSON.parse(readFileSync(source, 'utf8'));
const collection = JSON.parse(JSON.stringify(feature(topology, topology.objects.countries)));
collection.features = collection.features.filter((country) => country.id !== '010');

// +180 and -180 describe the same meridian. TopoJSON may use either sign.
// Leaflet connects literal coordinates, so choose the sign matching each ring's
// side of the world, preventing artificial lines across Fiji and northern Russia.
// This normalises equivalent coordinates; it does not redraw any country border.
for (const country of collection.features) {
  const polygons = country.geometry.type === 'MultiPolygon'
    ? country.geometry.coordinates : [country.geometry.coordinates];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      const neighbour = ring.find(([longitude]) => Math.abs(longitude) < 179.99999);
      if (!neighbour) continue;
      for (const point of ring) {
        if (Math.abs(point[0]) === 180) point[0] = neighbour[0] < 0 ? -180 : 180;
      }
      // Unwrap any ring crossing the meridian (notably one Fijian island).
      // Longitudes differing by 360 degrees represent the same geographic point.
      for (let index = 1; index < ring.length; index++) {
        while (ring[index][0] - ring[index - 1][0] > 180) ring[index][0] -= 360;
        while (ring[index][0] - ring[index - 1][0] < -180) ring[index][0] += 360;
      }
    }
  }
}
mkdirSync(new URL('../public/data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/data/world-countries.json', import.meta.url), JSON.stringify(collection));
