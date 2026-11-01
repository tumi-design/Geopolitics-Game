import { useState } from 'react';

export default function SaveStatus({ session, owner }) {
  const [copied, setCopied] = useState(false);
  const link = new URL(window.location.href);
  link.searchParams.set('game', session.id);
  async function copyLink() {
    try { await navigator.clipboard.writeText(link.href); setCopied(true); }
    catch { setCopied(false); }
  }
  return <section className="panel save-status" aria-label="Cloud save and sharing">
    <p role="status">{session.loading ? 'Loading the complete saved game…'
      : session.busy ? 'Saving to Firestore…'
        : session.pending ? 'Save needs attention. Gameplay is paused.'
          : session.fromCache ? 'Connection unavailable. Viewing the last received position; moves are disabled until reconnected.'
            : owner ? 'Saved to Firestore. Each action is saved automatically.' : 'Spectator view · live updates · moves are disabled.'}</p>
    {session.error && <div role="alert" className="game-error"><p>{session.error}</p>
      {!session.pending && session.game && <button className="text-button" onClick={session.clearError}>Dismiss error</button>}
      {session.pending && <button className="secondary-button" disabled={session.busy} onClick={session.retrySave}>Retry the same save</button>}
      <button className="text-button" disabled={session.busy} onClick={() => {
        if (!session.pending || window.confirm('Discard the unconfirmed local action and reload the saved position?')) session.reloadSaved();
      }}>Reload saved position</button></div>}
    {owner && session.metadata && <div className="sharing-controls">
      <label><input type="checkbox" checked={session.metadata.isShared} disabled={!session.canEdit} onChange={(event) => { setCopied(false); void session.setSharing(event.target.checked); }} /> Allow spectators with this link</label>
      {session.metadata.isShared && <div className="share-link"><label className="action-field">Spectator link<input readOnly value={link.href} onFocus={(event) => event.target.select()} /></label>
        <button className="secondary-button" onClick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button></div>}
      <p className="fine-print">Games are private by default. Turning sharing off revokes future access; it cannot retract copies already viewed.</p>
    </div>}
  </section>;
}
