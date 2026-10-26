import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame } from "./gameState.js";
import {
  advanceTurn, skipTurn, allocateReinforcements, transferSoldiers,
} from "./gameEngine.js";

function makeGame() {
  const catalogue = Array.from({ length: 10 }, (_, index) => ({
    id: `country-${index}`,
    name: `Country ${index}`,
    population: 10_000_000,
  }));
  return createInitialGame(catalogue, "country-0", () => 0.5);
}

// Simulate a future conquest without implementing attacks.
function eliminate(game, playerId) {
  return {
    ...game,
    countries: game.countries.map((country) =>
      country.ownerId === playerId
        ? { ...country, ownerId: game.currentPlayerId }
        : country
    ),
  };
}

test("skip passes to the next player without changing the input game", () => {
  const game = makeGame();
  const original = structuredClone(game);
  const next = skipTurn(game, game.currentPlayerId);

  assert.notEqual(next, game);
  assert.deepEqual(game, original);
  assert.equal(next.currentPlayerId, game.turnOrder[1]);
  assert.equal(next.turnIndex, 1);
  assert.equal(next.round, 1);
  assert.equal(next.turnsTakenThisRound, 1);
  assert.deepEqual(next.countries, original.countries);
  assert.deepEqual(next.battleLog, original.battleLog);
});

test("every player gets a turn before the next round starts", () => {
  let game = makeGame();
  const order = [...game.turnOrder];

  for (let index = 0; index < order.length; index++) {
    assert.equal(game.currentPlayerId, order[index]);
    assert.equal(game.round, 1);
    assert.equal(game.turnsTakenThisRound, index);
    game = advanceTurn(game, game.currentPlayerId);
  }

  assert.equal(game.currentPlayerId, order[0]);
  assert.equal(game.turnIndex, 0);
  assert.equal(game.round, 2);
  assert.equal(game.turnsTakenThisRound, 0);
  for (let index = 0; index < order.length; index++) {
    const country = game.countries.find((item) => item.ownerId === game.currentPlayerId);
    game = allocateReinforcements(game, game.currentPlayerId, [
      { countryId: country.id, soldiers: game.pendingReinforcements },
    ]);
    game = skipTurn(game, game.currentPlayerId);
  }
  assert.equal(game.round, 3);
});

test("players with no countries are skipped within a round", () => {
  let game = makeGame();
  game = eliminate(game, game.turnOrder[1]);
  game = eliminate(game, game.turnOrder[2]);
  const next = skipTurn(game, game.currentPlayerId);

  assert.equal(next.currentPlayerId, game.turnOrder[3]);
  assert.equal(next.turnIndex, 3);
  assert.equal(next.round, 1);
  assert.equal(next.turnsTakenThisRound, 1);
  assert.deepEqual(next.turnOrder, game.turnOrder);
});

test("eliminated players at both ends of the order do not delay a new round", () => {
  let game = makeGame();
  game = skipTurn(game, game.currentPlayerId);
  game = eliminate(game, game.turnOrder[0]);
  game = eliminate(game, game.turnOrder[9]);
  for (let index = 1; index <= 8; index++) {
    assert.equal(game.currentPlayerId, game.turnOrder[index]);
    assert.equal(game.round, 1);
    game = skipTurn(game, game.currentPlayerId);
  }
  assert.equal(game.currentPlayerId, game.turnOrder[1]);
  assert.equal(game.round, 2);
  assert.equal(game.turnsTakenThisRound, 0);
});

test("a player who still owns a conquered country retains their turn", () => {
  const game = makeGame();
  const nextPlayer = game.turnOrder[1];
  const ownedCountry = game.countries.find((c) => c.ownerId === nextPlayer);
  const otherCountry = game.countries.find((c) => c.ownerId === game.turnOrder[2]);
  ownedCountry.ownerId = game.currentPlayerId;
  otherCountry.ownerId = nextPlayer;

  assert.equal(skipTurn(game, game.currentPlayerId).currentPlayerId, nextPlayer);
});

test("both turn actions reject another player without changing the game", () => {
  const game = makeGame();
  const original = structuredClone(game);
  for (const action of [advanceTurn, skipTurn]) {
    assert.throws(() => action(game, game.turnOrder[1]), /current player/);
  }
  assert.deepEqual(game, original);
});

test("both turn actions reject ended games without changing them", () => {
  for (const ending of [
    { status: "finished", winnerId: "human-player" },
    { status: "finished", winnerId: null },
    { status: "active", winnerId: "human-player" },
  ]) {
    const game = { ...makeGame(), ...ending };
    const original = structuredClone(game);
    for (const action of [advanceTurn, skipTurn]) {
      assert.throws(() => action(game, game.currentPlayerId), /game has ended/);
    }
    assert.deepEqual(game, original);
  }
});

