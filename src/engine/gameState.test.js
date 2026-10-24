
import test from "node:test";
import assert from "node:assert/strict";

import { getStartingSoldiers } from "./gameRules.js";
import { createInitialGame } from "./gameState.js";

function makeCountries(count = 12) {
  return Array.from({ length: count }, (_, index) => ({
    id: `country-${index + 1}`,
    name: `Country ${index + 1}`,
    population: (index + 1) * 1_000_000,
  }));
}

test("a new game contains ten countries and ten players", () => {
  const game = createInitialGame(
    makeCountries(),
    "country-1",
    () => 0.5
  );

  assert.equal(game.countries.length, 10);
  assert.equal(game.players.length, 10);
  assert.equal(
    game.players.filter((player) => player.isHuman).length,
    1
  );
  assert.equal(
    game.players.filter((player) => !player.isHuman).length,
    9
  );
});

test("the selected country belongs to the human player", () => {
  const game = createInitialGame(
    makeCountries(),
    "country-1",
    () => 0.5
  );

  const country = game.countries.find(
    (item) => item.id === "country-1"
  );

  assert.ok(country);
  assert.equal(country.ownerId, "human-player");
});

test("each country's starting soldiers match its population", () => {
  const game = createInitialGame(
    makeCountries(),
    "country-1",
    () => 0.5
  );

  for (const country of game.countries) {
    const expected = getStartingSoldiers(country.population);

    assert.equal(country.originalSoldierValue, expected);
    assert.equal(country.soldiers, expected);
  }
});

test("turn order contains every player exactly one time", () => {
  const game = createInitialGame(
    makeCountries(),
    "country-1",
    () => 0.5
  );

  assert.equal(game.turnOrder.length, 10);
  assert.equal(new Set(game.turnOrder).size, 10);
  assert.deepEqual(
    [...game.turnOrder].sort(),
    game.players.map((player) => player.id).sort()
  );
  assert.equal(game.currentPlayerId, game.turnOrder[0]);
});

test("every country initially has one distinct owner", () => {
  const game = createInitialGame(
    makeCountries(),
    "country-1",
    () => 0.5
  );

  assert.equal(
    new Set(game.countries.map((country) => country.ownerId)).size,
    10
  );

  for (const country of game.countries) {
    assert.ok(
      game.players.some((player) => player.id === country.ownerId)
    );
  }
});

test("a catalogue with fewer than ten countries is not allowed", () => {
  assert.throws(
    () => createInitialGame(makeCountries(9), "country-1"),
    RangeError
  );
});

test("an unknown selected country is rejected", () => {
  assert.throws(
    () => createInitialGame(makeCountries(), "unknown-country"),
    RangeError
  );
});

test("creating a game does not modify the original catalogue", () => {
  const countries = makeCountries();
  const original = structuredClone(countries);

  createInitialGame(countries, "country-1", () => 0.5);

  assert.deepEqual(countries, original);
});
