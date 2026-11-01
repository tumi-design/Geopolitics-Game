import { createHash } from 'node:crypto';
import { countries } from '../src/data/countries.js';
import { resolveCombatRound, getCombatDiceCount, getConquestReward, getStartingSoldiers } from '../src/engine/gameRules.js';
import { isCommentaryEvent } from '../src/game/commentaryEvents.js';

export function requestIdentifiers(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some((key) => !['gameId', 'eventId', 'retry'].includes(key)) ||
      !/^[A-Za-z0-9]{20}$/.test(body.gameId) || !Number.isSafeInteger(body.eventId) || body.eventId < 1 || body.eventId > 100_000 ||
      (body.retry !== undefined && typeof body.retry !== 'boolean')) throw new Error('invalid-request');
  return body;
}

export function battleFacts(core, event, combat, outcomes = []) {
  if (!isCommentaryEvent(event) || !Number.isSafeInteger(event.id) || event.id < 1) throw new Error('unsupported-event');
  const source = countries.find((country) => country.id === event.sourceCountryId);
  const target = countries.find((country) => country.id === event.targetCountryId);
  if (!source || !target || source.id === target.id || !core.countries?.some((country) => country.id === source.id) ||
      !core.countries.some((country) => country.id === target.id)) throw new Error('invalid-event');
  const safeCount = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
  if (![event.attackingSoldiers, event.defendingSoldiers, event.round].every(safeCount)) throw new Error('invalid-event');
  let phase = null;
  if (combat) {
    if (combat.type !== 'combat_phase' || combat.playerId !== event.playerId || combat.round !== event.round ||
        combat.sourceCountryId !== source.id || combat.targetCountryId !== target.id || combat.id > event.id ||
        !Array.isArray(combat.attackerRolls) || combat.attackerRolls.length > 1000) throw new Error('invalid-dice');
    if (combat.attackerRolls.length !== getCombatDiceCount(combat.attackingSoldiersBefore, combat.defendingSoldiersBefore)) throw new Error('invalid-dice');
    const resolved = resolveCombatRound(combat.attackerRolls, combat.defenderRolls);
    if (resolved.attackerLosses !== combat.attackerLosses || resolved.defenderLosses !== combat.defenderLosses ||
        combat.attackingSoldiersBefore - resolved.attackerLosses !== combat.attackingSoldiers ||
        combat.defendingSoldiersBefore - resolved.defenderLosses !== combat.defendingSoldiers) throw new Error('invalid-dice');
    phase = { attackerRolls: combat.attackerRolls, defenderRolls: combat.defenderRolls,
      attackerLosses: combat.attackerLosses, defenderLosses: combat.defenderLosses,
      attackingSoldiers: combat.attackingSoldiers, defendingSoldiers: combat.defendingSoldiers };
  }
  if (event.type !== 'attack_stopped' && !phase) throw new Error('missing-dice');
  if (event.type === 'country_conquered' && (combat.outcome !== 'conquest_pending' || combat.defendingSoldiers !== 0 ||
      event.reward !== getConquestReward(getStartingSoldiers(target.population)) || !safeCount(event.soldiersTransferred) || event.soldiersTransferred < 1 ||
      combat.attackingSoldiers + event.reward - event.soldiersTransferred !== event.attackingSoldiers ||
      event.defendingSoldiers !== event.soldiersTransferred)) throw new Error('invalid-conquest');
  if (event.outcome === 'attack_failed' && event.attackingSoldiers !== 1) throw new Error('invalid-defeat');
  return { eventId: event.id, round: event.round, attacker: source.name, defender: target.name,
    outcome: event.type === 'country_conquered' ? 'conquered' : event.type === 'attack_stopped' ? 'stopped' : 'attack_failed',
    phase, remainingAttackers: event.attackingSoldiers, remainingDefenders: event.defendingSoldiers,
    conquestReward: event.reward ?? 0, occupationSoldiers: event.soldiersTransferred ?? 0,
    defenderEliminated: outcomes.some((item) => item.type === 'player_eliminated' && item.eliminatedPlayerId === event.previousOwnerId),
    gameWon: outcomes.some((item) => item.type === 'victory' && item.winnerId === event.playerId) };
}

export function factsHash(facts) {
  return createHash('sha256').update(JSON.stringify(facts)).digest('hex');
}
