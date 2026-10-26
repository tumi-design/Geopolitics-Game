import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame } from "./gameState.js";
import {
  startAttack, rollAttackPhase, stopAttack, completeConquest,
  skipTurn, advanceTurn, transferSoldiers, allocateReinforcements,
} from "./gameEngine.js";

// Fixed order keeps combat scenarios easy to follow. Still use real setup data.
function makeGame(attackingSoldiers = 10, defendingSoldiers = 2) {
  const countries = Array.from({ length: 10 }, (_, i) => ({
    id: `country-${i}`, name: `Country ${i}`, population: 10_000_000,
  }));
  const game = createInitialGame(countries, "country-0", () => 0.5);
  game.turnOrder = game.players.map((player) => player.id);
  game.currentPlayerId = "human-player";
  game.countries = countries.map((entry, index) => ({
    ...game.countries.find((item) => item.id === entry.id),
    ownerId: game.players[index].id,
    soldiers: index === 0 ? attackingSoldiers : index === 1 ? defendingSoldiers : 2,
  }));
  return game;
}

function attack(game = makeGame()) {
  return startAttack(game, game.currentPlayerId, "country-0", "country-1");
}

// rollCombatRound consumes all attacking dice, then all defending dice.
function dice(...values) {
  let index = 0;
  return () => {
    assert.ok(index < values.length, "Unexpected extra dice roll");
    return (values[index++] - 0.5) / 6;
  };
}

function rejected(game, action) {
  const before = structuredClone(game);
  assert.throws(action);
  assert.deepEqual(game, before);
}

function country(game, index) {
  return game.countries.find((item) => item.id === `country-${index}`);
}

function pendingConquest(game = makeGame(2, 1)) {
  return rollAttackPhase(attack(game), game.currentPlayerId, dice(6, 1));
}

test("attack setup selects countries, consumes the turn's attack, and preserves input", () => {
  const game = makeGame();
  const before = structuredClone(game);
  const next = attack(game);
  assert.deepEqual(game, before);
  assert.equal(next.attackInProgress, true);
  assert.equal(next.attackUsedThisTurn, true);
  assert.equal(next.activeAttack.sourceCountryId, "country-0");
  assert.equal(next.activeAttack.targetCountryId, "country-1");
  assert.equal(next.battleLog[0].type, "attack_started");
  assert.deepEqual(next.countries, game.countries);
});

