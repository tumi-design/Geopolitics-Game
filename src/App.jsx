import { useState } from 'react';
import { createInitialGame } from './engine/gameState.js';
import { countries, getCountryMetadata, populationReference } from './data/countries.js';
import GameSetup from './components/GameSetup.jsx';
import CountryList from './components/CountryList.jsx';
import CountryDetails from './components/CountryDetails.jsx';
import WorldMap from './components/WorldMap.jsx';
import TurnControls from './components/TurnControls.jsx';
import PlaybackControls from './components/PlaybackControls.jsx';
import GameActivity from './components/GameActivity.jsx';
import useGameSession from './hooks/useGameSession.js';
import useAuth from './hooks/useAuth.js';
import AccountPanel from './components/AccountPanel.jsx';
import SavedGames from './components/SavedGames.jsx';
import SaveStatus from './components/SaveStatus.jsx';
import { getSessionStatus } from './game/gameSession.js';
import './App.css';
import './components/gameplay.css';
import './components/account.css';

export default function App() {
  const [settingUp, setSettingUp] = useState(() => !new URLSearchParams(window.location.search).has('game'));
  const account = useAuth();
  const session = useGameSession(!settingUp, account);
  const { game } = session;
  const [startingId, setStartingId] = useState('710');
  const [inspectedId, setInspectedId] = useState('710');
  const [error, setError] = useState('');
  const displayedGame = settingUp ? null : game;
  const selectedId = settingUp || !game ? startingId : game.countries.some((country) => country.id === inspectedId) ? inspectedId : game.countries[0].id;
  const displayedCountries = displayedGame?.countries ?? countries;
  const selectedCountry = displayedCountries.find((country) => country.id === selectedId);
  const owner = displayedGame?.players.find((player) => player.id === selectedCountry?.ownerId);
  const activePlayer = displayedGame?.players.find((player) => player.id === displayedGame.currentPlayerId);
  const status = getSessionStatus(game);

  function selectCountry(id) {
    if (settingUp || !game) setStartingId(id);
    else setInspectedId(id);
  }
  async function createGame() {
    try {
      const next = createInitialGame(countries, startingId);
      await session.create(next);
      setInspectedId(startingId);
      setSettingUp(false);
      setError('');
    } catch (failure) {
      setError(`Could not create the game: ${failure.message}`);
    }
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="site-header">
      <div className="brand"><span className="brand-symbol" aria-hidden="true">◎</span><div>GEOPOLITICS<span>TEN NATIONS. ONE VICTOR.</span></div></div>
      <div className="header-location"><span className="header-dot" />WORLD OVERVIEW</div>
      <span className="preview-label">DESIGN PREVIEW <span>01</span></span>
    </header>
    <main id="main-content">
      <div className="page-intro">
        <div><span className="eyebrow">TEN COUNTRIES. ONE WORLD.</span>
          <h1>{displayedGame ? 'Explore thoughtfully. Think globally.' : 'Choose your perspective.'}</h1>
          <p>{displayedGame ? 'Explore the countries and the people competing for them.' : 'Every journey begins somewhere. Where will yours begin?'}</p>
        </div>
        {displayedGame && account.user && <button type="button" className="secondary-button" disabled={session.busy || session.pending} onClick={() => setSettingUp(true)}>New game <span aria-hidden="true">↗</span></button>}
      </div>
      <AccountPanel key={account.user?.uid ?? 'anonymous'} account={account} saving={session.busy || session.pending} />
      {account.user && <SavedGames session={session} user={account.user} onNew={() => setSettingUp(true)} onOpen={(id) => {
        if (session.select(id)) setSettingUp(false);
      }} />}
      {session.id && !settingUp && <SaveStatus session={session} owner={Boolean(account.user && session.metadata?.ownerUid === account.user.uid)} />}
      <div className="overview-strip" aria-live="polite">
        <div><span className="strip-label">{displayedGame ? 'ROUND' : 'GAMEPLAY'}</span><strong>{displayedGame ? String(game.round).padStart(2, '0') : 'Single player'}</strong></div>
        <div><span className="strip-label">{displayedGame ? 'ACTIVE PLAYER' : 'THE WORLD'}</span><strong>{activePlayer?.name ?? '10 countries'}</strong></div>
        <div><span className="strip-label">{displayedGame ? 'YOUR COUNTRY' : 'OPPONENTS'}</span><strong>{displayedGame ? game.countries.find((country) => country.ownerId === 'human-player')?.name ?? 'Eliminated' : '9 strategic NPCs'}</strong></div>
        <span className="milestone-label">{displayedGame ? session.metadata?.ownerUid === account.user?.uid ? 'Cloud-saved game' : 'Spectator · read only' : 'Setup & exploration'}</span>
      </div>
      <div className="workspace">
        {settingUp || !game ? <GameSetup selectedId={startingId} onSelect={selectCountry} onCreate={createGame} error={error}
          canCreate={Boolean(account.user) && !account.busy && !session.pending} saving={session.busy}
          onCancel={game ? () => setSettingUp(false) : null} />
          : <section className="panel roster-panel" aria-labelledby="roster-title">
            <div className="panel-heading"><span className="eyebrow">01 / PARTICIPANTS</span>
              <h2 id="roster-title">Countries in play <span className="count-badge">10</span></h2><p>Select a country to explore its profile.</p></div>
            <CountryList countries={game.countries} selectedId={inspectedId} onSelect={selectCountry} game={game} />
          </section>}
        <WorldMap countries={displayedCountries} selectedId={selectedId} onSelect={selectCountry} game={displayedGame} />
        <CountryDetails country={selectedCountry} metadata={getCountryMetadata(selectedId)} owner={owner} game={displayedGame} />
      </div>
      {displayedGame && <div className="gameplay-workspace">
        {session.metadata?.ownerUid === account.user?.uid && <><PlaybackControls game={game} status={status} paused={session.paused} setPaused={session.setPaused}
          speed={session.speed} setSpeed={session.setSpeed} error="" clearError={session.clearError} />
        <fieldset className="game-editing-lock" disabled={!session.canEdit} aria-label="Your game actions">
        <TurnControls key={`${game.round}-${game.currentPlayerId}`} game={game} status={status}
          inspectedId={inspectedId} onAction={session.act} />
        </fieldset></>}
        <GameActivity game={game} />
      </div>}
      <div className="development-note"><span className="note-icon" aria-hidden="true">i</span><p><strong>Population reference.</strong> The {countries.length}-country catalogue uses <a href={populationReference.sourceUrl} target="_blank" rel="noreferrer">Worldometer {populationReference.year}</a> annual estimates. Starting soldiers follow the UCT population thresholds.</p></div>
    </main>
    <footer className="site-footer"><span>UCT INF4001N <span className="footer-divider">/</span> BCOM HONS IS 2027</span><span>Explore thoughtfully. Think globally.</span></footer>
  </div>;
}
