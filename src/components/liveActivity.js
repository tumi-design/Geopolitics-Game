// Presentation only: combine a battle's final phase and outcomes into one view.
// A newer non-battle NPC decision takes priority over an older battle.
export function getLiveActivity(game) {
  const events = game.battleLog;
  const decision = game.npcDecisionLog.at(-1) ?? null;
  const latest = events.at(-1) ?? null;
  if (decision && decision.battleLogEnd === events.length &&
      decision.battleLogStart === decision.battleLogEnd) {
    return { event: null, combat: null, outcomes: [], decision, decisionIsCurrent: true };
  }
  if (!latest) return { event: null, combat: null, outcomes: [], decision, decisionIsCurrent: Boolean(decision) };

  let start = events.length - 1;
  while (start > 0 && events[start].type !== 'attack_started') {
    const previous = events[start - 1];
    if (previous.playerId !== latest.playerId || previous.round !== latest.round ||
        previous.sourceCountryId !== latest.sourceCountryId || previous.targetCountryId !== latest.targetCountryId) break;
    start--;
  }
  const battle = events.slice(start);
  return {
    event: battle.findLast((event) => event.type === 'country_conquered') ?? latest,
    combat: battle.findLast((event) => event.type === 'combat_phase') ?? null,
    outcomes: battle.filter((event) => ['player_eliminated', 'victory'].includes(event.type)),
    decision,
    decisionIsCurrent: Boolean(decision && decision.battleLogEnd === events.length),
  };
}