test("an eliminated current player cannot act", () => {
  const game = makeGame();
  for (const country of game.countries) {
    if (country.ownerId === game.currentPlayerId) {
      country.ownerId = game.turnOrder[1];
    }
  }
  assert.throws(() => skipTurn(game, game.currentPlayerId), /eliminated/);
});

test("an inconsistent current turn is rejected", () => {
  const game = { ...makeGame(), turnIndex: -1 };
  assert.throws(() => advanceTurn(game, game.currentPlayerId), /inconsistent/);
});

function reachRoundTwo(game = makeGame()) {
  while (game.round === 1) game = skipTurn(game, game.currentPlayerId);
  return game;
}

function ownedCountries(game) {
  return game.countries.filter((country) => country.ownerId === game.currentPlayerId);
}

function allocateAll(game) {
  return allocateReinforcements(game, game.currentPlayerId, [{
    countryId: ownedCountries(game)[0].id,
    soldiers: game.pendingReinforcements,
  }]);
}

// Every rejection check also verifies that no part of the input was modified.
function assertRejectedWithoutChanges(game, action) {
  const original = structuredClone(game);
  assert.throws(action);
  assert.deepEqual(game, original);
}

test("round one awards no reinforcements, including the initial turn", () => {
  let game = makeGame();
  for (let index = 0; index < 10; index++) {
    assert.equal(game.pendingReinforcements, 0);
    assertRejectedWithoutChanges(game, () => allocateReinforcements(
      game, game.currentPlayerId, [{ countryId: ownedCountries(game)[0].id, soldiers: 1 }]
    ));
    game = skipTurn(game, game.currentPlayerId);
  }
  assert.equal(game.round, 2);
  assert.equal(game.pendingReinforcements, 2);
});

test("round two awards two soldiers per country and skips eliminated owners", () => {
  let game = makeGame();
  game = eliminate(game, game.turnOrder[1]);
  game = eliminate(game, game.turnOrder[2]);
  const originalCountries = structuredClone(game.countries);
  game = reachRoundTwo(game);
  assert.equal(game.pendingReinforcements, 6);
  assert.deepEqual(game.countries, originalCountries);

  game = allocateAll(game);
  game = advanceTurn(game, game.currentPlayerId);
  assert.equal(game.currentPlayerId, game.turnOrder[3]);
  assert.equal(game.pendingReinforcements, 2);
});

test("reinforcements can be split across owned countries without mutating the input", () => {
  let game = makeGame();
  game = reachRoundTwo(eliminate(game, game.turnOrder[1]));
  const [first, second] = ownedCountries(game);
  const original = structuredClone(game);
  const next = allocateReinforcements(game, game.currentPlayerId, [
    { countryId: first.id, soldiers: 1 },
    { countryId: second.id, soldiers: 3 },
  ]);
  assert.deepEqual(game, original);
  assert.equal(next.pendingReinforcements, 0);
  assert.equal(next.countries.find((c) => c.id === first.id).soldiers, first.soldiers + 1);
  assert.equal(next.countries.find((c) => c.id === second.id).soldiers, second.soldiers + 3);
  assert.equal(next.currentPlayerId, game.currentPlayerId);
  for (const country of game.countries.filter((c) => c.ownerId !== game.currentPlayerId)) {
    assert.deepEqual(next.countries.find((c) => c.id === country.id), country);
  }
});

test("partial allocations spend the balance once and cannot be repeated after it is exhausted", () => {
  let game = reachRoundTwo();
  const countryId = ownedCountries(game)[0].id;
  const allocation = [{ countryId, soldiers: 1 }];
  game = allocateReinforcements(game, game.currentPlayerId, allocation);
  assert.equal(game.pendingReinforcements, 1);
  for (const action of [skipTurn, advanceTurn]) {
    assertRejectedWithoutChanges(game, () => action(game, game.currentPlayerId));
  }
  game = allocateReinforcements(game, game.currentPlayerId, allocation);
  assert.equal(game.pendingReinforcements, 0);
  assertRejectedWithoutChanges(game, () => allocateReinforcements(game, game.currentPlayerId, allocation));
  assert.equal(skipTurn(game, game.currentPlayerId).pendingReinforcements, 2);
});

test("reinforcement entitlement stays fixed if ownership changes after the turn begins", () => {
  let game = reachRoundTwo();
  game = eliminate(game, game.turnOrder[1]);
  assert.equal(game.pendingReinforcements, 2);
  game = allocateAll(game);
  assert.equal(game.pendingReinforcements, 0);
});

