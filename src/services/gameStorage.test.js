import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGame } from '../engine/gameState.js';
import { countries } from '../data/countries.js';
import { startAttack, rollAttackPhase, completeConquest, skipTurn } from '../engine/gameEngine.js';
import { advanceNpcPlayback } from '../game/gameSession.js';
import { splitGame, restoreGame, encodePayload, canEditGame, SCHEMA_VERSION } from './gameStorage.js';

export function makeSavedGame() {
  const game = createInitialGame(countries, '710', () => 0.5);
  game.turnOrder = game.players.map((player) => player.id);
  game.turnIndex = 0; game.currentPlayerId = 'human-player';
  return game;
}
function roundTrip(game) {
  const before = structuredClone(game);
  const saved = { schemaVersion: SCHEMA_VERSION, ...splitGame(game) };
  const result = restoreGame(saved, JSON.parse(encodePayload(game.battleLog)), JSON.parse(encodePayload(game.npcDecisionLog)));
  assert.deepEqual(result, before);
  assert.deepEqual(game, before);
  assert.notEqual(result, game);
  return result;
}
test('saved state restores exactly ten participants, shuffled order and all initial fields', () => {
  roundTrip(createInitialGame(countries, '710', () => 0.31));
});
test('saves restore pending reinforcements, transfers, active attacks and occupation without restarting', () => {
  const original = makeSavedGame();
  const [source, target] = original.countries;
  source.soldiers = 4; target.soldiers = 1;
  roundTrip({ ...original, round: 2, pendingReinforcements: 2 });
  let game = startAttack(original, 'human-player', source.id, target.id);
  roundTrip(game);
  let calls = 0;
  game = rollAttackPhase(roundTrip(game), 'human-player', () => calls++ % 2 === 0 ? 0.99 : 0);
  assert.equal(game.activeAttack.phase, 'conquest');
  assert.equal(roundTrip(game).countries[1].soldiers, 0);
  roundTrip(completeConquest(roundTrip(game), 'human-player', 2));
});
test('NPC history survives reload and the next step continues instead of repeating', () => {
  let game = skipTurn(makeSavedGame(), 'human-player');
  game = advanceNpcPlayback(game, () => 0.4);
  const restored = roundTrip(game);
  const next = advanceNpcPlayback(restored, () => 0.4);
  assert.equal(next.npcDecisionLog.length, restored.npcDecisionLog.length + 1);
  assert.deepEqual(next.npcDecisionLog.slice(0, -1), game.npcDecisionLog);
});
test('finished games and winner fields survive refresh', () => {
  const game = makeSavedGame();
  game.countries = game.countries.map((country) => ({ ...country, ownerId: 'human-player' }));
  roundTrip({ ...game, status: 'finished', winnerId: 'human-player' });
});
test('unsupported, incomplete or oversized saves fail clearly without changing the original', () => {
  const game = makeSavedGame();
  const saved = { schemaVersion: SCHEMA_VERSION, ...splitGame(game) };
  assert.throws(() => restoreGame({ ...saved, schemaVersion: 99 }, [], []), /version/);
  assert.throws(() => restoreGame({ ...saved, battleCount: 1 }, [], []), /loading/);
  assert.throws(() => splitGame({ ...game, countries: game.countries.slice(1) }), /incomplete/);
  assert.throws(() => splitGame({ ...game, currentPlayerId: 'not-a-player' }), /incomplete/);
  assert.throws(() => encodePayload('x'.repeat(700_001)), /size/);
  roundTrip(game);
});
test('ownership checks reject visitors, other accounts and games being deleted', () => {
  assert.equal(canEditGame({ ownerUid: 'owner', deleting: false }, 'owner'), true);
  assert.equal(canEditGame({ ownerUid: 'owner', isShared: true }, 'visitor'), false);
  assert.equal(canEditGame({ ownerUid: 'owner' }, null), false);
  assert.equal(canEditGame({ ownerUid: 'owner', deleting: true }, 'owner'), false);
});
