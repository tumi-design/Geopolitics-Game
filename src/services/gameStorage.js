// Versioned, plain-data encoding. Growing histories live in separate documents.
export const SCHEMA_VERSION = 1;
export function encodePayload(value) {
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).length > 700_000) throw new Error('This game record exceeds the safe Firestore size limit. Nothing was discarded.');
  return json;
}
export function validateRestoredGame(game) {
  if (!game || game.countries?.length !== 10 || game.players?.length !== 10 ||
      game.turnOrder?.length !== 10 || !Array.isArray(game.battleLog) || !Array.isArray(game.npcDecisionLog) ||
      !Number.isSafeInteger(game.round) || game.round < 1 ||
      !Number.isSafeInteger(game.turnsTakenThisRound) || game.turnsTakenThisRound < 0 || game.turnsTakenThisRound >= 10 ||
      !Number.isSafeInteger(game.turnIndex) || game.turnIndex < 0 || game.turnIndex >= 10 ||
      game.turnOrder[game.turnIndex] !== game.currentPlayerId ||
      !['active', 'finished'].includes(game.status) ||
      typeof game.attackInProgress !== 'boolean' || typeof game.attackUsedThisTurn !== 'boolean' ||
      !Number.isSafeInteger(game.pendingReinforcements) || game.pendingReinforcements < 0 ||
      new Set(game.countries.map((country) => country.id)).size !== 10 ||
      new Set(game.players.map((player) => player.id)).size !== 10 ||
      new Set(game.turnOrder).size !== 10) throw new Error('This saved game is incomplete or unsupported. It has not been restarted.');
  const players = new Set(game.players.map((player) => player.id));
  if (game.turnOrder.some((id) => !players.has(id)) || game.players.filter((player) => player.isHuman).length !== 1) throw new Error('Invalid saved players.');
  if ((game.status === 'active' && game.winnerId !== null) ||
      (game.status === 'finished' && (!players.has(game.winnerId) || !game.countries.every((country) => country.ownerId === game.winnerId)))) throw new Error('Invalid saved winner.');
  if ([game.battleLog, game.npcDecisionLog].some((records) => records.some((record, index) => record.id !== index + 1))) throw new Error('Invalid saved history sequence.');
  for (const country of game.countries) {
    const pendingTarget = game.attackInProgress && game.activeAttack?.phase === 'conquest' && game.activeAttack.targetCountryId === country.id;
    if (!players.has(country.ownerId) || !Number.isSafeInteger(country.soldiers) || country.soldiers < (pendingTarget ? 0 : 1) ||
        !Number.isSafeInteger(country.population) || country.population < 1 ||
        !Number.isInteger(country.originalSoldierValue) || country.originalSoldierValue < 1 || country.originalSoldierValue > 9) throw new Error('Invalid saved country.');
  }
  if (game.attackInProgress) {
    const attack = game.activeAttack;
    const source = game.countries.find((country) => country.id === attack?.sourceCountryId);
    const target = game.countries.find((country) => country.id === attack?.targetCountryId);
    if (!source || !target || source.ownerId !== game.currentPlayerId || target.ownerId !== attack.defenderPlayerId ||
        target.ownerId === source.ownerId || !['combat', 'conquest'].includes(attack.phase) ||
        !game.attackUsedThisTurn || game.pendingReinforcements !== 0 ||
        !Number.isSafeInteger(attack.phaseNumber) || attack.phaseNumber < 0 ||
        (attack.phase === 'combat' && source.soldiers < 2) ||
        (attack.phase === 'conquest' && target.soldiers !== 0)) throw new Error('Invalid saved attack.');
  } else if (game.activeAttack !== null) throw new Error('Invalid saved attack state.');
  return game;
}
export function splitGame(game) {
  validateRestoredGame(game);
  const { battleLog, npcDecisionLog, ...core } = game;
  return { core: encodePayload(core), battleCount: battleLog.length, decisionCount: npcDecisionLog.length };
}
export function restoreGame(document, battles, decisions) {
  if (document.schemaVersion !== SCHEMA_VERSION) throw new Error('Unsupported save version.');
  if (battles.length !== document.battleCount || decisions.length !== document.decisionCount) throw new Error('Game history is still loading.');
  return validateRestoredGame({ ...JSON.parse(document.core), battleLog: battles, npcDecisionLog: decisions });
}
export function canEditGame(document, uid) {
  return Boolean(uid && document?.ownerUid === uid && !document.deleting);
}
