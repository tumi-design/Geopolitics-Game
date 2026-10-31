import { useCallback, useEffect, useRef, useState } from 'react';
import { applyHumanAction, advanceNpcPlayback, getSessionStatus, playbackDelay } from '../game/gameSession.js';

export default function useGameSession(enabled) {
  const [game, setGame] = useState(null);
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const currentGame = useRef(null);

  // Compute random actions outside React state updaters, which StrictMode may
  // invoke twice. The ref also rejects stale timers and rapid duplicate actions.
  const commit = useCallback((next) => {
    currentGame.current = next;
    setGame(next);
  }, []);
  const replaceGame = useCallback((next) => {
    commit(next);
    setError('');
    setPaused(false);
  }, [commit]);
  const act = useCallback((action) => {
    try {
      commit(applyHumanAction(currentGame.current, action));
      setError('');
    } catch (failure) {
      setError(failure.message);
    }
  }, [commit]);

  useEffect(() => {
    if (!enabled || paused || error || getSessionStatus(game) !== 'npc') return;
    const timer = setTimeout(() => {
      if (currentGame.current !== game) return;
      try {
        commit(advanceNpcPlayback(game));
      } catch (failure) {
        setError(`NPC playback paused: ${failure.message}`);
        setPaused(true);
      }
    }, playbackDelay(speed));
    return () => clearTimeout(timer);
  }, [enabled, game, paused, speed, error, commit]);

  return { game, replaceGame, act, error, clearError: () => setError(''), paused, setPaused, speed, setSpeed };
}
