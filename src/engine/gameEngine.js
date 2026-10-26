import { getConquestReward, rollCombatRound } from "./gameRules.js";

/** Shared checks for all player actions. These never modify the game. */
function validateCurrentPlayer(game, playerId) {
  if (game.status !== "active" || game.winnerId !== null) {
    throw new Error("Actions are not allowed after the game has ended.");
  }

  if (playerId !== game.currentPlayerId) {
    throw new Error("Only the current player can perform this action.");
  }

  const { turnOrder, turnIndex } = game;
  if (
    !Number.isInteger(turnIndex) ||
    turnIndex < 0 ||
    turnIndex >= turnOrder.length ||
    turnOrder[turnIndex] !== playerId
  ) {
    throw new Error("The current player and turn order are inconsistent.");
  }

  if (!game.countries.some((country) => country.ownerId === playerId)) {
    throw new Error("An eliminated player cannot take a turn.");
  }
}

/**
 * Finish a turn and prepare the next player's reinforcement balance once.
 * Keep the original turn order so eliminations do not move round boundaries.
 */
export function advanceTurn(game, playerId) {
  validateCurrentPlayer(game, playerId);
  if (game.attackInProgress) {
    throw new Error("Stop the attack or complete conquest before advancing the turn.");
  }
  if (game.pendingReinforcements > 0) {
    throw new Error("Allocate all reinforcements before ending the turn.");
  }

  const { turnOrder, turnIndex } = game;
  const activePlayerIds = new Set(
    game.countries.map((country) => country.ownerId)
  );

  // Search at most one full cycle, avoiding an endless loop on invalid state.
  for (let offset = 1; offset <= turnOrder.length; offset++) {
    const nextIndex = (turnIndex + offset) % turnOrder.length;
    if (!activePlayerIds.has(turnOrder[nextIndex])) continue;

    const newRound = turnIndex + offset >= turnOrder.length;
    const round = game.round + (newRound ? 1 : 0);
    const nextPlayerId = turnOrder[nextIndex];
    const ownedCountryCount = game.countries.filter(
      (country) => country.ownerId === nextPlayerId
    ).length;
    return {
      ...game,
      turnIndex: nextIndex,
      currentPlayerId: nextPlayerId,
      round,
      turnsTakenThisRound: newRound ? 0 : game.turnsTakenThisRound + 1,
      pendingReinforcements: round >= 2 ? ownedCountryCount * 2 : 0,
      attackUsedThisTurn: false,
      activeAttack: null,
      attackInProgress: false,
    };
  }

  throw new Error("No active player exists in the turn order.");
}

/** Skip the current turn without changing soldiers or country ownership. */
export function skipTurn(game, playerId) {
  if (game.attackInProgress) return stopAttack(game, playerId);
  return advanceTurn(game, playerId);
}

/** Find a country and verify ownership before changing any soldiers. */
function getOwnedCountry(game, playerId, countryId) {
  const country = game.countries.find((item) => item.id === countryId);
  if (!country || country.ownerId !== playerId) {
    throw new Error("The country must exist and belong to the current player.");
  }
  return country;
}

function validateSoldierAddition(country, amount) {
  if (
    !Number.isSafeInteger(country.soldiers) ||
    country.soldiers < 1 ||
    !Number.isSafeInteger(country.soldiers + amount)
  ) {
    throw new RangeError("The resulting soldier count must be a safe positive integer.");
  }
}

/**
 * Spend some or all pending soldiers using [{ countryId, soldiers }, ...].
 * Each country may appear once per allocation. Unspent soldiers remain pending.
 */
export function allocateReinforcements(game, playerId, allocations) {
  validateCurrentPlayer(game, playerId);
  if (game.attackInProgress) {
    throw new Error("Reinforcements cannot be allocated during an attack.");
  }
  if (
    game.round < 2 ||
    !Number.isSafeInteger(game.pendingReinforcements) ||
    game.pendingReinforcements < 1
  ) {
    throw new Error("No reinforcements are available to allocate.");
  }
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new TypeError("Provide a non-empty array of reinforcement allocations.");
  }

  const additions = new Map();
  let total = 0;
  for (const allocation of allocations) {
    if (!allocation || !Number.isSafeInteger(allocation.soldiers) || allocation.soldiers < 1) {
      throw new RangeError("Each allocation must contain a positive integer soldier count.");
    }
    const country = getOwnedCountry(game, playerId, allocation.countryId);
    if (additions.has(country.id)) {
      throw new Error("A country may appear only once in an allocation.");
    }
    validateSoldierAddition(country, allocation.soldiers);
    total += allocation.soldiers;
    if (!Number.isSafeInteger(total) || total > game.pendingReinforcements) {
      throw new RangeError("Allocations exceed the available reinforcements.");
    }
    additions.set(country.id, allocation.soldiers);
  }

  return {
    ...game,
    pendingReinforcements: game.pendingReinforcements - total,
    countries: game.countries.map((country) => additions.has(country.id)
      ? { ...country, soldiers: country.soldiers + additions.get(country.id) }
      : country),
  };
}