test("invalid reinforcement allocations are rejected atomically", () => {
  const game = reachRoundTwo();
  const countryId = ownedCountries(game)[0].id;
  const enemyId = game.countries.find((c) => c.ownerId !== game.currentPlayerId).id;
  const invalidAllocations = [
    null, {}, [], Array(1), [null], [{}],
    [{ countryId, soldiers: 3 }],
    [{ countryId: "missing", soldiers: 1 }],
    [{ countryId: enemyId, soldiers: 1 }],
    [{ countryId, soldiers: 1 }, { countryId, soldiers: 1 }],
    [{ countryId, soldiers: 1 }, { countryId: enemyId, soldiers: 1 }],
  ];
  for (const soldiers of [0, -1, 0.5, "1", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    invalidAllocations.push([{ countryId, soldiers }]);
  }
  for (const allocations of invalidAllocations) {
    assertRejectedWithoutChanges(game, () => allocateReinforcements(game, game.currentPlayerId, allocations));
  }
});

function makeTransferGame() {
  let game = makeGame();
  game = eliminate(game, game.turnOrder[1]);
  const [source, target] = ownedCountries(game);
  return { game, sourceId: source.id, targetId: target.id };
}

test("transfers preserve the total, leave one soldier, and do not end the turn", () => {
  const { game, sourceId, targetId } = makeTransferGame();
  const original = structuredClone(game);
  const next = transferSoldiers(game, game.currentPlayerId, sourceId, targetId, 1);
  assert.deepEqual(game, original);
  assert.equal(next.countries.find((c) => c.id === sourceId).soldiers, 1);
  assert.equal(next.countries.find((c) => c.id === targetId).soldiers, 3);
  assert.equal(next.countries.reduce((sum, c) => sum + c.soldiers, 0),
    game.countries.reduce((sum, c) => sum + c.soldiers, 0));
  assert.equal(next.currentPlayerId, game.currentPlayerId);
  assert.equal(next.round, game.round);
  assert.equal(next.pendingReinforcements, game.pendingReinforcements);
  const reversed = transferSoldiers(next, next.currentPlayerId, targetId, sourceId, 1);
  assert.deepEqual(reversed, game);
});

test("invalid transfers are rejected without changing either country", () => {
  const { game, sourceId, targetId } = makeTransferGame();
  const enemyId = game.countries.find((c) => c.ownerId !== game.currentPlayerId).id;
  for (const [source, target, count] of [
    [sourceId, sourceId, 1], ["missing", targetId, 1], [sourceId, "missing", 1],
    [enemyId, targetId, 1], [sourceId, enemyId, 1], [sourceId, targetId, 2],
    [sourceId, targetId, 3],
    ...[0, -1, 0.5, "1", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]
      .map((count) => [sourceId, targetId, count]),
  ]) {
    assertRejectedWithoutChanges(game, () => transferSoldiers(game, game.currentPlayerId, source, target, count));
  }
  const next = transferSoldiers(game, game.currentPlayerId, sourceId, targetId, 1);
  assertRejectedWithoutChanges(next, () => transferSoldiers(next, next.currentPlayerId, sourceId, targetId, 1));
});

test("new actions reject wrong players, ended games, eliminated players, and active attacks", () => {
  const { game: initial, sourceId, targetId } = makeTransferGame();
  const base = reachRoundTwo(initial);
  for (const [changes, actor] of [
    [{}, base.turnOrder[2]],
    [{ status: "finished" }, base.currentPlayerId],
    [{ winnerId: base.currentPlayerId }, base.currentPlayerId],
    [{ attackInProgress: true }, base.currentPlayerId],
    [{ turnIndex: -1 }, base.currentPlayerId],
    [{ countries: base.countries.map((c) => ({ ...c, ownerId: base.turnOrder[2] })) }, base.currentPlayerId],
  ]) {
    const game = { ...base, ...changes };
    assertRejectedWithoutChanges(game, () => allocateReinforcements(game, actor, [{ countryId: sourceId, soldiers: 1 }]));
    assertRejectedWithoutChanges(game, () => transferSoldiers(game, actor, sourceId, targetId, 1));
  }
});

test("soldier additions cannot overflow safe integers", () => {
  const { game: initial, sourceId, targetId } = makeTransferGame();
  const game = reachRoundTwo(initial);
  game.countries.find((c) => c.id === targetId).soldiers = Number.MAX_SAFE_INTEGER;
  assertRejectedWithoutChanges(game, () => transferSoldiers(game, game.currentPlayerId, sourceId, targetId, 1));
  assertRejectedWithoutChanges(game, () => allocateReinforcements(game, game.currentPlayerId, [{ countryId: targetId, soldiers: 1 }]));
});

test("allocated soldiers can be transferred and the next turn gets a fresh balance", () => {
  const { game: initial, sourceId, targetId } = makeTransferGame();
  let game = reachRoundTwo(initial);
  game = allocateAll(game);
  game = transferSoldiers(game, game.currentPlayerId, sourceId, targetId, 3);
  const countries = structuredClone(game.countries);
  game = skipTurn(game, game.currentPlayerId);
  assert.deepEqual(game.countries, countries);
  assert.equal(game.currentPlayerId, game.turnOrder[2]);
  assert.equal(game.pendingReinforcements, 2);
});
