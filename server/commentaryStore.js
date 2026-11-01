import { CommentaryError } from './firebaseRest.js';

// Durable counters and event leases work across Vercel instances and refreshes.
export function createCommentaryStore(firebase, clock = Date.now) {
  const pathFor = (gameId, eventId) => `games/${gameId}/commentary/${eventId}`;
  async function claim({ gameId, eventId, uid, hash, retry }) {
    const token = await firebase.writerToken();
    const path = pathFor(gameId, eventId);
    for (let attempt = 0; attempt < 4; attempt++) {
      const now = clock();
      const [existing, global, user] = await Promise.all([firebase.get(path, token), firebase.get('commentaryQuota/global', token), firebase.get(`commentaryQuota/${uid}`, token)]);
      const record = existing?.data;
      if (record) {
        if (record.factsHash !== hash) throw new CommentaryError('event-changed', 409);
        if (record.state === 'ready') return { cached: record };
        if (record.state === 'pending' && now < record.retryAfter) return { cached: record };
        if (!retry || record.attempts >= 2) throw new CommentaryError('commentary-unavailable', 503, record.retryAfter);
        if (now < record.retryAfter) throw new CommentaryError('retry-later', 429, record.retryAfter);
      }
      const day = new Date(now).toISOString().slice(0, 10);
      const minute = Math.floor(now / 60_000);
      function counters(previous, maximum) {
        const dayCount = previous?.data.day === day ? previous.data.dayCount : 0;
        const minuteCount = previous?.data.minute === minute ? previous.data.minuteCount : 0;
        if (dayCount >= maximum) throw new CommentaryError('daily-limit', 429, Date.parse(`${day}T00:00:00Z`) + 86_400_000);
        if (minuteCount >= 2) throw new CommentaryError('request-limit', 429, (minute + 1) * 60_000);
        return { day, dayCount: dayCount + 1, minute, minuteCount: minuteCount + 1 };
      }
      const next = { eventId, state: 'pending', text: '', model: '', factsHash: hash,
        attempts: (record?.attempts ?? 0) + 1, createdAt: record?.createdAt ?? now, updatedAt: now, retryAfter: now + 60_000 };
      const writes = [
        { path: 'commentaryQuota/global', data: counters(global, 20), previous: global },
        { path: `commentaryQuota/${uid}`, data: counters(user, 8), previous: user },
        { path, data: next, previous: existing },
      ];
      try {
        const result = await firebase.commit(writes, token);
        return { token, path, data: next, updateTime: result.writeResults[2].updateTime };
      } catch (error) { if (error.code !== 'storage-conflict' || attempt === 3) throw error; }
    }
  }
  async function finish(lease, result = null) {
    const data = { ...lease.data, state: result ? 'ready' : 'failed', text: result?.text ?? '', model: result?.model ?? '', updatedAt: clock() };
    await firebase.commit([{ path: lease.path, data, previous: { updateTime: lease.updateTime } }], lease.token);
    return data;
  }
  return { claim, finish };
}
