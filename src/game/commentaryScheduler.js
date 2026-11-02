import { automaticCommentaryCandidates } from './commentaryEvents.js';

/** Local bounded sampling; server quotas/leases remain authoritative.
 * Injected clock and timers make pacing testable without provider requests.
 */
export function createCommentaryScheduler({ send, hasAttempted = () => false,
  onChange = () => {}, clock = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let seen = null;
  let pending = null;
  let inFlight = false;
  let ready = false;
  let entries = {};
  let nextAt = 0;
  let blockedUntil = 0;
  let timer = null;
  let disposed = false;
  let lastRequest = null;
  const emit = () => { if (!disposed) onChange({ busy: inFlight, lastRequest }); };
  function clearWakeup() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }
  async function dispatch(eventId, retry) {
    inFlight = true;
    nextAt = Math.max(nextAt, clock() + 30_000);
    lastRequest = { eventId, state: 'requesting' };
    emit();
    let result;
    try { result = await send(eventId, retry); }
    catch { result = { state: 'unavailable', code: 'connection-unavailable', retryAfter: clock() + 60_000 }; }
    if (disposed) return result;
    inFlight = false;
    lastRequest = { ...result, eventId };
    if (result?.state === 'unavailable' || result?.state === 'pending') {
      // Drop queued work, never automatically retry this failed/leased event.
      pending = null;
      const retryAfter = Number(result.retryAfter);
      blockedUntil = Math.max(nextAt, Number.isFinite(retryAfter) && retryAfter > clock() ? retryAfter : clock() + 60_000);
    }
    emit();
    pump();
    return result;
  }
  function pump() {
    clearWakeup();
    if (disposed || !ready || inFlight || !pending) return;
    if (entries[pending.eventId] || hasAttempted(pending.eventId)) { pending = null; return; }
    const delay = Math.max(nextAt, blockedUntil) - clock();
    if (delay > 0) { timer = setTimer(pump, delay); return; }
    const candidate = pending;
    pending = null;
    void dispatch(candidate.eventId, false);
  }
  return {
    observe(events, savedEntries, loaded) {
      if (disposed) return;
      entries = savedEntries;
      ready = loaded;
      if (seen === null || events.length < seen) {
        // Initial/restored history is a baseline, never a generation queue.
        seen = events.length;
        pending = null;
        emit(); // Clear stale request UI when reopening the same owner/game.
        return;
      }
      if (pending && !pending.completed && events.some((event) => event.id > pending.eventId &&
        (event.type === 'attack_started' || event.type === 'attack_stopped' || event.type === 'country_conquered' ||
          (event.type === 'combat_phase' && event.outcome !== 'continue')))) pending = null;
      for (const candidate of automaticCommentaryCandidates(events)) {
        if (candidate.eventId <= seen || entries[candidate.eventId] || hasAttempted(candidate.eventId)) continue;
        if (blockedUntil > clock()) continue; // Skip during cooldown, no backlog.
        if (!pending || Number(candidate.completed) >= Number(pending.completed)) pending = candidate;
      }
      seen = events.length;
      pump();
    },
    manual(eventId, retry = false) {
      if (disposed || inFlight || !ready) return Promise.resolve(null);
      if (pending?.eventId === eventId) pending = null;
      clearWakeup();
      // Explicit owner requests retain server-enforced retry/cooldown rules.
      return dispatch(eventId, retry);
    },
    dispose() { disposed = true; pending = null; clearWakeup(); },
  };
}
