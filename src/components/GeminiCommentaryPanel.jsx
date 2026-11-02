import BattleCommentary from './BattleCommentary.jsx';
import { isCommentaryEvent } from '../game/commentaryEvents.js';

// Reading saved text never requests generation. Only the hook's live-event
// subscription and explicit owner buttons can do that.
export default function GeminiCommentaryPanel({ game, commentary, owner, eventId, selectedId, onSelect }) {
  const history = Object.entries(commentary.entries).sort(([a], [b]) => Number(b) - Number(a));
  const latest = history.find(([, entry]) => entry.state === 'ready');
  const displayedId = selectedId ?? latest?.[0] ?? eventId;
  const saved = commentary.entries[displayedId];
  const event = game.battleLog.find((event) => String(event.id) === String(displayedId));
  const label = (id) => {
    const battle = game.battleLog.find((event) => String(event.id) === String(id));
    const name = (countryId) => game.countries.find((country) => country.id === countryId)?.name ?? countryId;
    return battle ? `#${id} · Round ${battle.round}${battle.type === 'combat_phase' ? ` · Phase ${battle.phaseNumber}` : ''} · ${name(battle.sourceCountryId)} → ${name(battle.targetCountryId)}`
      : `#${id} · Battle details unavailable`;
  };
  const missing = selectedId !== null && !saved;
  // A saved successful reading stays visible even if later battles fail or are
  // still generating. The current request status remains available underneath.
  const reading = saved?.state === 'ready' ? { entry: saved } : commentary;
  const showCurrentStatus = selectedId === null && latest && eventId
    && String(latest[0]) !== String(eventId) && commentary.entry?.state !== 'ready';
  const requestStatus = commentary.requestStatus;
  return <section className="panel commentary-panel" aria-labelledby="commentary-title">
    <div className="panel-heading"><span className="eyebrow">SAVED BATTLE PERSPECTIVES</span><h2 id="commentary-title">Gemini Commentary</h2></div>
    <div className="commentary-content">
      <div className="commentary-navigation">
        <label className="action-field">Commentary history · newest first
          <select value={selectedId ?? ''} onChange={(event) => onSelect(event.target.value || null)}>
            <option value="">Latest saved commentary</option>
            {missing && <option value={selectedId}>{label(selectedId)} · missing</option>}
            {history.map(([id, entry]) => <option key={id} value={id}>{label(id)} · {entry.state === 'ready' ? 'saved' : entry.state}</option>)}
          </select>
        </label>
        <button className="text-button" type="button" disabled={selectedId === null} onClick={() => onSelect(null)}>Return to latest saved commentary</button>
      </div>
      <p className="fine-print">{history.filter(([, entry]) => entry.state === 'ready').length} saved · {selectedId === null ? 'Following latest saved commentary' : 'Selected commentary stays open as play continues'}</p>
      {requestStatus && String(requestStatus.eventId) !== String(displayedId) &&
        ['requesting', 'unavailable'].includes(requestStatus.state) && <p className="fine-print" role="status">
          {requestStatus.state === 'requesting' ? `Preparing sampled commentary for event #${requestStatus.eventId}. Gameplay continues.`
            : requestStatus.code === 'daily-limit' ? 'Automatic commentary unavailable: today’s allowance has been reached. Gameplay continues.'
              : 'A commentary request was unavailable. Existing saved commentary and gameplay remain available.'}
        </p>}
      {commentary.error ? <p role="status">Saved commentary is temporarily unavailable.</p>
        : commentary.loading ? <p role="status">Loading saved commentary…</p>
          : missing ? <p role="status">This saved commentary entry is no longer available. Choose another entry or return to latest.</p>
            : displayedId ? <>
              <p className="fine-print">{label(displayedId)}</p>
              <BattleCommentary commentary={reading} owner={owner && isCommentaryEvent(event)} />
            </> : <p>No saved Gemini commentary yet. Completed battles will appear here when commentary is saved.</p>}
      {!commentary.loading && !commentary.error && showCurrentStatus && <div className="commentary-current">
        <p className="fine-print">Current battle · {label(eventId)}</p>
        <BattleCommentary commentary={commentary} owner={owner} />
      </div>}
    </div>
  </section>;
}
