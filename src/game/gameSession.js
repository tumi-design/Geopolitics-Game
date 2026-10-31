// UI-to-engine boundary. Rules remain in src/engine; these functions only route
// actions and prevent the human interface from acting on a computer's turn.
import {
  allocateReinforcements, transferSoldiers, startAttack, rollAttackPhase,
  stopAttack, completeConquest, skipTurn,
} from '../engine/gameEngine.js';
import { executeNpcStep } from '../engine/npcStrategy.js';

export function getSessionStatus(game) {
  if (!game) return 'setup';
  const human = game.players.find((player) => player.isHuman);
  if (game.winnerId === human?.id && game.status === 'finished') return 'victory';
  if (game.status !== 'active' || !game.countries.some((country) => country.ownerId === human?.id)) return 'defeat';
  return game.currentPlayerId === human.id ? 'human' : 'npc';
}

export function applyHumanAction(game, action, random = Math.random) {
  if (getSessionStatus(game) !== 'human') throw new Error('Wait for your active turn before taking an action.');
  const playerId = game.currentPlayerId;
  switch (action.type) {
    case 'reinforce': return allocateReinforcements(game, playerId, action.allocations);
    case 'transfer': return transferSoldiers(game, playerId, action.sourceId, action.targetId, action.soldiers);
    case 'attack': return startAttack(game, playerId, action.sourceId, action.targetId);
    case 'roll': return rollAttackPhase(game, playerId, random);
    case 'stop': return stopAttack(game, playerId);
    case 'occupy': return completeConquest(game, playerId, action.soldiers);
    case 'skip': return skipTurn(game, playerId);
    default: throw new Error('Unknown game action.');
  }
}

/** One action per call, never a whole simulated turn. */
export function advanceNpcPlayback(game, random = Math.random) {
  if (getSessionStatus(game) !== 'npc') throw new Error('NPC playback requires an active computer turn.');
  const steps = game.npcDecisionLog.filter((decision) =>
    decision.playerId === game.currentPlayerId && decision.round === game.round).length;
  if (steps >= 200) throw new Error('NPC playback paused after 200 actions in one turn. Start a new game to recover.');
  return executeNpcStep(game, { random });
}

export function playbackDelay(speed) {
  if (![1, 2, 4].includes(speed)) throw new RangeError('Choose a playback speed of 1, 2 or 4.');
  return 1600 / speed;
}