/** Move soldiers between owned countries without ending the turn. */
export function transferSoldiers(game, playerId, sourceCountryId, targetCountryId, soldiers) {
  validateCurrentPlayer(game, playerId);
  if (game.attackInProgress) {
    throw new Error("Soldiers cannot be transferred during an attack.");
  }
  if (sourceCountryId === targetCountryId) {
    throw new Error("Transfers require two different countries.");
  }
  if (!Number.isSafeInteger(soldiers) || soldiers < 1) {
    throw new RangeError("Transfer a positive integer number of soldiers.");
  }
  const source = getOwnedCountry(game, playerId, sourceCountryId);
  const target = getOwnedCountry(game, playerId, targetCountryId);
  if (!Number.isSafeInteger(source.soldiers) || source.soldiers - soldiers < 1) {
    throw new RangeError("The source country must retain at least one soldier.");
  }
  validateSoldierAddition(target, soldiers);

  return {
    ...game,
    countries: game.countries.map((country) => {
      if (country.id === source.id) return { ...country, soldiers: country.soldiers - soldiers };
      if (country.id === target.id) return { ...country, soldiers: country.soldiers + soldiers };
      return country;
    }),
  };
}

/** Append plain data that can later be displayed or sent for commentary. */
function recordBattleEvent(game, type, details = {}) {
  const event = {
    id: game.battleLog.length + 1,
    type,
    round: game.round,
    playerId: game.currentPlayerId,
    ...game.activeAttack,
    ...details,
  };
  return { ...game, battleLog: [...game.battleLog, event] };
}

function validateCombatSoldiers(country) {
  if (!Number.isSafeInteger(country.soldiers) || country.soldiers < 1) {
    throw new RangeError("Combat requires safe positive integer soldier counts.");
  }
}

/** Select one attacking country and one enemy target. No dice are rolled yet. */
export function startAttack(game, playerId, sourceCountryId, targetCountryId) {
  validateCurrentPlayer(game, playerId);
  if (game.attackInProgress || game.attackUsedThisTurn) {
    throw new Error("Only one attack may be initiated per turn.");
  }
  if (game.pendingReinforcements > 0) {
    throw new Error("Allocate all reinforcements before attacking.");
  }
  const source = getOwnedCountry(game, playerId, sourceCountryId);
  const target = game.countries.find((country) => country.id === targetCountryId);
  if (!target || target.ownerId === playerId) {
    throw new Error("The target must be an enemy country.");
  }
  validateCombatSoldiers(source);
  validateCombatSoldiers(target);
  if (source.soldiers < 2) {
    throw new RangeError("The attacker needs at least two soldiers.");
  }

  return recordBattleEvent({
    ...game,
    attackInProgress: true,
    attackUsedThisTurn: true,
    activeAttack: {
      sourceCountryId,
      targetCountryId,
      defenderPlayerId: target.ownerId,
      phase: "combat",
      phaseNumber: 0,
    },
  }, "attack_started", {
    attackingSoldiers: source.soldiers,
    defendingSoldiers: target.soldiers,
  });
}

function getActiveAttack(game, playerId, expectedPhase) {
  validateCurrentPlayer(game, playerId);
  if (!game.attackInProgress || game.activeAttack?.phase !== expectedPhase) {
    throw new Error(`An attack in the ${expectedPhase} phase is required.`);
  }
  const source = getOwnedCountry(game, playerId, game.activeAttack.sourceCountryId);
  const target = game.countries.find((country) => country.id === game.activeAttack.targetCountryId);
  if (!target || target.ownerId !== game.activeAttack.defenderPlayerId || target.ownerId === playerId) {
    throw new Error("The attack target's ownership is inconsistent.");
  }
  return { source, target };
}

