import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveActivity } from './liveActivity.js';

function event(id, type, details = {}) {
  return { id, type, round: 1, playerId: 'human-player', sourceCountryId: 'a', targetCountryId: 'b', ...details };
}

test('live activity handles an empty game without inventing a battle', () => {
  assert.deepEqual(getLiveActivity({ battleLog: [], npcDecisionLog: [] }), {
    event: null, combat: null, outcomes: [], decision: null, decisionIsCurrent: false,
  });
});

test('one combat phase supplies both the current event and its dice', () => {
  const combat = event(2, 'combat_phase');
  const result = getLiveActivity({ battleLog: [event(1, 'attack_started'), combat], npcDecisionLog: [] });
  assert.equal(result.event, combat);
  assert.equal(result.combat, combat);
});

test('conquest, elimination and victory share one battle view with the final dice phase', () => {
  const combat = event(2, 'combat_phase');
  const conquered = event(3, 'country_conquered');
  const outcomes = [event(4, 'player_eliminated'), event(5, 'victory')];
  const game = { battleLog: [event(1, 'attack_started'), combat, conquered, ...outcomes], npcDecisionLog: [] };
  const before = structuredClone(game);
  const result = getLiveActivity(game);
  assert.equal(result.event, conquered);
  assert.equal(result.combat, combat);
  assert.deepEqual(result.outcomes, outcomes);
  assert.deepEqual(game, before);
});

test('new NPC preparation and skip decisions replace older battles at the focal point', () => {
  for (const type of ['reinforce', 'transfer', 'skip']) {
    const decision = { type, reason: 'A strategic explanation', battleLogStart: 2, battleLogEnd: 2 };
    const result = getLiveActivity({ battleLog: [event(1, 'attack_started'), event(2, 'combat_phase')], npcDecisionLog: [decision] });
    assert.equal(result.event, null);
    assert.equal(result.combat, null);
    assert.equal(result.decision, decision);
    assert.equal(result.decisionIsCurrent, true);
  }
});

test('a new battle does not reuse dice from the previous battle', () => {
  const started = event(3, 'attack_started', { playerId: 'npc-1', sourceCountryId: 'c' });
  const result = getLiveActivity({ battleLog: [event(1, 'attack_started'), event(2, 'combat_phase'), started], npcDecisionLog: [] });
  assert.equal(result.event, started);
  assert.equal(result.combat, null);
});

test('a newer human battle takes priority over the previous NPC explanation', () => {
  const decision = { type: 'skip', battleLogStart: 0, battleLogEnd: 0 };
  const started = event(1, 'attack_started');
  const result = getLiveActivity({ battleLog: [started], npcDecisionLog: [decision] });
  assert.equal(result.event, started);
  assert.equal(result.decisionIsCurrent, false);
});

test('stopping retains only the latest dice from that same battle', () => {
  const latest = event(3, 'combat_phase');
  const stopped = event(4, 'attack_stopped');
  const result = getLiveActivity({ battleLog: [event(1, 'attack_started'), event(2, 'combat_phase'), latest, stopped], npcDecisionLog: [] });
  assert.equal(result.event, stopped);
  assert.equal(result.combat, latest);
});
