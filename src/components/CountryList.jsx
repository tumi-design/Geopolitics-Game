import Flag from './Flag.jsx';
import { getCountryMetadata } from '../data/countries.js';

export default function CountryList({ countries, selectedId, onSelect, game = null }) {
  if (!countries.length) return <p className="empty-result" role="status">No countries found. Try a name or region.</p>;
  return <ul className={`country-list ${game ? 'roster' : 'catalogue'}`}>
    {countries.map((country) => {
      const metadata = getCountryMetadata(country.id);
      const owner = game?.players.find((player) => player.id === country.ownerId);
      return <li key={country.id}>
        <button type="button" className={`country-row ${selectedId === country.id ? 'selected' : ''}`}
          aria-pressed={selectedId === country.id} onClick={() => onSelect(country.id)}>
          <Flag code={metadata.code} />
          <span className="country-row-copy"><strong>{country.name}</strong>
            <small>{game ? owner?.name : metadata.region}{owner?.isHuman ? ' · Your country' : ''}</small></span>
          {game ? <span className="soldier-count" aria-label={`${country.soldiers} soldiers`}>{country.soldiers}<small>soldiers</small></span>
            : <span className="row-arrow" aria-hidden="true">↗</span>}
        </button>
      </li>;
    })}
  </ul>;
}
