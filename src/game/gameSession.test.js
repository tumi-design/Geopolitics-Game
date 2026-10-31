import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGame } from '../engine/gameState.js';
import { countries } from '../data/countries.js';
import { applyHumanAction, advanceNpcPlayback, getSessionStatus, playbackDelay } from './gameSession.js';

function makeGame() {
  // Isolate these combat scenarios from changes to real demographic data.
  const fixtures = countries.map((country) => ({ ...country, population: 10_000_000 }));
  const game = createInitialGame(fixtures, '710', () => 0.5);
  game.turnOrder = game.players.map((player) => player.id);
  game.currentPlayerId = 'human-player';
  return game;
}
function rejected(game, action) {
  const before = structuredClone(game);
  assert.throws(action);
  assert.deepEqual(game, before);
}
function winningDice() {
  let calls = 0;
  return () => calls++ % 2 === 0 ? 0.99 : 0;
}

test('human attack, repeat rolls, occupation and elimination route through the engine', () => {
  let game = makeGame();
  const sourceId = game.countries[0].id;
  const targetId = game.countries[1].id;
  const initial = structuredClone(game);
  game = applyHumanAction(game, { type: 'attack', sourceId, targetId });
  assert.deepEqual(initial.countries, game.countries);
  game = applyHumanAction(game, { type: 'roll' }, winningDice());
  assert.equal(game.countries.find((country) => country.id === targetId).soldiers, 1);
  game = applyHumanAction(game, { type: 'roll' }, winningDice());
  assert.equal(game.activeAttack.phase, 'conquest');
  rejected(game, () => applyHumanAction(game, { type: 'occupy', soldiers: 0 }));
  game = applyHumanAction(game, { type: 'occupy', soldiers: 2 });
  assert.equal(game.countries.find((country) => country.id === targetId).ownerId, 'human-player');
  assert.equal(getSessionStatus(game), 'npc');
  assert.equal(game.battleLog.at(-1).type, 'player_eliminated');
});

test('UI reinforcement allocations and transfers respect pending balances and reserves', () => {
  let game = { ...makeGame(), round: 2, pendingReinforcements: 4 };
  game.countries[1].ownerId = 'human-player';
  const [source, target] = game.countries;
  rejected(game, () => applyHumanAction(game, { type: 'skip' }));
  rejected(game, () => applyHumanAction(game, { type: 'reinforce', allocations: [{ countryId: source.id, soldiers: 5 }] }));
  game = applyHumanAction(game, { type: 'reinforce', allocations: [
    { countryId: source.id, soldiers: 3 }, { countryId: target.id, soldiers: 1 },
  ] });
  assert.equal(game.pendingReinforcements, 0);
  rejected(game, () => applyHumanAction(game, { type: 'transfer', sourceId: source.id, targetId: target.id, soldiers: 5 }));
  game = applyHumanAction(game, { type: 'transfer', sourceId: source.id, targetId: target.id, soldiers: 4 });
  assert.equal(game.countries[0].soldiers, 1);
  assert.equal(game.countries[1].soldiers, 7);
});

test('UI stop and skip actions end the turn using existing turn management', () => {
  const initial = makeGame();
  assert.equal(getSessionStatus(applyHumanAction(initial, { type: 'skip' })), 'npc');
  let game = applyHumanAction(initial, { type: 'attack', sourceId: initial.countries[0].id, targetId: initial.countries[1].id });
  game = applyHumanAction(game, { type: 'stop' });
  assert.equal(game.attackInProgress, false);
  assert.equal(game.battleLog.at(-1).type, 'attack_stopped');
});

test('human input is rejected on NPC turns and after victory or defeat', () => {
  const initial = makeGame();
  for (const game of [
    { ...initial, currentPlayerId: 'npc-1', turnIndex: 1 },
    { ...initial, status: 'finished', winnerId: 'human-player' },
    { ...initial, status: 'finished', winnerId: 'npc-1' },
    { ...initial, countries: initial.countries.map((country) => ({ ...country, ownerId: 'npc-1' })) },
  ]) rejected(game, () => applyHumanAction(game, { type: 'skip' }));
});

