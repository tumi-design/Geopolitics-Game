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
    };
  }

  throw new Error("No active player exists in the turn order.");
}

/** Skip the current turn without changing soldiers or country ownership. */
export function skipTurn(game, playerId) {
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