/** Clear attack state, retaining all battle events and soldier changes. */
function clearAttack(game) {
  return { ...game, attackInProgress: false, activeAttack: null };
}

/** Roll exactly one paired-dice phase; the latest event holds its full results. */
export function rollAttackPhase(game, playerId, random = Math.random) {
  const { source, target } = getActiveAttack(game, playerId, "combat");
  validateCombatSoldiers(source);
  validateCombatSoldiers(target);
  const result = rollCombatRound(source.soldiers, target.soldiers, random);
  const attackingSoldiers = source.soldiers - result.attackerLosses;
  const defendingSoldiers = target.soldiers - result.defenderLosses;
  const outcome = defendingSoldiers === 0 ? "conquest_pending"
    : attackingSoldiers === 1 ? "attack_failed" : "continue";

  let next = {
    ...game,
    activeAttack: {
      ...game.activeAttack,
      phase: defendingSoldiers === 0 ? "conquest" : "combat",
      phaseNumber: game.activeAttack.phaseNumber + 1,
    },
    countries: game.countries.map((country) => {
      if (country.id === source.id) return { ...country, soldiers: attackingSoldiers };
      if (country.id === target.id) return { ...country, soldiers: defendingSoldiers };
      return country;
    }),
  };
  next = recordBattleEvent(next, "combat_phase", {
    ...result,
    attackingSoldiersBefore: source.soldiers,
    defendingSoldiersBefore: target.soldiers,
    attackingSoldiers,
    defendingSoldiers,
    outcome,
  });
  if (outcome === "attack_failed") {
    return advanceTurn(clearAttack(next), playerId);
  }
  return next;
}

/** Voluntarily stop rolling, preserve remaining armies, and end the turn. */
export function stopAttack(game, playerId) {
  const { source, target } = getActiveAttack(game, playerId, "combat");
  const next = recordBattleEvent(game, "attack_stopped", {
    attackingSoldiers: source.soldiers,
    defendingSoldiers: target.soldiers,
  });
  return advanceTurn(clearAttack(next), playerId);
}

/**
 * Finalise a defeated target using the player's chosen occupation count.
 * The reward goes to the source first; move 1..(source + reward - 1) soldiers.
 * Until this action succeeds, a zero-defender country is a pending conquest,
 * and no rolling, transfers, skipping, or turn advancement is allowed.
 */
export function completeConquest(game, playerId, soldiersToTransfer) {
  const { source, target } = getActiveAttack(game, playerId, "conquest");
  validateCombatSoldiers(source);
  if (target.soldiers !== 0) {
    throw new Error("Conquest requires a defeated country with zero soldiers.");
  }
  const reward = getConquestReward(target.originalSoldierValue);
  validateSoldierAddition(source, reward);
  const availableSoldiers = source.soldiers + reward;
  if (
    !Number.isSafeInteger(soldiersToTransfer) ||
    soldiersToTransfer < 1 ||
    soldiersToTransfer >= availableSoldiers
  ) {
    throw new RangeError("Occupy the conquered country with at least one soldier and leave one behind.");
  }

  const countries = game.countries.map((country) => {
    if (country.id === source.id) return { ...country, soldiers: availableSoldiers - soldiersToTransfer };
    if (country.id === target.id) return { ...country, ownerId: playerId, soldiers: soldiersToTransfer };
    return country;
  });
  const eliminated = !countries.some((country) => country.ownerId === target.ownerId);
  const victory = countries.length === 10 && countries.every((country) => country.ownerId === playerId);
  let next = recordBattleEvent({ ...game, countries }, "country_conquered", {
    previousOwnerId: target.ownerId,
    originalSoldierValue: target.originalSoldierValue,
    reward,
    soldiersTransferred: soldiersToTransfer,
    attackingSoldiers: availableSoldiers - soldiersToTransfer,
    defendingSoldiers: soldiersToTransfer,
  });
  if (eliminated) next = recordBattleEvent(next, "player_eliminated", { eliminatedPlayerId: target.ownerId });
  if (victory) next = recordBattleEvent(next, "victory", { winnerId: playerId });
  next = clearAttack(next);
  if (victory) return { ...next, status: "finished", winnerId: playerId };
  return advanceTurn(next, playerId);
}
