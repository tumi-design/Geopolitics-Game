import { useState } from 'react';
import { countries, filterCountries, populationReference } from '../data/countries.js';
import CountryList from './CountryList.jsx';

export default function GameSetup({ selectedId, onSelect, onCreate, onCancel, error }) {
  const [query, setQuery] = useState('');
  const results = filterCountries(countries, query);
  return <section className="panel setup-panel" aria-labelledby="setup-title">
    <div className="panel-heading"><span className="eyebrow">01 / YOUR STARTING POINT</span>
      <h2 id="setup-title">Choose a country</h2>
      <p>One country, chosen by you.<br />Nine opponent countries, chosen at random.</p></div>
    <label className="search-label" htmlFor="country-search">Search countries</label>
    <div className="search-field"><span aria-hidden="true">⌕</span><input id="country-search" type="search"
      value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or region…" autoComplete="off" /></div>
    <p className="result-count" role="status">{results.length} countries · Worldometer {populationReference.year}</p>
    <CountryList countries={results} selectedId={selectedId} onSelect={onSelect} />
    <div className="setup-footer">
      {error && <p className="error-message" role="alert">{error}</p>}
      <button className="primary-button" type="button" onClick={onCreate} disabled={!selectedId}>Create new game <span aria-hidden="true">→</span></button>
      {onCancel && <button className="text-button" type="button" onClick={onCancel}>Return to current game</button>}
      <p className="fine-print">Local preview · games reset on refresh</p>
    </div>
  </section>;
}
