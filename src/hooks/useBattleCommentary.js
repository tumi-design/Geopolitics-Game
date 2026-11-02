import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase.js';
import { requestBattleCommentary } from '../services/commentaryClient.js';
import { createCommentaryScheduler } from '../game/commentaryScheduler.js';

const attempted = new Set();
const emptyEntries = {};
export default function useBattleCommentary({ gameId, user, owner, eventId, displayEventId = eventId, battleLog }) {
  const identity = `${gameId}:${user?.uid ?? 'spectator'}`;
  const scheduler = useRef(null);
  const [schedulerStatus, setSchedulerStatus] = useState(null);
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
    return result;
  }, [owner, user, gameId, identity]);
  const request = useCallback((retry = false) => scheduler.current?.manual(Number(displayEventId), retry), [displayEventId]);

  useEffect(() => {
    if (!owner) return;
    const next = createCommentaryScheduler({ send: requestEvent,
      hasAttempted: (id) => attempted.has(`${identity}:${id}`),
      onChange: (status) => setSchedulerStatus({ identity, ...status }) });
    scheduler.current = next;
    return () => { next.dispose(); scheduler.current = null; };
  }, [identity, owner, requestEvent]);

  useEffect(() => {
    scheduler.current?.observe(battleLog, entries, Boolean(view?.loaded));
  }, [battleLog, entries, view?.loaded, identity, owner]);

  return { entries, entry, loading: !view?.loaded, error: view?.error,
    requestStatus: schedulerStatus?.identity === identity ? schedulerStatus.lastRequest : null,
    request, expired: Boolean(retryAfter && retryAfter <= now), canRetry: Boolean(owner && retryAfter <= now && (entry?.attempts ?? 0) < 2),
    canRequest: owner && Boolean(view?.loaded) && !(schedulerStatus?.identity === identity && schedulerStatus.busy),
    requesting: feedback[requestKey]?.state === 'requesting' };
}
