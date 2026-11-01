import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase.js';
import { requestBattleCommentary } from '../services/commentaryClient.js';

const attempted = new Set();
export default function useBattleCommentary({ gameId, user, owner, eventId, speed = 1 }) {
  const identity = `${gameId}:${user?.uid ?? 'spectator'}`;
  const [snapshot, setSnapshot] = useState(null);
  const [feedback, setFeedback] = useState({});
  const [now, setNow] = useState(() => Date.now());
  const view = snapshot?.identity === identity ? snapshot : null;
  const entries = view?.entries ?? {};
  const requestKey = `${identity}:${eventId}`;
  const savedEntry = entries[eventId];
  const local = feedback[requestKey];
  const entry = useMemo(() => savedEntry?.state === 'ready' ? savedEntry
    : local?.state === 'unavailable' ? { ...savedEntry, ...local } : savedEntry ?? local, [savedEntry, local]);
  const retryAfter = entry?.retryAfter ?? 0;

  useEffect(() => {
    if (!gameId || !db) return;
    return onSnapshot(collection(db, 'games', gameId, 'commentary'), { includeMetadataChanges: true }, (next) => {
      setSnapshot({ identity, loaded: !next.metadata.fromCache,
        entries: Object.fromEntries(next.docs.map((document) => [document.id, document.data()])) });
    }, () => setSnapshot({ identity, loaded: false, entries: {}, error: true }));
  }, [gameId, identity]);

  useEffect(() => {
    if (!retryAfter) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1, retryAfter - Date.now()));
    return () => clearTimeout(timer);
  }, [retryAfter]);

  const request = useCallback(async (retry = false) => {
    if (!owner || !user || !gameId || !eventId) return;
    attempted.add(requestKey);
    setFeedback((previous) => ({ ...previous, [requestKey]: { state: 'requesting' } }));
    const result = await requestBattleCommentary(user, gameId, eventId, retry);
    // Results are keyed by game, identity and event. Never touch engine state.
    setFeedback((previous) => ({ ...previous, [requestKey]: result }));
  }, [owner, user, gameId, eventId, requestKey]);

  useEffect(() => {
    if (!owner || !eventId || speed !== 1 || !view?.loaded || entry || attempted.has(requestKey)) return;
    const timer = setTimeout(() => { void request(); }, 1500);
    return () => clearTimeout(timer);
  }, [owner, eventId, speed, view?.loaded, entry, requestKey, request]);

  return { entries, entry, loading: !view?.loaded, error: view?.error,
    request, expired: Boolean(retryAfter && retryAfter <= now), canRetry: Boolean(owner && retryAfter <= now && (entry?.attempts ?? 0) < 2),
    requesting: feedback[requestKey]?.state === 'requesting' };
}
