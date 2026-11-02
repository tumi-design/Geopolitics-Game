import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticCommentaryCandidates, isCommentaryEvent } from './commentaryEvents.js';

test('automatic sampling ignores ties and selects only the first meaningful ongoing phase of each attack', () => {
  const events = [
    { id: 1, type: 'attack_started' },
    { id: 2, type: 'combat_phase', outcome: 'continue', attackerLosses: 0, defenderLosses: 0 },
    { id: 3, type: 'combat_phase', outcome: 'continue', attackerLosses: 1, defenderLosses: 0 },
    { id: 4, type: 'combat_phase', outcome: 'continue', attackerLosses: 0, defenderLosses: 1 },
    { id: 5, type: 'attack_stopped' },
    { id: 6, type: 'attack_started' },
    { id: 7, type: 'combat_phase', outcome: 'attack_failed' },
  ];
  assert.deepEqual(automaticCommentaryCandidates(events), [
    { eventId: 3, battleId: 1, completed: false }, { eventId: 5, battleId: 1, completed: true },
    { eventId: 7, battleId: 6, completed: true },
  ]);
  assert.equal(isCommentaryEvent(events[1]), false);
  assert.equal(isCommentaryEvent(events[3]), true, 'Later casualty phases remain available for explicit owner generation.');
});

test('immediate conquest emits one outcome candidate, not a duplicate pending-conquest phase', () => {
  assert.deepEqual(automaticCommentaryCandidates([
    { id: 1, type: 'attack_started' }, { id: 2, type: 'combat_phase', outcome: 'conquest_pending', defenderLosses: 1 },
    { id: 3, type: 'country_conquered' }, { id: 4, type: 'player_eliminated' },
  ]), [{ eventId: 3, battleId: 1, completed: true }]);
});
