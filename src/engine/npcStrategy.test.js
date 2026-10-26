import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame } from "./gameState.js";
import { startAttack, rollAttackPhase } from "./gameEngine.js";
import { chooseNpcDecision, executeNpcStep, simulateNpcTurn } from "./npcStrategy.js";

function makeGame(soldiers = 8) {
  const catalogue = Array.from({ length: 10 }, (_, index) => ({
    id: `c${index}`, name: `Country ${index}`, population: 10_000_000,
  }));
  const game = createInitialGame(catalogue, "c0", () => 0.5);
  game.turnOrder = game.players.map((player) => player.id);
  game.turnIndex = 1;
  game.currentPlayerId = "npc-1";
  game.countries = catalogue.map((country, index) => ({
    ...game.countries.find((item) => item.id === country.id),
    ownerId: game.players[index].id,
    soldiers: index === 1 ? soldiers : 3,
  }));
  return game;
}

function country(game, index) {
  return game.countries.find((item) => item.id === `c${index}`);
}

function addOwned(game, index, soldiers) {
  country(game, index).ownerId = game.currentPlayerId;
  country(game, index).soldiers = soldiers;
}

function winDice() {
  let count = 0;
  // Tests using this helper have a one-soldier defender, hence one die per side.
  return () => count++ % 2 === 0 ? 0.99 : 0;
}

function rejected(game, action) {
  const before = structuredClone(game);
  assert.throws(action);
  assert.deepEqual(game, before);
}

test("NPC planning is deterministic, pure, and selects its strongest country", () => {
  const game = makeGame();
  addOwned(game, 2, 10);
  const before = structuredClone(game);
  const decision = chooseNpcDecision(game);
  assert.equal(decision.type, "attack");
  assert.equal(decision.sourceCountryId, "c2");
  assert.deepEqual(chooseNpcDecision(game), decision);
  assert.deepEqual(game, before);
  const reordered = { ...game, countries: [...game.countries].reverse() };
  assert.deepEqual(chooseNpcDecision(reordered), decision);
});

test("NPC rejects expensive targets and prefers affordable conquest rewards", () => {
  const game = makeGame();
  country(game, 0).soldiers = 10;
  country(game, 0).originalSoldierValue = 9;
  country(game, 3).originalSoldierValue = 9;
  const decision = chooseNpcDecision(game);
  assert.equal(decision.type, "attack");
  assert.equal(decision.targetCountryId, "c3");
  assert.match(decision.reason, /reward of 4/);
});

test("eliminating an opponent is preferred over an equal reward without elimination", () => {
  const game = makeGame();
  country(game, 0).ownerId = "npc-3";
  const decision = chooseNpcDecision(game);
  assert.notEqual(decision.targetCountryId, "c0");
  assert.notEqual(decision.targetCountryId, "c3");
  assert.match(decision.reason, /eliminate/);
});

test("NPC skips when weak or restricted to one soldier", () => {
  for (const soldiers of [1, 2, 5]) {
    const game = makeGame(soldiers);
    const next = simulateNpcTurn(game);
    assert.equal(next.npcDecisionLog[0].type, "skip");
    assert.equal(next.currentPlayerId, "npc-2");
    assert.equal(next.battleLog.length, 0);
    assert.deepEqual(next.countries, game.countries);
  }
});

test("NPC allocates all reinforcements to its strongest country before attacking", () => {
  const game = { ...makeGame(5), round: 2, pendingReinforcements: 4 };
  addOwned(game, 2, 2);
  const before = structuredClone(game);
  const next = executeNpcStep(game);
  assert.deepEqual(game, before);
  assert.equal(next.pendingReinforcements, 0);
  assert.equal(country(next, 1).soldiers, 9);
  assert.equal(country(next, 2).soldiers, 2);
  assert.equal(next.npcDecisionLog[0].type, "reinforce");
  assert.equal(chooseNpcDecision(next).type, "attack");
});

test("NPC transfers only the soldiers needed to enable a favourable attack", () => {
  const game = makeGame(4);
  addOwned(game, 2, 4);
  const decision = chooseNpcDecision(game);
  assert.equal(decision.type, "transfer");
  assert.equal(decision.sourceCountryId, "c2");
  assert.equal(decision.targetCountryId, "c1");
  assert.equal(decision.soldiers, 2);
  const before = structuredClone(game);
  const next = executeNpcStep(game);
  assert.deepEqual(game, before);
  assert.equal(country(next, 2).soldiers, 2);
  assert.equal(country(next, 1).soldiers, 6);
  assert.equal(chooseNpcDecision(next).type, "attack");
});

test("NPC does not weaken donor countries when pooling cannot enable an attack", () => {
  const game = makeGame(3);
  addOwned(game, 2, 3);
  assert.equal(chooseNpcDecision(game).type, "skip");
  const strong = makeGame(8);
  addOwned(strong, 2, 4);
  assert.equal(chooseNpcDecision(strong).type, "attack");
});