test("invalid source, target, ownership, soldiers and repeated attacks are rejected", () => {
  const game = makeGame();
  for (const [source, target] of [
    ["missing", "country-1"], ["country-1", "country-2"],
    ["country-0", "missing"], ["country-0", "country-0"],
  ]) rejected(game, () => startAttack(game, game.currentPlayerId, source, target));
  const ownedTarget = makeGame();
  country(ownedTarget, 1).ownerId = ownedTarget.currentPlayerId;
  rejected(ownedTarget, () => attack(ownedTarget));
  for (const count of [0, 1, -1, 1.5, "2", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = makeGame(count);
    rejected(invalid, () => attack(invalid));
  }
  for (const count of [0, -1, 1.5, NaN]) {
    const invalid = makeGame(2, count);
    rejected(invalid, () => attack(invalid));
  }
  const started = attack(game);
  rejected(started, () => attack(started));
  const used = { ...game, attackUsedThisTurn: true };
  rejected(used, () => attack(used));
});

test("UCT example pairs [1,4] against [2,3], leaving 9 attackers and 1 defender", () => {
  const game = attack();
  const before = structuredClone(game);
  const next = rollAttackPhase(game, game.currentPlayerId, dice(1, 4, 2, 3));
  assert.deepEqual(game, before);
  assert.equal(country(next, 0).soldiers, 9);
  assert.equal(country(next, 1).soldiers, 1);
  const event = next.battleLog.at(-1);
  assert.deepEqual(event.attackerRolls, [1, 4]);
  assert.deepEqual(event.defenderRolls, [2, 3]);
  assert.equal(event.attackerLosses, 1);
  assert.equal(event.defenderLosses, 1);
  assert.deepEqual(event.pairResults.map((pair) => pair.winner), ["defender", "attacker"]);
  assert.equal(event.outcome, "continue");
  assert.equal(event.attackingSoldiersBefore, 10);
  assert.equal(event.defendingSoldiersBefore, 2);
  assert.equal(next.activeAttack.phaseNumber, 1);
});

for (const [attacker, defender, expectedDice] of [[10, 2, 2], [3, 5, 2], [2, 5, 1]]) {
  test(`UCT dice count example: ${attacker} attackers against ${defender} defenders`, () => {
    const game = attack(makeGame(attacker, defender));
    const next = rollAttackPhase(game, game.currentPlayerId, () => 0.5);
    assert.equal(next.battleLog.at(-1).diceCount, expectedDice);
    assert.equal(country(next, 0).soldiers, attacker);
    assert.equal(country(next, 1).soldiers, defender);
    assert.equal(next.battleLog.at(-1).ties, expectedDice);
  });
}

test("multiple phases retain the same target and ties do not force an endless loop", () => {
  let game = attack();
  game = rollAttackPhase(game, game.currentPlayerId, dice(1, 4, 2, 3));
  game = rollAttackPhase(game, game.currentPlayerId, dice(4, 4));
  assert.equal(game.activeAttack.phaseNumber, 2);
  assert.equal(game.activeAttack.targetCountryId, "country-1");
  assert.equal(country(game, 0).soldiers, 9);
  assert.equal(country(game, 1).soldiers, 1);
  game = rollAttackPhase(game, game.currentPlayerId, dice(6, 1));
  assert.equal(game.activeAttack.phase, "conquest");
  assert.equal(game.battleLog.filter((event) => event.type === "attack_started").length, 1);
});

test("reaching one attacking soldier ends the turn and preserves both territories", () => {
  const game = attack(makeGame(3, 5));
  const next = rollAttackPhase(game, game.currentPlayerId, dice(1, 1, 6, 6));
  assert.equal(country(next, 0).soldiers, 1);
  assert.equal(country(next, 1).soldiers, 5);
  assert.equal(country(next, 0).ownerId, game.currentPlayerId);
  assert.equal(country(next, 1).ownerId, "npc-1");
  assert.equal(next.currentPlayerId, "npc-1");
  assert.equal(next.attackInProgress, false);
  assert.equal(next.activeAttack, null);
  assert.equal(next.battleLog.at(-1).outcome, "attack_failed");
  rejected(next, () => rollAttackPhase(next, next.currentPlayerId));
});

for (const endAttack of [stopAttack, skipTurn]) {
  test(`${endAttack.name} stops an ongoing attack, retains losses, and ends the turn`, () => {
    let game = attack();
    game = rollAttackPhase(game, game.currentPlayerId, dice(1, 4, 2, 3));
    const before = structuredClone(game);
    const next = endAttack(game, game.currentPlayerId);
    assert.deepEqual(game, before);
    assert.deepEqual(next.countries, game.countries);
    assert.equal(next.currentPlayerId, "npc-1");
    assert.equal(next.attackInProgress, false);
    assert.equal(next.battleLog.at(-1).type, "attack_stopped");
  });
}

test("ordinary transfers and direct turn advancement are blocked during combat", () => {
  const game = attack();
  rejected(game, () => advanceTurn(game, game.currentPlayerId));
  rejected(game, () => transferSoldiers(game, game.currentPlayerId, "country-0", "country-1", 1));
});

test("defeating all defenders pauses combat until conquest placement is chosen", () => {
  const game = pendingConquest();
  assert.equal(country(game, 1).soldiers, 0);
  assert.equal(game.activeAttack.phase, "conquest");
  assert.equal(game.currentPlayerId, "human-player");
  assert.equal(game.battleLog.at(-1).outcome, "conquest_pending");
  for (const action of [rollAttackPhase, stopAttack, skipTurn, advanceTurn]) {
    rejected(game, () => action(game, game.currentPlayerId));
  }
  rejected(game, () => attack(game));
  rejected(game, () => transferSoldiers(game, game.currentPlayerId, "country-0", "country-1", 1));
});

for (const [originalValue, reward] of [[9, 4], [1, 2]]) {
  test(`conquest uses original soldier value ${originalValue} for reward ${reward}`, () => {
    const initial = makeGame(2, 1);
    country(initial, 1).originalSoldierValue = originalValue;
    const game = pendingConquest(initial);
    const before = structuredClone(game);
    const next = completeConquest(game, game.currentPlayerId, 2);
    assert.deepEqual(game, before);
    assert.equal(country(next, 1).ownerId, "human-player");
    assert.equal(country(next, 1).soldiers, 2);
    assert.equal(country(next, 0).soldiers, reward);
    assert.equal(country(next, 1).originalSoldierValue, originalValue);
    assert.equal(next.battleLog.find((event) => event.type === "country_conquered").reward, reward);
    assert.equal(next.currentPlayerId, "npc-2");
    assert.equal(next.attackInProgress, false);
  });
}

test("conquest accepts the minimum and maximum legal occupation choices", () => {
  for (const count of [1, 3]) {
    const game = pendingConquest();
    const next = completeConquest(game, game.currentPlayerId, count);
    assert.equal(country(next, 1).soldiers, count);
    assert.equal(country(next, 0).soldiers, 4 - count);
  }
});

test("invalid conquest choices and malformed rewards fail without changing any state", () => {
  const game = pendingConquest();
  for (const count of [undefined, 0, -1, 0.5, "1", 4, 5, NaN, Infinity]) {
    rejected(game, () => completeConquest(game, game.currentPlayerId, count));
  }
  const invalid = structuredClone(game);
  country(invalid, 1).originalSoldierValue = 0;
  rejected(invalid, () => completeConquest(invalid, invalid.currentPlayerId, 1));
  const overflow = structuredClone(game);
  country(overflow, 0).soldiers = Number.MAX_SAFE_INTEGER;
  rejected(overflow, () => completeConquest(overflow, overflow.currentPlayerId, 1));
});

test("elimination is logged only when the defender loses their last country", () => {
  const game = makeGame(2, 1);
  country(game, 2).ownerId = "npc-1";
  const pending = pendingConquest(game);
  const next = completeConquest(pending, pending.currentPlayerId, 1);
  assert.equal(next.currentPlayerId, "npc-1");
  assert.ok(!next.battleLog.some((event) => event.type === "player_eliminated"));
  const eliminated = pendingConquest();
  const result = completeConquest(eliminated, eliminated.currentPlayerId, 1);
  assert.equal(result.currentPlayerId, "npc-2");
  assert.equal(result.battleLog.at(-1).eliminatedPlayerId, "npc-1");
  rejected(result, () => startAttack(result, "npc-1", "country-1", "country-0"));
});

test("owning all ten countries declares victory and rejects every subsequent action", () => {
  const initial = makeGame(2, 1);
  for (const item of initial.countries) {
    if (item.id !== "country-1") item.ownerId = initial.currentPlayerId;
  }
  const game = pendingConquest(initial);
  const winner = game.currentPlayerId;
  const next = completeConquest(game, winner, 1);
  assert.equal(next.status, "finished");
  assert.equal(next.winnerId, winner);
  assert.equal(next.currentPlayerId, winner);
  assert.equal(next.activeAttack, null);
  assert.ok(next.countries.every((item) => item.ownerId === winner && item.soldiers >= 1));
  assert.equal(next.battleLog.at(-1).type, "victory");
  for (const action of [
    () => startAttack(next, winner, "country-0", "country-1"),
    () => rollAttackPhase(next, winner), () => stopAttack(next, winner),
    () => completeConquest(next, winner, 1), () => skipTurn(next, winner),
    () => advanceTurn(next, winner),
    () => allocateReinforcements(next, winner, [{ countryId: "country-0", soldiers: 1 }]),
    () => transferSoldiers(next, winner, "country-0", "country-1", 1),
  ]) rejected(next, action);
});

test("combat actions reject wrong actors, ended games and missing or incorrect phases", () => {
  for (const game of [makeGame(), attack(), pendingConquest()]) {
    for (const actor of ["npc-1", undefined]) {
      for (const action of [
        () => startAttack(game, actor, "country-0", "country-1"),
        () => rollAttackPhase(game, actor), () => stopAttack(game, actor),
        () => completeConquest(game, actor, 1),
      ]) rejected(game, action);
    }
    for (const ending of [{ status: "finished" }, { winnerId: "npc-1" }]) {
      const ended = { ...game, ...ending };
      for (const action of [
        () => startAttack(ended, ended.currentPlayerId, "country-0", "country-1"),
        () => rollAttackPhase(ended, ended.currentPlayerId),
        () => stopAttack(ended, ended.currentPlayerId),
        () => completeConquest(ended, ended.currentPlayerId, 1),
      ]) rejected(ended, action);
    }
  }
  const initial = makeGame();
  for (const action of [rollAttackPhase, stopAttack, completeConquest]) {
    rejected(initial, () => action(initial, initial.currentPlayerId));
  }
  const started = attack(initial);
  rejected(started, () => completeConquest(started, started.currentPlayerId, 1));
});

test("invalid random sources, including failure partway through rolling, preserve input", () => {
  const game = attack();
  for (const random of [null, () => -1, () => 1, () => NaN, () => "0.5", () => { throw new Error("offline"); }]) {
    rejected(game, () => rollAttackPhase(game, game.currentPlayerId, random));
  }
  let calls = 0;
  rejected(game, () => rollAttackPhase(game, game.currentPlayerId, () => ++calls < 3 ? 0.5 : 1));
});

test("round-two reinforcements must be allocated before attacking", () => {
  let game = makeGame();
  for (let index = 0; index < 10; index++) game = skipTurn(game, game.currentPlayerId);
  assert.equal(game.pendingReinforcements, 2);
  rejected(game, () => attack(game));
  game = allocateReinforcements(game, game.currentPlayerId, [{ countryId: "country-0", soldiers: 2 }]);
  assert.equal(attack(game).attackInProgress, true);
});

test("attack completion at the round boundary awards the next turn's reinforcements", () => {
  let game = makeGame(2, 1);
  // Last player attacks the first. First player has another country and survives.
  game.turnIndex = 9;
  game.currentPlayerId = "npc-9";
  country(game, 9).soldiers = 2;
  country(game, 0).soldiers = 1;
  country(game, 1).ownerId = "human-player";
  game = startAttack(game, game.currentPlayerId, "country-9", "country-0");
  game = rollAttackPhase(game, game.currentPlayerId, dice(6, 1));
  game = completeConquest(game, game.currentPlayerId, 1);
  assert.equal(game.round, 2);
  assert.equal(game.currentPlayerId, "human-player");
  assert.equal(game.pendingReinforcements, 2);
  assert.equal(game.attackUsedThisTurn, false);
});

test("a new turn resets the attack allowance, including use of a newly conquered country", () => {
  let game = pendingConquest();
  game = completeConquest(game, game.currentPlayerId, 2);
  while (game.currentPlayerId !== "human-player") game = skipTurn(game, game.currentPlayerId);
  assert.equal(game.pendingReinforcements, 4);
  game = allocateReinforcements(game, game.currentPlayerId, [{ countryId: "country-1", soldiers: 4 }]);
  const next = startAttack(game, game.currentPlayerId, "country-1", "country-2");
  assert.equal(next.activeAttack.sourceCountryId, "country-1");
});

test("battle history stays ordered, serializable and unchanged across later phases", () => {
  const game = attack();
  const before = structuredClone(game.battleLog);
  const next = rollAttackPhase(game, game.currentPlayerId, dice(1, 4, 2, 3));
  const stopped = stopAttack(next, next.currentPlayerId);
  assert.deepEqual(game.battleLog, before);
  assert.deepEqual(stopped.battleLog.map((event) => event.id), [1, 2, 3]);
  assert.deepEqual(stopped.battleLog.map((event) => event.type), ["attack_started", "combat_phase", "attack_stopped"]);
  assert.deepEqual(JSON.parse(JSON.stringify(stopped.battleLog)), stopped.battleLog);
  assert.ok(stopped.battleLog.every((event) => event.playerId === "human-player" && event.round === 1));
});

test("a tied pair causes no loss while other pairs in the same phase still resolve", () => {
  const game = attack(makeGame(4, 3));
  const next = rollAttackPhase(game, game.currentPlayerId, dice(4, 6, 1, 4, 1, 6));
  const event = next.battleLog.at(-1);
  assert.equal(event.ties, 1);
  assert.equal(event.attackerLosses, 1);
  assert.equal(event.defenderLosses, 1);
  assert.equal(country(next, 0).soldiers, 3);
  assert.equal(country(next, 1).soldiers, 2);
});

for (const ending of ["stop", "failure"]) {
  test(`${ending} at the round boundary starts round two with reinforcements`, () => {
    let game = makeGame();
    game.turnIndex = 9;
    game.currentPlayerId = "npc-9";
    country(game, 9).soldiers = 2;
    game = startAttack(game, game.currentPlayerId, "country-9", "country-0");
    game = ending === "stop" ? stopAttack(game, game.currentPlayerId)
      : rollAttackPhase(game, game.currentPlayerId, dice(1, 6));
    assert.equal(game.round, 2);
    assert.equal(game.currentPlayerId, "human-player");
    assert.equal(game.pendingReinforcements, 2);
    assert.equal(game.attackInProgress, false);
  });
}

test("an eliminated current player cannot start or continue combat", () => {
  for (const base of [makeGame(), attack(), pendingConquest()]) {
    const game = {
      ...base,
      countries: base.countries.map((item) => item.ownerId === base.currentPlayerId
        ? { ...item, ownerId: "npc-2" } : item),
    };
    rejected(game, () => attack(game));
    rejected(game, () => rollAttackPhase(game, game.currentPlayerId));
    rejected(game, () => stopAttack(game, game.currentPlayerId));
    rejected(game, () => completeConquest(game, game.currentPlayerId, 1));
  }
});