test('session status distinguishes setup, a human turn, an NPC turn, victory and defeat', () => {
  const game = makeGame();
  assert.equal(getSessionStatus(null), 'setup');
  assert.equal(getSessionStatus(game), 'human');
  assert.equal(getSessionStatus({ ...game, currentPlayerId: 'npc-1' }), 'npc');
  assert.equal(getSessionStatus({ ...game, status: 'finished', winnerId: 'human-player' }), 'victory');
  assert.equal(getSessionStatus({ ...game, countries: game.countries.map((country) => ({ ...country, ownerId: 'npc-1' })) }), 'defeat');
});

test('NPC playback performs exactly one explained decision per call', () => {
  const initial = makeGame();
  let game = { ...initial, currentPlayerId: 'npc-1', turnIndex: 1 };
  game.countries[1].soldiers = 6;
  const before = structuredClone(game);
  const started = advanceNpcPlayback(game);
  assert.deepEqual(game, before);
  assert.equal(started.npcDecisionLog.length, 1);
  assert.equal(started.npcDecisionLog[0].type, 'attack');
  assert.equal(started.battleLog.at(-1).type, 'attack_started');
  assert.equal(started.activeAttack.phaseNumber, 0);
  game = advanceNpcPlayback(started, () => 0.5);
  assert.equal(game.npcDecisionLog.length, 2);
  assert.equal(game.npcDecisionLog[1].type, 'roll');
  assert.equal(game.activeAttack.phaseNumber, 1);
});

test('NPC turns can return to the human at round two with reinforcements', () => {
  let game = applyHumanAction(makeGame(), { type: 'skip' });
  for (let index = 0; index < 9; index++) game = advanceNpcPlayback(game);
  assert.equal(getSessionStatus(game), 'human');
  assert.equal(game.round, 2);
  assert.equal(game.pendingReinforcements, 2);
  assert.equal(game.npcDecisionLog.length, 9);
  rejected(game, () => advanceNpcPlayback(game));
});

test('playback limits endless ties and never discards their decision records', () => {
  const initial = makeGame();
  let game = { ...initial, currentPlayerId: 'npc-1', turnIndex: 1 };
  game.countries[1].soldiers = 6;
  for (let index = 0; index < 102; index++) game = advanceNpcPlayback(game, () => 0.5);
  assert.equal(game.npcDecisionLog.length, 102);
  assert.equal(game.npcDecisionLog.at(-1).type, 'stop');
  assert.equal(game.attackInProgress, false);
});

test('NPC safety-limit and invalid-random errors do not modify the visible game', () => {
  const initial = makeGame();
  const game = { ...initial, currentPlayerId: 'npc-1', turnIndex: 1 };
  game.countries[1].soldiers = 6;
  const started = advanceNpcPlayback(game);
  rejected(started, () => advanceNpcPlayback(started, () => 1));
  const stalled = { ...game, npcDecisionLog: Array.from({ length: 200 }, (_, id) => ({ id, playerId: 'npc-1', round: 1 })) };
  rejected(stalled, () => advanceNpcPlayback(stalled));
});

test('fast-forward changes the delay while preserving a visible interval', () => {
  assert.equal(playbackDelay(1), 1600);
  assert.equal(playbackDelay(2), 800);
  assert.equal(playbackDelay(4), 400);
  assert.throws(() => playbackDelay(0));
});

test('human victory from occupation is visible through the session boundary', () => {
  let game = makeGame();
  const [source, target] = game.countries;
  game.countries = game.countries.map((country) => country.id === target.id
    ? { ...country, soldiers: 1 } : { ...country, ownerId: 'human-player', soldiers: 2 });
  game = applyHumanAction(game, { type: 'attack', sourceId: source.id, targetId: target.id });
  game = applyHumanAction(game, { type: 'roll' }, winningDice());
  game = applyHumanAction(game, { type: 'occupy', soldiers: 1 });
  assert.equal(getSessionStatus(game), 'victory');
  assert.equal(game.battleLog.at(-1).type, 'victory');
});