test("several donors can prepare an attack without repeated back-and-forth transfers", () => {
  let game = makeGame(5);
  for (const item of game.countries) if (item.ownerId !== game.currentPlayerId) item.soldiers = 5;
  addOwned(game, 2, 4);
  addOwned(game, 3, 4);
  game = executeNpcStep(game);
  game = executeNpcStep(game);
  assert.deepEqual(game.npcDecisionLog.map((item) => item.type), ["transfer", "transfer"]);
  assert.equal(country(game, 1).soldiers, 9);
  assert.equal(country(game, 2).soldiers, 2);
  assert.equal(country(game, 3).soldiers, 2);
  assert.equal(chooseNpcDecision(game).type, "attack");
});

test("NPC reassesses an ongoing attack and stops after strength becomes unfavourable", () => {
  let game = makeGame(8);
  game = startAttack(game, game.currentPlayerId, "c1", "c0");
  let rolls = 0;
  game = rollAttackPhase(game, game.currentPlayerId, () => rolls++ < 3 ? 0 : 0.99);
  assert.equal(chooseNpcDecision(game).type, "roll");
  rolls = 0;
  game = rollAttackPhase(game, game.currentPlayerId, () => rolls++ < 3 ? 0 : 0.99);
  assert.equal(country(game, 1).soldiers, 2);
  assert.equal(chooseNpcDecision(game).type, "stop");
  const next = executeNpcStep(game);
  assert.equal(next.currentPlayerId, "npc-2");
  assert.equal(next.npcDecisionLog.at(-1).type, "stop");
  assert.equal(next.battleLog.at(-1).type, "attack_stopped");
});

test("NPC continues against the selected target rather than selecting another attack", () => {
  const game = startAttack(makeGame(), "npc-1", "c1", "c0");
  const next = executeNpcStep(game, { random: () => 0.5 });
  assert.equal(next.npcDecisionLog.at(-1).type, "roll");
  assert.equal(next.activeAttack.targetCountryId, "c0");
  assert.equal(next.battleLog.filter((item) => item.type === "attack_started").length, 1);
});

test("a complete NPC turn conquers, occupies, logs elimination and stops at the next player", () => {
  const game = makeGame(5);
  country(game, 0).soldiers = 1;
  const before = structuredClone(game);
  const next = simulateNpcTurn(game, { random: winDice() });
  assert.deepEqual(game, before);
  assert.deepEqual(next.npcDecisionLog.map((item) => item.type), ["attack", "roll", "conquer"]);
  assert.equal(country(next, 0).ownerId, "npc-1");
  assert.equal(country(next, 0).soldiers, 3);
  assert.equal(country(next, 1).soldiers, 4);
  assert.equal(next.currentPlayerId, "npc-2");
  assert.equal(next.battleLog.at(-1).type, "player_eliminated");
});

test("a complete NPC turn includes reinforcement, transfer, attack and conquest", () => {
  const game = { ...makeGame(3), round: 2, pendingReinforcements: 2 };
  for (const item of game.countries) if (item.ownerId !== "npc-1") item.soldiers = 3;
  addOwned(game, 2, 3);
  // With all attackers winning, a three-die phase conquers immediately.
  let rolls = 0;
  const next = simulateNpcTurn(game, { random: () => rolls++ < 3 ? 0.99 : 0 });
  assert.deepEqual(next.npcDecisionLog.map((item) => item.type), ["reinforce", "transfer", "attack", "roll", "conquer"]);
  assert.notEqual(next.currentPlayerId, "npc-1");
  assert.equal(next.pendingReinforcements, 2);
});

test("NPC completes an already pending conquest and can win the game", () => {
  let game = makeGame(3);
  for (let index = 2; index < 10; index++) addOwned(game, index, 2);
  country(game, 0).soldiers = 1;
  game = startAttack(game, "npc-1", "c1", "c0");
  game = rollAttackPhase(game, "npc-1", winDice());
  assert.equal(chooseNpcDecision(game).type, "conquer");
  const next = simulateNpcTurn(game);
  assert.equal(next.winnerId, "npc-1");
  assert.equal(next.status, "finished");
  assert.equal(next.npcDecisionLog.length, 1);
  assert.ok(next.countries.every((item) => item.soldiers >= 1));
});

test("constant ties stop safely at the configured phase cap", () => {
  const next = simulateNpcTurn(makeGame(), { random: () => 0.5, maxCombatPhases: 3 });
  assert.deepEqual(next.npcDecisionLog.map((item) => item.type), ["attack", "roll", "roll", "roll", "stop"]);
  assert.match(next.npcDecisionLog.at(-1).reason, /endless/);
  assert.equal(next.attackInProgress, false);
});

test("the default phase cap also prevents endless ties", () => {
  const next = simulateNpcTurn(makeGame(), { random: () => 0.5 });
  assert.equal(next.npcDecisionLog.filter((item) => item.type === "roll").length, 100);
  assert.equal(next.npcDecisionLog.at(-1).type, "stop");
});

