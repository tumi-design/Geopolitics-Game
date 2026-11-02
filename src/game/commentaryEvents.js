// Presentation policy only. The engine remains the authority on every result.
export function isCommentaryEvent(event) {
  return event?.type === 'country_conquered' || event?.type === 'attack_stopped' ||
    (event?.type === 'combat_phase' && (event.outcome === 'attack_failed' ||
      (event.outcome === 'continue' && event.attackerLosses + event.defenderLosses > 0)));
}

/** One casualty-producing ongoing sample per attack, plus completed outcomes. */
export function automaticCommentaryCandidates(events) {
  const candidates = [];
  let battleId = null;
  let sampled = false;
  for (const event of events) {
    if (event.type === 'attack_started') { battleId = event.id; sampled = false; }
    if (battleId === null || !isCommentaryEvent(event)) continue;
    const completed = event.type !== 'combat_phase' || event.outcome === 'attack_failed';
    if (completed || !sampled) candidates.push({ eventId: event.id, battleId, completed });
    if (!completed) sampled = true;
  }
  return candidates;
}

export function commentaryEventForActivity(activity) {
  return isCommentaryEvent(activity.event) ? activity.event : null;
}
