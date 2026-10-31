export default function PlaybackControls({ status, game, paused, setPaused, speed, setSpeed, error, clearError }) {
  const player = game.players.find((item) => item.id === game.currentPlayerId);
  const title = status === 'victory' ? 'Victory — the world is yours.'
    : status === 'defeat' ? 'Defeat — you have lost all your countries.'
      : status === 'human' ? 'Your turn — choose your next move.'
        : paused || error ? 'NPC playback paused.' : `${player.name} is considering the board…`;
  return <section className={`panel playback-panel ${status === 'victory' || status === 'defeat' ? 'endgame-panel' : ''}`} aria-label="Game status and playback">
    <div><p className="playback-status" role="status">{title}</p>
      <p className="playback-help">{status === 'defeat' ? 'Playback has stopped. You can inspect the final position and history, or start a new game.'
        : status === 'victory' ? 'All ten countries are under your control. Start a new game whenever you are ready.'
          : 'NPC actions play one at a time. Fast-forward changes the pace, not the record.'}</p></div>
    {(status === 'npc' || status === 'human') && <div className="playback-options">
      <label className="action-field">NPC playback speed<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
        <option value="1">1× · Normal</option><option value="2">2× · Fast</option><option value="4">4× · Fast-forward</option>
      </select></label>
      <button className="secondary-button" disabled={status !== 'npc'} onClick={() => setPaused(!paused)}>{paused ? 'Resume NPC playback' : 'Pause NPC playback'}</button>
    </div>}
    {error && <div className="game-error" role="alert"><p>{error}</p><button type="button" className="text-button" onClick={clearError}>Dismiss error</button></div>}
  </section>;
}
