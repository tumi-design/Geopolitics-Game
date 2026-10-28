import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { countries, filterCountries } from './countries.js';
import { createInitialGame } from '../engine/gameState.js';

test('every development country has matching geography and a local flag', () => {
  const geography = JSON.parse(readFileSync(new URL('../../public/data/world-countries.json', import.meta.url), 'utf8'));
  const ids = new Set(geography.features.map((item) => item.id));
  assert.equal(geography.type, 'FeatureCollection');
  assert.equal(new Set(countries.map((item) => item.id)).size, countries.length);
  for (const country of countries) {
    assert.ok(ids.has(country.id), `Missing map geometry: ${country.name}`);
    assert.ok(existsSync(new URL(`../../public/flags/${country.code.toLowerCase()}.svg`, import.meta.url)));
    assert.equal(country.population, 10_000_000);
  }
});

test('country search supports names, codes, regions and empty results without mutation', () => {
  const before = structuredClone(countries);
  assert.equal(filterCountries(countries, '  SOUTH AFRICA ')[0].id, '710');
  assert.equal(filterCountries(countries, 'ZA')[0].id, '710');
  assert.ok(filterCountries(countries, 'Oceania').every((country) => country.region === 'Oceania'));
  assert.deepEqual(filterCountries(countries, 'no such place'), []);
  assert.equal(filterCountries(countries, '').length, countries.length);
  assert.deepEqual(countries, before);
});

test('every selectable country can create a ten-country game using the unchanged engine', () => {
  for (const country of countries) {
    const game = createInitialGame(countries, country.id, () => 0.5);
    assert.equal(game.countries.length, 10);
    assert.equal(game.countries.find((item) => item.id === country.id).ownerId, 'human-player');
    assert.equal(new Set(game.countries.map((item) => item.id)).size, 10);
    assert.ok(game.countries.every((item) => item.soldiers === 2));
  }
});

test('map rings do not draw artificial lines across the international date line', () => {
  const geography = JSON.parse(readFileSync(new URL('../../public/data/world-countries.json', import.meta.url), 'utf8'));
  for (const country of geography.features) {
    const polygons = country.geometry.type === 'MultiPolygon'
      ? country.geometry.coordinates : [country.geometry.coordinates];
    for (const polygon of polygons) for (const ring of polygon) {
      for (let index = 1; index < ring.length; index++) {
        assert.ok(Math.abs(ring[index][0] - ring[index - 1][0]) <= 180, country.properties.name);
      }
    }
  }
});
