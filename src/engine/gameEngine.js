/**
 * Finish the current player's turn and return a new game state.
 * A player remains in the game while they own at least one country.
 * Keep the original turn order so eliminations do not move round boundaries.
 * Reinforcement allocation will be handled separately in a later step.
 */
export function advanceTurn(game, playerId) {
  if (game.status !== "active" || game.winnerId !== null) {
    throw new Error("Actions are not allowed after the game has ended.");
  }

  if (playerId !== game.currentPlayerId) {
    throw new Error("Only the current player can end their turn.");
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

  const activePlayerIds = new Set(
    game.countries.map((country) => country.ownerId)
  );

  if (!activePlayerIds.has(playerId)) {
    throw new Error("An eliminated player cannot take a turn.");
  }

  // Search at most one full cycle, avoiding an endless loop on invalid state.
  for (let offset = 1; offset <= turnOrder.length; offset++) {
    const nextIndex = (turnIndex + offset) % turnOrder.length;
    if (!activePlayerIds.has(turnOrder[nextIndex])) continue;

    const newRound = turnIndex + offset >= turnOrder.length;
    return {
      ...game,
      turnIndex: nextIndex,
      currentPlayerId: turnOrder[nextIndex],
      round: game.round + (newRound ? 1 : 0),
      turnsTakenThisRound: newRound ? 0 : game.turnsTakenThisRound + 1,
    };
  }

  throw new Error("No active player exists in the turn order.");
}

/** Skip the current turn without changing soldiers or country ownership. */
export function skipTurn(game, playerId) {
  return advanceTurn(game, playerId);
}