test("the step limit and random failures leave the entire original turn unchanged", () => {
  const game = makeGame();
  rejected(game, () => simulateNpcTurn(game, { maxSteps: 1 }));
  rejected(game, () => simulateNpcTurn(game, { random: () => 1 }));
  const started = startAttack(game, "npc-1", "c1", "c0");
  rejected(started, () => executeNpcStep(started, { random: () => { throw new Error("broken dice"); } }));
});

test("invalid safety limits are rejected", () => {
  const game = makeGame();
  for (const limit of [0, -1, 1.5, Infinity, "2", 10_001]) {
    rejected(game, () => simulateNpcTurn(game, { maxSteps: limit }));
    rejected(game, () => simulateNpcTurn(game, { maxCombatPhases: limit }));
    rejected(game, () => chooseNpcDecision(game, { maxCombatPhases: limit }));
  }
});

test("human, ended, eliminated and inconsistent turns are rejected", () => {
  const initial = makeGame();
  const scenarios = [
    { currentPlayerId: "human-player", turnIndex: 0 },
    { status: "finished" }, { winnerId: "npc-1" }, { turnIndex: -1 },
    { pendingReinforcements: -1 }, { pendingReinforcements: 2 },
    { activeAttack: { phase: "combat" } }, { attackInProgress: true },
    { countries: initial.countries.map((item) => ({ ...item, ownerId: "human-player" })) },
    { countries: initial.countries.map((item) => ({ ...item, soldiers: 0 })) },
    { turnOrder: ["npc-1", "npc-1"] },
  ];
  for (const changes of scenarios) {
    const game = { ...initial, ...changes };
    for (const action of [chooseNpcDecision, executeNpcStep, simulateNpcTurn]) rejected(game, () => action(game));
  }
});

test("decisions remain ordered and link to battle events across separate NPC turns", () => {
  let game = makeGame(5);
  country(game, 0).soldiers = 1;
  game = simulateNpcTurn(game, { random: winDice() });
  const previous = structuredClone(game.npcDecisionLog);
  const next = simulateNpcTurn(game);
  assert.deepEqual(game.npcDecisionLog, previous);
  assert.equal(next.npcDecisionLog.at(-1).type, "skip");
  assert.deepEqual(next.npcDecisionLog.map((item) => item.id), [1, 2, 3, 4]);
  assert.ok(next.npcDecisionLog.every((item) => item.reason.length > 10));
  const roll = next.npcDecisionLog.find((item) => item.type === "roll");
  assert.equal(next.battleLog.slice(roll.battleLogStart, roll.battleLogEnd)[0].type, "combat_phase");
  assert.deepEqual(JSON.parse(JSON.stringify(next.npcDecisionLog)), next.npcDecisionLog);
  assert.equal(next.npcDecisionLog[0].playerId, "npc-1");
  assert.equal(next.npcDecisionLog.at(-1).playerId, "npc-2");
});

test("the same strategy applies to a different NPC and respects an already used attack", () => {
  const game = makeGame();
  game.currentPlayerId = "npc-2";
  game.turnIndex = 2;
  country(game, 2).soldiers = 8;
  assert.equal(chooseNpcDecision(game).sourceCountryId, "c2");
  const used = { ...game, attackUsedThisTurn: true };
  const next = simulateNpcTurn(used);
  assert.equal(next.npcDecisionLog[0].type, "skip");
  assert.equal(next.battleLog.length, 0);
});

test("a combat loss down to one soldier ends simulation without an extra decision", () => {
  const initial = makeGame(3);
  let game = startAttack(initial, "npc-1", "c1", "c0");
  // A resumed attack at equal fighting strength is continued under this strategy.
  country(game, 0).soldiers = 2;
  let count = 0;
  game = simulateNpcTurn(game, { random: () => count++ < 2 ? 0 : 0.99 });
  assert.equal(country(game, 1).soldiers, 1);
  assert.equal(game.attackInProgress, false);
  assert.equal(game.currentPlayerId, "npc-2");
  assert.deepEqual(game.npcDecisionLog.map((item) => item.type), ["roll"]);
  assert.equal(game.battleLog.at(-1).outcome, "attack_failed");
});

test("the attack threshold includes the mandatory one-soldier reserve", () => {
  assert.equal(chooseNpcDecision(makeGame(5)).type, "skip");
  assert.equal(chooseNpcDecision(makeGame(6)).type, "attack");
});

test("the final NPC turn advances into round two and preserves its decision history", () => {
  const game = makeGame();
  game.currentPlayerId = "npc-9";
  game.turnIndex = 9;
  country(game, 9).soldiers = 1;
  const next = simulateNpcTurn(game);
  assert.equal(next.round, 2);
  assert.equal(next.currentPlayerId, "human-player");
  assert.equal(next.pendingReinforcements, 2);
  assert.equal(next.npcDecisionLog[0].round, 1);
  assert.equal(next.npcDecisionLog[0].playerId, "npc-9");
});
