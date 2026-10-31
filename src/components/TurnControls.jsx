import { useState } from 'react';
import { getConquestReward } from '../engine/gameRules.js';

function CountrySelect({ label, countries, value, onChange }) {
  return <label className="action-field">{label}<select value={value} onChange={(event) => onChange(event.target.value)}>
    {countries.map((country) => <option key={country.id} value={country.id}>{country.name} · {country.soldiers} soldiers</option>)}
  </select></label>;
}

function ReinforcementForm({ game, owned, onAction }) {
  const [amounts, setAmounts] = useState({});
  const total = Object.values(amounts).reduce((sum, amount) => sum + Number(amount), 0);
  return <form className="action-form" onSubmit={(event) => {
    event.preventDefault();
    onAction({ type: 'reinforce', allocations: owned.filter((country) => Number(amounts[country.id]) > 0)
      .map((country) => ({ countryId: country.id, soldiers: Number(amounts[country.id]) })) });
  }}>
    <h3>Place your reinforcements</h3>
    <p>{game.pendingReinforcements} soldiers available. Allocate them before attacking or ending the turn.</p>
    <div className="allocation-fields">{owned.map((country) => <label className="action-field" key={country.id}>{country.name}
      <input type="number" min="0" max={game.pendingReinforcements} step="1" value={amounts[country.id] ?? ''}
        placeholder="0" onChange={(event) => setAmounts({ ...amounts, [country.id]: event.target.value })} /></label>)}</div>
    <p>{total} selected / {game.pendingReinforcements} available</p>
    <button className="primary-button" disabled={total < 1 || total > game.pendingReinforcements}>Allocate soldiers</button>
  </form>;
}

function AttackForm({ owned, enemies, inspectedId, onAction, used }) {
  const [sourceChoice, setSourceChoice] = useState('');
  const [targetChoice, setTargetChoice] = useState('');
  const attackers = owned.filter((country) => country.soldiers >= 2);
  const sourceId = attackers.some((country) => country.id === sourceChoice) ? sourceChoice : attackers[0]?.id ?? '';
  const targetId = enemies.some((country) => country.id === targetChoice) ? targetChoice
    : enemies.find((country) => country.id === inspectedId)?.id ?? enemies[0]?.id ?? '';
  return <form className="action-form" onSubmit={(event) => {
    event.preventDefault(); onAction({ type: 'attack', sourceId, targetId });
  }}>
    <h3>Choose an attack</h3><p>One target per turn. Every enemy country is within reach.</p>
    {attackers.length ? <CountrySelect label="Attacking country" countries={attackers} value={sourceId} onChange={setSourceChoice} />
      : <p>No country has the two soldiers needed to attack.</p>}
    <CountrySelect label="Enemy target" countries={enemies} value={targetId} onChange={setTargetChoice} />
    <button className="primary-button" disabled={!sourceId || !targetId || used}>Start attack</button>
  </form>;
}

function TransferForm({ owned, onAction }) {
  const [sourceId, setSourceId] = useState(owned[0].id);
  const [targetId, setTargetId] = useState(owned[1].id);
  const [amount, setAmount] = useState('1');
  const source = owned.find((country) => country.id === sourceId);
  return <form className="action-form" onSubmit={(event) => {
    event.preventDefault(); onAction({ type: 'transfer', sourceId, targetId, soldiers: Number(amount) });
  }}><h3>Transfer soldiers</h3><p>Move between your countries and leave at least one soldier behind.</p>
    <CountrySelect label="Transfer from" countries={owned} value={sourceId} onChange={setSourceId} />
    <CountrySelect label="Transfer to" countries={owned} value={targetId} onChange={setTargetId} />
    <label className="action-field">Soldiers to move<input type="number" min="1" max={Math.max(1, (source?.soldiers ?? 1) - 1)} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
    <button className="secondary-button" disabled={sourceId === targetId || !source || source.soldiers < 2}>Transfer soldiers</button>
  </form>;
}

function OccupationForm({ game, source, target, onAction }) {
  const [amount, setAmount] = useState('1');
  const reward = getConquestReward(target.originalSoldierValue);
  const maximum = source.soldiers + reward - 1;
  return <form className="action-form occupation-form" onSubmit={(event) => {
    event.preventDefault(); onAction({ type: 'occupy', soldiers: Number(amount) });
  }}><h3>Occupy {target.name}</h3>
    <p>The defenders are defeated. Your conquest reward is {reward} soldiers, added to {source.name} before occupation. Choose 1–{maximum} soldiers to move.</p>
    <label className="action-field">Occupation soldiers<input type="number" min="1" max={maximum} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
    <p>At least one soldier must remain in each country. Completing conquest ends your turn.</p>
    <button className="primary-button">Complete conquest</button>
    <span className="fine-print">Round {game.round} · ownership changes when occupation is confirmed</span>
  </form>;
}

export default function TurnControls({ game, status, inspectedId, onAction }) {
  if (status !== 'human') return null;
  const owned = game.countries.filter((country) => country.ownerId === game.currentPlayerId);
  const enemies = game.countries.filter((country) => country.ownerId !== game.currentPlayerId);
  const source = game.countries.find((country) => country.id === game.activeAttack?.sourceCountryId);
  const target = game.countries.find((country) => country.id === game.activeAttack?.targetCountryId);
  return <section className="panel turn-panel" aria-labelledby="turn-title">
    <div className="panel-heading"><span className="eyebrow">03 / YOUR NEXT MOVE</span><h2 id="turn-title">Your turn</h2></div>
    {game.attackInProgress ? game.activeAttack.phase === 'conquest'
      ? <OccupationForm game={game} source={source} target={target} onAction={onAction} />
      : <div className="action-form"><h3>{source.name} → {target.name}</h3>
        <p>{source.soldiers} attacking soldiers · {target.soldiers} defending soldiers. One attacker always stays behind.</p>
        <div className="action-buttons"><button className="primary-button" onClick={() => onAction({ type: 'roll' })}>Roll combat phase</button>
          <button className="secondary-button" onClick={() => onAction({ type: 'stop' })}>Stop attack & end turn</button></div></div>
      : <>
        {game.pendingReinforcements > 0 && <ReinforcementForm key={game.pendingReinforcements} game={game} owned={owned} onAction={onAction} />}
        <div className="action-columns">
          <fieldset disabled={game.pendingReinforcements > 0}><AttackForm owned={owned} enemies={enemies} inspectedId={inspectedId} onAction={onAction} used={game.attackUsedThisTurn} /></fieldset>
          {owned.length > 1 && <TransferForm owned={owned} onAction={onAction} />}
        </div>
        <div className="turn-footer"><p>Transferring does not end your turn.</p><button className="secondary-button" disabled={game.pendingReinforcements > 0} onClick={() => onAction({ type: 'skip' })}>Skip turn</button></div>
      </>}
  </section>;
}
