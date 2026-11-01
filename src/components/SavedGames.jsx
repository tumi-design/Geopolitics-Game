import { useState } from 'react';

export default function SavedGames({ session, user, onOpen, onNew }) {
  const [confirmId, setConfirmId] = useState(null);
  const disabled = session.busy || session.pending;
  return <section className="panel saved-panel" aria-labelledby="saved-title">
    <div className="saved-heading"><div><span className="eyebrow">YOUR LIBRARY</span><h2 id="saved-title">Saved games <span className="count-badge">{session.games.length}</span></h2></div>
      <button className="secondary-button" disabled={disabled} onClick={onNew}>New game ↗</button></div>
    {!session.games.length && !session.listError && <p>Your saved games will appear here.</p>}
    <ul className="saved-list">{session.games.map((entry) => <li key={entry.id}>
      <button type="button" className="saved-open" disabled={disabled || entry.deleting} aria-current={session.id === entry.id ? 'true' : undefined} onClick={() => onOpen(entry.id)}>
        <strong>{entry.title}</strong><span>{entry.deleting ? 'Deletion incomplete — retry below' : entry.isShared ? 'Shared · spectators can watch' : 'Private · only you'}{entry.updatedAt?.toDate ? ` · ${entry.updatedAt.toDate().toLocaleString()}` : ''}</span>
      </button>
      {confirmId === entry.id ? <div className="delete-confirm"><span>Delete this game and its entire history?</span>
        <button className="text-button" disabled={disabled} onClick={async () => { await session.remove(entry); setConfirmId(null); }}>Confirm deletion</button>
        <button className="text-button" onClick={() => setConfirmId(null)}>Cancel</button></div>
        : <button className="text-button" disabled={disabled || entry.ownerUid !== user.uid} onClick={() => setConfirmId(entry.id)}>Delete{entry.deleting ? ' (retry)' : ''}</button>}
    </li>)}</ul>
    {session.listError && <p role="alert" className="error-message">{session.listError}</p>}
  </section>;
}
