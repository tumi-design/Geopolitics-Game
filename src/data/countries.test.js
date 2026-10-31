import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { countries, filterCountries, populationReference } from './countries.js';
import { createInitialGame } from '../engine/gameState.js';
import { getStartingSoldiers } from '../engine/gameRules.js';
import populationData from './populations-2026.json' with { type: 'json' };

test('every catalogue country has matching geography and a valid local SVG flag', () => {
  const geography = JSON.parse(readFileSync(new URL('../../public/data/world-countries.json', import.meta.url), 'utf8'));
  const ids = new Set(geography.features.map((item) => item.id));
  assert.equal(geography.type, 'FeatureCollection');
  assert.equal(new Set(countries.map((item) => item.id)).size, countries.length);
  for (const country of countries) {
    assert.ok(ids.has(country.id), `Missing map geometry: ${country.name}`);
    const flagUrl = new URL(`../../public/flags/${country.code.toLowerCase()}.svg`, import.meta.url);
    assert.ok(existsSync(flagUrl));
    assert.match(readFileSync(flagUrl, 'utf8'), /<svg[\s>]/);
    assert.match(country.id, /^\d{3}$/);
    assert.match(country.code, /^[A-Z]{2}$/);
    assert.ok(Number.isSafeInteger(country.population) && country.population > 0);
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
  for (const country of countries) for (const randomValue of [0, 0.5, 0.999999]) {
    const game = createInitialGame(countries, country.id, () => randomValue);
    assert.equal(game.countries.length, 10);
    assert.equal(game.countries.find((item) => item.id === country.id).ownerId, 'human-player');
    assert.equal(new Set(game.countries.map((item) => item.id)).size, 10);
    assert.equal(game.players.filter((player) => player.isHuman).length, 1);
    assert.equal(game.players.filter((player) => !player.isHuman).length, 9);
    for (const item of game.countries) {
      assert.equal(item.soldiers, getStartingSoldiers(item.population));
      assert.equal(item.originalSoldierValue, getStartingSoldiers(item.population));
    }
  }
});

test('the catalogue contains exactly 55 unique countries and preserves the previous 50', () => {
  const originalCodes = 'AR AU BR CA CL CN CO DK EG FR DE GR IN ID IT JP KE MX MA NA NZ NG NO PE PT ZA KR ES SE GB US'.split(' ');
  const newCodes = 'BW CR CU EC ET FI GH IE NL PK PG PL SA SN CH TZ TH VN ZM'.split(' ');
  const additions = ['RU', 'TR', 'IR', 'CD', 'DZ'];
  const previousCodes = [...originalCodes, ...newCodes];
  assert.equal(countries.length, 55);
  assert.equal(new Set(countries.map((country) => country.id)).size, 55);
  assert.equal(new Set(countries.map((country) => country.code)).size, 55);
  assert.equal(new Set(countries.map((country) => country.name)).size, 55);
  assert.equal(countries.filter((country) => !previousCodes.includes(country.code)).length, 5);
  assert.deepEqual(countries.map((country) => country.code).sort(), [...previousCodes, ...additions].sort());
  assert.deepEqual([...new Set(countries.filter((country) => newCodes.includes(country.code)).map((country) => country.region))].sort(),
    ['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America']);
});

test('every population uses the exact documented Worldometer 2026 figure and source', () => {
  assert.equal(populationReference.year, 2026);
  assert.equal(Object.keys(populationData.countries).length, 55);
  assert.equal(populationReference.sourceUrl, 'https://www.worldometers.info/world-population/population-by-country/');
  for (const country of countries) {
    assert.equal(country.population, populationData.countries[country.name].population);
    assert.equal(country.populationYear, 2026);
    assert.equal(country.populationSourceUrl, populationData.countries[country.name].sourceUrl);
    assert.match(country.populationSourceUrl, /^https:\/\/www\.worldometers\.info\/world-population\/[a-z-]+-population\/$/);
    assert.notEqual(country.population, 10_000_000);
  }
  assert.equal(countries.find((country) => country.code === 'IN').population, 1_476_625_576);
  assert.equal(countries.find((country) => country.code === 'ZA').population, 65_453_084);
  assert.equal(countries.find((country) => country.code === 'BW').population, 2_603_388);
  assert.equal(countries.find((country) => country.code === 'PG').population, 10_947_848);
});

test('all 55 countries are searchable by name and ISO code', () => {
  for (const country of countries) {
    assert.ok(filterCountries(countries, country.name).some((result) => result.id === country.id));
    assert.ok(filterCountries(countries, country.code.toLowerCase()).some((result) => result.id === country.id));
  }
});

test('alternative names and accented Turkish searches identify the correct country', () => {
  for (const query of ['Turkey', 'Türkiye', 'Turkiye', 'TÜRKİYE', 'türkiye', 'TR']) {
    assert.ok(filterCountries(countries, query).some((country) => country.id === '792'), query);
  }
  for (const query of ['DRC', 'DR Congo', 'Democratic Republic of the Congo', 'Democratic Republic of Congo', 'Congo-Kinshasa', 'CD']) {
    assert.ok(filterCountries(countries, query).some((country) => country.id === '180'), query);
  }
  assert.equal(filterCountries(countries, 'Russian Federation')[0].code, 'RU');
});

test('the five added countries use the correct geographic IDs, populations and soldier values', () => {
  const expected = [
    ['RU', '643', 143_394_458, 8],
    ['TR', '792', 87_926_082, 6],
    ['IR', '364', 93_168_497, 6],
    ['CD', '180', 116_452_162, 7],
    ['DZ', '012', 48_028_334, 4],
  ];
  const geography = JSON.parse(readFileSync(new URL('../../public/data/world-countries.json', import.meta.url), 'utf8'));
  for (const [code, id, population, soldiers] of expected) {
    const country = countries.find((item) => item.code === code);
    assert.equal(country.id, id);
    assert.equal(country.population, population);
    assert.equal(getStartingSoldiers(country.population), soldiers);
    assert.ok(geography.features.some((feature) => feature.id === id));
  }
});

test('real population examples span the unchanged UCT soldier thresholds', () => {
  const expected = { BW: 1, FI: 2, PG: 3, GH: 4, ZA: 5, DE: 6, JP: 7, ET: 8, IN: 9 };
  for (const [code, soldiers] of Object.entries(expected)) {
    assert.equal(getStartingSoldiers(countries.find((country) => country.code === code).population), soldiers);
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
