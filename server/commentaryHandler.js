import { battleFacts, factsHash, requestIdentifiers } from './commentaryFacts.js';
import { CommentaryError } from './firebaseRest.js';

export function createCommentaryHandler({ firebase, store, generate }) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ code: 'method-not-allowed' }); }
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (origin) {
      let originHost;
      try { originHost = new URL(origin).host; } catch { /* reject malformed origin */ }
      if (originHost !== host) return res.status(403).json({ code: 'access-denied' });
    }
    const authorization = req.headers.authorization ?? '';
    if (!/^Bearer [A-Za-z0-9._-]{20,8000}$/.test(authorization)) return res.status(401).json({ code: 'sign-in-required' });
    if (!req.headers['content-type']?.startsWith('application/json') || Number(req.headers['content-length'] ?? 0) > 1024) return res.status(400).json({ code: 'invalid-request' });
    let identifiers;
    try { identifiers = requestIdentifiers(typeof req.body === 'string' ? JSON.parse(req.body) : req.body); }
    catch { return res.status(400).json({ code: 'invalid-request' }); }
    try {
      const token = authorization.slice(7);
      const uid = await firebase.authenticate(token);
      const { gameId, eventId, retry = false } = identifiers;
      const parent = await firebase.get(`games/${gameId}`, token);
      if (!parent || parent.data.ownerUid !== uid || parent.data.deleting) throw new CommentaryError('access-denied', 403);
      if (eventId > parent.data.battleCount) throw new CommentaryError('invalid-event', 400);
      const saved = await firebase.get(`games/${gameId}/battles/${eventId}`, token);
      if (!saved || saved.data.seq !== eventId) throw new CommentaryError('invalid-event', 400);
      const event = JSON.parse(saved.data.payload);
      if (event.id !== eventId) throw new CommentaryError('invalid-event', 400);
      let combat = event.type === 'combat_phase' ? event : null;
      if (!combat && eventId > 1) {
        const previous = await firebase.get(`games/${gameId}/battles/${eventId - 1}`, token);
        const candidate = previous ? JSON.parse(previous.data.payload) : null;
        if (candidate?.type === 'combat_phase') combat = candidate;
      }
      const outcomes = [];
      if (event.type === 'country_conquered') {
        for (let following = eventId + 1; following <= Math.min(eventId + 2, parent.data.battleCount); following++) {
          const record = await firebase.get(`games/${gameId}/battles/${following}`, token);
          const next = record ? JSON.parse(record.data.payload) : null;
          if (next?.playerId === event.playerId && next.round === event.round && next.sourceCountryId === event.sourceCountryId &&
              next.targetCountryId === event.targetCountryId && ['player_eliminated', 'victory'].includes(next.type)) outcomes.push(next);
        }
      }
      let facts;
      try { facts = battleFacts(JSON.parse(parent.data.core), event, combat, outcomes); }
      catch { throw new CommentaryError('invalid-event', 400); }
      const lease = await store.claim({ gameId, eventId, uid, retry, hash: factsHash(facts) });
      if (lease.cached) return res.status(lease.cached.state === 'ready' ? 200 : 202).json(lease.cached);
      let result;
      try { result = await generate(facts); }
      catch (failure) {
        try { await store.finish(lease); } catch { /* lease prevents automatic duplicate generation */ }
        // Only fixed categories and numeric status are safe to log; never the
        // provider exception/message/request, which may contain credentials.
        const category = ['TypeError', 'AbortError', 'TimeoutError', 'SyntaxError'].includes(failure.name) ? failure.name : 'ProviderError';
        console.warn(`Commentary attempt unavailable: ${category}; HTTP ${Number(failure.status) || 0}.`);
        const code = failure.message === 'not-configured' ? 'setup-required'
          : failure.message === 'invalid-generation' || failure instanceof SyntaxError ? 'output-rejected'
            : Number(failure.status) === 429 ? 'provider-limit' : 'commentary-unavailable';
        throw new CommentaryError(code, 503, lease.data.retryAfter);
      }
      // Do not regenerate if this persistence acknowledgement fails. The lease
      // remains pending until an explicit, bounded retry is requested.
      const record = await store.finish(lease, result);
      return res.status(200).json(record);
    } catch (error) {
      const safe = error instanceof CommentaryError ? error : new CommentaryError('commentary-unavailable');
      if (safe.retryAfter) res.setHeader('Retry-After', String(Math.max(1, Math.ceil((safe.retryAfter - Date.now()) / 1000))));
      return res.status(safe.status).json({ code: safe.code, retryAfter: safe.retryAfter });
    }
  };
}
