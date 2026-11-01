import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase.js';
import { requestBattleCommentary } from '../services/commentaryClient.js';

const attempted = new Set();
const emptyEntries = {};
export default function useBattleCommentary({ gameId, user, owner, eventId, displayEventId = eventId, speed = 1 }) {
  const identity = `${gameId}:${user?.uid ?? 'spectator'}`;
  // Opening/restoring a game is not a reason to generate historical commentary.
  const restored = useRef({ identity, eventId });
  const [snapshot, setSnapshot] = useState(null);
  const [feedback, setFeedback] = useState({});
  const [now, setNow] = useState(() => Date.now());
  const view = snapshot?.identity === identity ? snapshot : null;
  const entries = view?.entries ?? emptyEntries;
  const requestKey = `${identity}:${displayEventId}`;
  const savedEntry = entries[displayEventId];
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

  const requestEvent = useCallback(async (id, retry = false) => {
    if (!owner || !user || !gameId || !id) return;
    const key = `${identity}:${id}`;
    attempted.add(key);
    setFeedback((previous) => ({ ...previous, [key]: { state: 'requesting' } }));
    const result = await requestBattleCommentary(user, gameId, Number(id), retry);
    // Results are keyed by game, identity and event. Never touch engine state.
    setFeedback((previous) => ({ ...previous, [key]: result }));
  }, [owner, user, gameId, identity]);
  const request = useCallback((retry = false) => requestEvent(displayEventId, retry), [requestEvent, displayEventId]);

  useEffect(() => {
    if (restored.current.identity !== identity) {
      restored.current = { identity, eventId };
      return;
    }
    const liveKey = `${identity}:${eventId}`;
    if (eventId === restored.current.eventId || !owner || !eventId || speed !== 1 || !view?.loaded
      || entries[eventId] || feedback[liveKey] || attempted.has(liveKey)) return;
    const timer = setTimeout(() => { void requestEvent(eventId); }, 1500);
    return () => clearTimeout(timer);
  }, [identity, owner, eventId, speed, view?.loaded, entries, feedback, requestEvent]);

  return { entries, entry, loading: !view?.loaded, error: view?.error,
    request, expired: Boolean(retryAfter && retryAfter <= now), canRetry: Boolean(owner && retryAfter <= now && (entry?.attempts ?? 0) < 2),
    requesting: feedback[requestKey]?.state === 'requesting' };
}
