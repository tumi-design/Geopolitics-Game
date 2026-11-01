// Presentation policy only. The engine remains the authority on every result.
export function isCommentaryEvent(event) {
  return event?.type === 'country_conquered' || event?.type === 'attack_stopped' ||
    (event?.type === 'combat_phase' && event.outcome === 'attack_failed');
}

export function commentaryEventForActivity(activity) {
  return isCommentaryEvent(activity.event) ? activity.event : null;
}
