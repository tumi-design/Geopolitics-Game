import Flag from './Flag.jsx';
import { getStartingSoldiers } from '../engine/gameRules.js';

export default function CountryDetails({ country, metadata, owner, game }) {
  if (!country || !metadata) return <aside className="panel detail-panel"><h2>Country details</h2><p>Select a country on the map or in the list.</p></aside>;
  return <aside className="panel detail-panel" aria-labelledby="details-title">
    <span className="eyebrow">COUNTRY PROFILE</span>
    <div className="profile-heading"><Flag code={metadata.code} large /><span className="country-code">{metadata.code}</span></div>
    <div aria-live="polite"><h2 id="details-title">{country.name}</h2><p className="region-name">{metadata.region}</p></div>
    <span className={`ownership-badge ${!game || owner?.isHuman ? 'human-badge' : ''}`}>
      <span className={`legend-dot ${owner && !owner.isHuman ? 'npc-dot' : 'human-dot'}`} />
      {game ? owner?.isHuman ? 'Your country' : 'NPC controlled' : 'Your starting country'}
    </span>
    <dl className="country-facts">
      <div><dt>{game ? 'Owner' : 'Prospective owner'}</dt><dd>{owner?.name ?? 'You'}</dd></div>
      <div><dt>{game ? 'Soldiers' : 'Starting soldiers'}</dt><dd className="large-number">{country.soldiers ?? getStartingSoldiers(country.population)}</dd></div>
      <div><dt>Population <span className="fixture-tag">{metadata.populationYear}</span></dt><dd>{country.population.toLocaleString('en-ZA')}</dd></div>
    </dl>
    <p className="data-disclaimer"><a href={metadata.populationSourceUrl} target="_blank" rel="noreferrer">Worldometer · {metadata.populationYear}</a> annual population estimate. Starting soldiers follow the UCT population thresholds.</p>
    <div className="profile-note"><span className="eyebrow">THE BIGGER PICTURE</span><p>Every country is within reach. Geography does not restrict attacks.</p></div>
  </aside>;
}
