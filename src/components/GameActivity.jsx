import { getLiveActivity } from './liveActivity.js';

function countryName(game, id) {
  return game.countries.find((country) => country.id === id)?.name ?? id;
}
function playerName(game, id) {
  return game.players.find((player) => player.id === id)?.name ?? id;
}

function DiceResults({ event, showOutcome = true }) {
  return <div className="dice-results">
    <p>Attacker lost <strong>{event.attackerLosses}</strong> · Defender lost <strong>{event.defenderLosses}</strong> · Ties <strong>{event.ties}</strong></p>
    <ol className="dice-pairs">{event.pairResults.map((pair, index) => <li key={index}>
      <span className="die" aria-label={`Attacker rolled ${pair.attackerRoll}`}>{pair.attackerRoll}</span>
      <span className="dice-versus">vs</span>
      <span className="die defender-die" aria-label={`Defender rolled ${pair.defenderRoll}`}>{pair.defenderRoll}</span>
      <span>{pair.winner === 'tie' ? 'Tie · no loss' : pair.winner === 'attacker' ? 'Defender loses 1' : 'Attacker loses 1'}</span>
    </li>)}</ol>
    <p>Remaining: {event.attackingSoldiers} attackers · {event.defendingSoldiers} defenders.</p>
    {showOutcome && event.outcome === 'attack_failed' && <p>The attacker has one soldier left. The attack and turn have ended.</p>}
    {showOutcome && event.outcome === 'conquest_pending' && <p>The defenders reached zero soldiers in this phase.</p>}
  </div>;
}

function BattleEvent({ game, event }) {
  const source = countryName(game, event.sourceCountryId);
  const target = countryName(game, event.targetCountryId);
  switch (event.type) {
    case 'attack_started': return <p>{source} attacks {target} · {event.attackingSoldiers} against {event.defendingSoldiers} soldiers.</p>;
    case 'combat_phase': return <><p>{source} → {target} · phase {event.phaseNumber}</p><DiceResults event={event} /></>;
    case 'attack_stopped': return <p>Attack on {target} stopped. {source} retains {event.attackingSoldiers} soldiers. Turn ended.</p>;
    case 'country_conquered': return <p>{target} conquered by {playerName(game, event.playerId)}. Reward: {event.reward} soldiers. {event.soldiersTransferred} soldiers occupy {target}; {event.attackingSoldiers} remain in {source}.</p>;
    case 'player_eliminated': return <p>{playerName(game, event.eliminatedPlayerId)} has lost their final country and is eliminated.</p>;
    case 'victory': return <p>{playerName(game, event.winnerId)} controls all ten countries and wins.</p>;
    default: return <p>{event.type}</p>;
  }
}

export default function GameActivity({ game }) {
  const { event, combat, outcomes, decision, decisionIsCurrent } = getLiveActivity(game);
  const decisionTitles = { reinforce: 'Reinforcements allocated', transfer: 'Soldiers transferred', skip: 'Turn skipped' };
  return <>
    <section className="panel live-panel" aria-labelledby="live-title">
      <div className="panel-heading"><span className="eyebrow">04 / AS IT HAPPENS</span><h2 id="live-title">Live activity</h2></div>
      <div className="live-update" aria-live="polite" aria-atomic="true">
        {event ? <>
          <p className="event-context">Round {event.round} · {playerName(game, event.playerId)}{combat ? ` · Phase ${combat.phaseNumber}` : ''}</p>
          <h3 className="live-matchup">{countryName(game, event.sourceCountryId)} <span aria-label="against">→</span> {countryName(game, event.targetCountryId)}</h3>
          {combat && <DiceResults event={combat} showOutcome={false} />}
          <div className="live-outcome">
            {event.type === 'combat_phase' ? <p>{event.outcome === 'conquest_pending' ? 'Defenders defeated. Choose occupation soldiers to complete conquest.'
              : event.outcome === 'attack_failed' ? 'The attacker has one soldier left. The attack and turn have ended.'
                : 'Combat continues. The attacker may roll again or stop.'}</p> : <BattleEvent game={game} event={event} />}
            {outcomes.map((outcome) => <BattleEvent key={outcome.id} game={game} event={outcome} />)}
          </div>
        </> : decisionIsCurrent ? <>
          <p className="event-context">Round {decision.round} · {playerName(game, decision.playerId)}</p>
          <h3 className="live-matchup">{decisionTitles[decision.type] ?? 'NPC action'}</h3>
        </> : <p>No gameplay events yet. Choose a move when your turn arrives.</p>}
        {decision && <div className="latest-decision"><span className="eyebrow">{decisionIsCurrent ? 'NPC DECISION' : 'PREVIOUS NPC DECISION'} · {playerName(game, decision.playerId)}</span><p>{decision.reason}</p></div>}
      </div>
    </section>
    <div className="history-columns">
      <details className="panel history-panel"><summary><span>Battle history <span className="count-badge">{game.battleLog.length}</span></span><span className="history-hint">Expand / collapse</span></summary>
        <p className="history-description">Newest first · every phase is retained</p>
        <ol className="history-list" tabIndex="0" aria-label="Battle history entries">{[...game.battleLog].reverse().map((event) => <li key={event.id}>
          <small>#{event.id} · Round {event.round} · {playerName(game, event.playerId)}</small><BattleEvent game={game} event={event} />
        </li>)}</ol>{!game.battleLog.length && <p className="empty-result">Your battle history will appear here.</p>}
      </details>
      <details className="panel history-panel"><summary><span>NPC decision history <span className="count-badge">{game.npcDecisionLog.length}</span></span><span className="history-hint">Expand / collapse</span></summary>
        <p className="history-description">Newest first · decisions and explanations</p>
        <ol className="history-list" tabIndex="0" aria-label="NPC decision entries">{[...game.npcDecisionLog].reverse().map((decision) => <li key={decision.id}>
          <small>#{decision.id} · Round {decision.round} · {playerName(game, decision.playerId)} · {decision.type}</small><p>{decision.reason}</p>
        </li>)}</ol>{!game.npcDecisionLog.length && <p className="empty-result">Computer decisions will appear one action at a time.</p>}
      </details>
    </div>
  </>;
}
