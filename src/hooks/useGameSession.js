import { useEffect, useRef, useState } from 'react';
import { applyHumanAction, advanceNpcPlayback, getSessionStatus, playbackDelay } from '../game/gameSession.js';
import { gameRepository as repository } from '../services/gameRepository.js';
import { canEditGame } from '../services/gameStorage.js';
import { firebaseErrorMessage } from '../services/authValidation.js';

function linkGame(id) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('game', id);
  else url.searchParams.delete('game');
  window.history.replaceState(null, '', url);
}

export default function useGameSession(enabled, account) {
  const [id, setId] = useState(() => new URLSearchParams(window.location.search).get('game'));
  const [saved, setSaved] = useState(null);
  const [games, setGames] = useState([]);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [reload, setReload] = useState(0);
  const current = useRef(null);
  const lock = useRef(false);
  const retry = useRef(null);
  const generation = useRef(0);
  const identity = `${id ?? ''}:${account.user?.uid ?? ''}`;
  const activeIdentity = useRef(identity);
  const view = saved?.identity === identity ? saved : null;
  const canEdit = Boolean(view && !view.fromCache && canEditGame(view.metadata, account.user?.uid)
    && !account.loading && !account.busy && !busy && !pending && !error);

  useEffect(() => {
    if (!repository || account.loading || !account.user) return;
    return repository.watchList(account.user.uid, (next) => { setGames(next); setListError(''); },
      (failure) => setListError(firebaseErrorMessage(failure)));
  }, [account.loading, account.user]);

  useEffect(() => {
    activeIdentity.current = identity;
    current.current = null;
    retry.current = null;
    lock.current = false;
    // Reset operation UI when the account, selected game, or reload changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(false); setPending(false); setError('');
    const epoch = ++generation.current;
    if (!repository || !id || account.loading) return;
    return repository.watch(id, (next) => {
      if (epoch !== generation.current) return;
      if (current.current && next.metadata.revision < current.current.metadata.revision) return;
      current.current = { ...next, identity };
      setSaved(current.current);
    }, (failure) => {
      if (epoch === generation.current) {
        setError(firebaseErrorMessage(failure));
        if (failure.code === 'permission-denied') { current.current = null; setSaved(null); }
      }
    });
  }, [id, identity, account.loading, reload]);

  useEffect(() => {
    function warn(event) {
      if (lock.current || retry.current) { event.preventDefault(); event.returnValue = ''; }
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  function select(nextId) {
    if (lock.current || retry.current) return false;
    setSaved(null); current.current = null;
    setError(''); setPending(false); setPaused(false);
    setId(nextId); linkGame(nextId);
    if (nextId === id) setReload((value) => value + 1);
    return true;
  }

  async function commit(change, existing = null) {
    if (lock.current || (!existing && !canEdit)) return;
    const position = current.current;
    if (!position || position.identity !== identity || !canEditGame(position.metadata, account.user?.uid)) return;
    const operation = existing ?? { change, revision: position.metadata.revision, token: crypto.randomUUID(), id, uid: account.user.uid };
    lock.current = true; retry.current = operation;
    setBusy(true); setPending(true); setError('');
    const epoch = generation.current;
    try {
      const revision = await repository.update(operation.id, operation.uid, operation.revision, operation.token, operation.change);
      if (epoch !== generation.current || activeIdentity.current !== identity) return;
      if (current.current.metadata.revision <= revision) {
        current.current = { ...current.current, game: operation.change.game ?? current.current.game,
          metadata: { ...current.current.metadata, ...('isShared' in operation.change ? { isShared: operation.change.isShared } : {}), revision, lastMutationId: operation.token } };
        setSaved(current.current);
      }
      retry.current = null; setPending(false);
    } catch (failure) {
      if (epoch === generation.current) setError(firebaseErrorMessage(failure));
    } finally {
      if (epoch === generation.current) { lock.current = false; setBusy(false); }
    }
  }

  function act(action) {
    if (!canEdit || lock.current) return;
    try { void commit({ game: applyHumanAction(current.current.game, action) }); }
    catch (failure) { setError(failure.message); }
  }

  useEffect(() => {
    if (!enabled || !canEdit || paused || getSessionStatus(view?.game) !== 'npc') return;
    const position = view.game;
    const timer = setTimeout(() => {
      if (current.current?.game !== position || lock.current) return;
      try { void commit({ game: advanceNpcPlayback(position) }); }
      catch (failure) { setError(`NPC playback paused: ${failure.message}`); setPaused(true); }
    }, playbackDelay(speed));
    return () => clearTimeout(timer);
    // Each timer captures this render's ownership and saved revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, canEdit, paused, speed, view]);

  async function create(game) {
    if (!repository || !account.user || lock.current || retry.current || account.busy) throw new Error('Sign in and finish any pending save before creating a game.');
    lock.current = true; setBusy(true); setError('');
    try {
      const nextId = await repository.create(account.user.uid, game);
      lock.current = false;
      select(nextId);
    } finally { lock.current = false; setBusy(false); }
  }
  async function remove(entry) {
    if (!account.user || entry.ownerUid !== account.user.uid || lock.current || retry.current) return;
    lock.current = true; setBusy(true); setListError('');
    try {
      await repository.remove(entry.id, account.user.uid, entry.revision);
      lock.current = false;
      if (id === entry.id) select(null);
    } catch (failure) { setListError(firebaseErrorMessage(failure)); }
    finally { lock.current = false; setBusy(false); }
  }
  function reloadSaved() {
    if (busy) return;
    retry.current = null; setPending(false); setError(''); setSaved(null);
    setReload((value) => value + 1);
  }
  return {
    id, game: view?.game ?? null, metadata: view?.metadata, fromCache: view?.fromCache,
    loading: Boolean(id && !view && !error), canEdit, busy, pending, error, listError,
    games: account.user ? games.filter((entry) => entry.ownerUid === account.user.uid) : [],
    create, select, remove, act, paused, setPaused, speed, setSpeed,
    clearError: () => { if (!pending) setError(''); }, reloadSaved,
    retrySave: () => { if (retry.current) void commit(null, retry.current); },
    setSharing: (isShared) => commit({ isShared }),
  };
}
