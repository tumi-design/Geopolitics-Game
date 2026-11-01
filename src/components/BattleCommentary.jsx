const messages = {
  'setup-required': 'Server setup is required before Gemini commentary is available.',
  'daily-limit': 'The commentary allowance for today has been reached.',
  'request-limit': 'Commentary is paused briefly to protect the API allowance.',
  'retry-later': 'Please wait before retrying commentary.',
  'sign-in-required': 'Sign in as the game owner to request commentary.',
  'access-denied': 'Only the game owner can request commentary.',
  'output-rejected': 'Gemini’s response could not be verified. No commentary was saved. You can retry later.',
  'provider-limit': 'Gemini’s current rate limit has been reached. Gameplay can continue.',
};

export default function BattleCommentary({ commentary, owner, compact = false }) {
  const { entry, requesting, error, canRetry, request, expired } = commentary;
  if (entry?.state === 'ready') return <aside className="battle-commentary" aria-label="Gemini battle commentary">
    <span className="eyebrow">GEMINI COMMENTARY</span><p>{entry.text}</p>
    {!compact && <span className="fine-print">AI-generated · {entry.model} · game results above remain authoritative</span>}
  </aside>;
  if (compact) return null;
  const pending = requesting || entry?.state === 'requesting' || (entry?.state === 'pending' && !expired);
  return <aside className="battle-commentary" aria-label="Battle commentary status">
    <span className="eyebrow">BATTLE COMMENTARY</span>
    <p role="status">{pending ? 'Gemini commentary is being prepared. Gameplay continues normally.'
      : error ? 'Saved commentary is temporarily unavailable.'
        : entry ? messages[entry.code] ?? 'Gemini commentary is unavailable. The battle result is unchanged.'
          : owner ? 'Commentary focuses on completed battles. Faster playback limits automatic requests.' : 'No saved Gemini commentary for this battle yet.'}</p>
    {owner && !pending && !error && <button className="text-button" type="button" disabled={Boolean(entry) && !canRetry}
      onClick={() => { void request(Boolean(entry)); }}>{entry ? 'Retry commentary' : 'Generate commentary'}</button>}
    {owner && entry?.retryAfter > 0 && entry?.state !== 'ready' && <p className="fine-print">Retry after {new Date(entry.retryAfter).toLocaleTimeString()}. At most two generation attempts per event.</p>}
  </aside>;
}
