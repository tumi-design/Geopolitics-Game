const inFlight = new Map();

export function requestBattleCommentary(user, gameId, eventId, retry = false, fetcher = fetch) {
  const key = `${user.uid}:${gameId}:${eventId}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = (async () => {
    try {
      const token = await user.getIdToken();
      const response = await fetcher('/api/battle-commentary', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gameId, eventId, retry }), signal: AbortSignal.timeout(45_000),
      });
      let record;
      try { record = await response.json(); } catch { throw new Error('endpoint-unavailable'); }
      if (!response.ok) return { state: 'unavailable', code: record.code, retryAfter: record.retryAfter ?? 0 };
      if (record.eventId !== eventId || !['ready', 'pending'].includes(record.state)) throw new Error('invalid-response');
      return record;
    } catch {
      return { state: 'unavailable', code: 'connection-unavailable', retryAfter: Date.now() + 60_000 };
    }
  })().finally(() => { inFlight.delete(key); });
  inFlight.set(key, promise);
  return promise;
}
