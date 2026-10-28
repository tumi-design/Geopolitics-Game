import { useState } from 'react';
import { createInitialGame } from './engine/gameState.js';
import { countries, getCountryMetadata } from './data/countries.js';
import GameSetup from './components/GameSetup.jsx';
import CountryList from './components/CountryList.jsx';
import CountryDetails from './components/CountryDetails.jsx';
import WorldMap from './components/WorldMap.jsx';
import './App.css';

export default function App() {
  const [game, setGame] = useState(null);
  const [settingUp, setSettingUp] = useState(true);
  const [startingId, setStartingId] = useState('710');
  const [inspectedId, setInspectedId] = useState('710');
  const [error, setError] = useState('');
  const displayedGame = settingUp ? null : game;
  const selectedId = settingUp ? startingId : inspectedId;
  const displayedCountries = displayedGame?.countries ?? countries;
  const selectedCountry = displayedCountries.find((country) => country.id === selectedId);
  const owner = displayedGame?.players.find((player) => player.id === selectedCountry?.ownerId);
  const activePlayer = displayedGame?.players.find((player) => player.id === displayedGame.currentPlayerId);

  function selectCountry(id) {
    if (settingUp) setStartingId(id);
    else setInspectedId(id);
  }
  function createGame() {
    try {
      const next = createInitialGame(countries, startingId);
      setGame(next);
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
        {displayedGame && <button type="button" className="secondary-button" onClick={() => setSettingUp(true)}>New game <span aria-hidden="true">↗</span></button>}
      </div>
      <div className="overview-strip" aria-live="polite">
        <div><span className="strip-label">{displayedGame ? 'ROUND' : 'GAMEPLAY'}</span><strong>{displayedGame ? String(game.round).padStart(2, '0') : 'Single player'}</strong></div>
        <div><span className="strip-label">{displayedGame ? 'ACTIVE PLAYER' : 'THE WORLD'}</span><strong>{activePlayer?.name ?? '10 countries'}</strong></div>
        <div><span className="strip-label">{displayedGame ? 'YOUR COUNTRY' : 'OPPONENTS'}</span><strong>{displayedGame ? game.countries.find((country) => country.ownerId === 'human-player')?.name : '9 strategic NPCs'}</strong></div>
        <span className="milestone-label">{displayedGame ? 'Viewing only · turn controls coming later' : 'Setup & exploration'}</span>
      </div>
      <div className="workspace">
        {settingUp ? <GameSetup selectedId={startingId} onSelect={selectCountry} onCreate={createGame} error={error}
          onCancel={game ? () => setSettingUp(false) : null} />
          : <section className="panel roster-panel" aria-labelledby="roster-title">
            <div className="panel-heading"><span className="eyebrow">01 / PARTICIPANTS</span>
              <h2 id="roster-title">Countries in play <span className="count-badge">10</span></h2><p>Select a country to explore its profile.</p></div>
            <CountryList countries={game.countries} selectedId={inspectedId} onSelect={selectCountry} game={game} />
          </section>}
        <WorldMap countries={displayedCountries} selectedId={selectedId} onSelect={selectCountry} game={displayedGame} />
        <CountryDetails country={selectedCountry} metadata={getCountryMetadata(selectedId)} owner={owner} game={displayedGame} />
      </div>
      <div className="development-note"><span className="note-icon" aria-hidden="true">i</span><p><strong>Development data.</strong> The 31-country catalogue uses placeholder populations of 10 million for every country. Real population data will be verified before gameplay release.</p></div>
    </main>
    <footer className="site-footer"><span>UCT INF4001N <span className="footer-divider">/</span> BCOM HONS IS 2027</span><span>Explore thoughtfully. Think globally.</span></footer>
  </div>;
}
