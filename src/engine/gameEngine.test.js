import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame } from "./gameState.js";
import { advanceTurn, skipTurn } from "./gameEngine.js";

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
