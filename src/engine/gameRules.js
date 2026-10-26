// UCT INF4001N — Core gameplay rules

/**
 * Determines the starting soldiers from a country's population.
 * Thresholds follows the supplied entrance exam case study.
 */
export function getStartingSoldiers(population) {
  if (!Number.isSafeInteger(population) || population < 1) {
    throw new RangeError("Population must be a positive integer.");
  }

  if (population <= 5_000_000) return 1;
  if (population <= 10_000_000) return 2;
  if (population <= 25_000_000) return 3;
  if (population <= 50_000_000) return 4;
  if (population <= 75_000_000) return 5;
  if (population <= 100_000_000) return 6;
  if (population <= 125_000_000) return 7;
  if (population <= 150_000_000) return 8;

  return 9;
}

/**
 * Calculates the soldiers gained after conquering a country.
 * Reward uses that country's original soldier value.
 */
export function getConquestReward(originalSoldierValue) {
  if (
    !Number.isInteger(originalSoldierValue) ||
    originalSoldierValue < 1
  ) {
    throw new RangeError(
      "Original soldier value must be a positive integer."
    );
  }

  return Math.max(2, Math.floor(originalSoldierValue / 2));
}

/**
 * Calculates how many dice each side can roll.
 * Attacker must leave at least one soldier behind.
 */
export function getCombatDiceCount(
  attackingSoldiers,
  defendingSoldiers
) {
  if (
    !Number.isInteger(attackingSoldiers) ||
    attackingSoldiers < 1 ||
    !Number.isInteger(defendingSoldiers) ||
    defendingSoldiers < 1
  ) {
    throw new RangeError(
      "Both countries must have a positive integer number of soldiers."
    );
  }

  if (attackingSoldiers < 2) {
    return 0;
  }

  return Math.min(attackingSoldiers - 1, defendingSoldiers);
}

/**
 * Roll one six-sided die.
 * Optional random function makes testing predictable.
 */
export function rollDie(random = Math.random) {
  if (typeof random !== "function") {
    throw new TypeError("Random source must be a function.");
  }

  const value = random();

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value >= 1
  ) {
    throw new RangeError("Random source must return a value from 0 to <1.");
  }

  return Math.floor(value * 6) + 1;
}

/**
 * Resolves a combat phase using already-rolled dice.
 * Each attacking die is paired with the corresponding
 * defending die. A tie causes no loss.
 */
export function resolveCombatRound(attackerRolls, defenderRolls) {
  if (
    !Array.isArray(attackerRolls) ||
    !Array.isArray(defenderRolls) ||
    attackerRolls.length === 0 ||
    attackerRolls.length !== defenderRolls.length
  ) {
    throw new RangeError(
      "Both sides of the dice must have the same positive number."
    );
  }

  const validRoll = (roll) =>
    Number.isInteger(roll) && roll >= 1 && roll <= 6;

  if (
    // Array.from turns empty positions into undefined, which fails validation.
    !Array.from(attackerRolls).every(validRoll) ||
    !Array.from(defenderRolls).every(validRoll)
  ) {
    throw new RangeError("Every die result must be an integer from 1 to 6.");
  }

  let attackerLosses = 0;
  let defenderLosses = 0;
  let ties = 0;

  const pairResults = attackerRolls.map((attackerRoll, index) => {
    const defenderRoll = defenderRolls[index];

    if (attackerRoll > defenderRoll) {
      defenderLosses++;
      return { attackerRoll, defenderRoll, winner: "attacker" };
    }

    if (attackerRoll < defenderRoll) {
      attackerLosses++;
      return { attackerRoll, defenderRoll, winner: "defender" };
    }

    ties++;
    return { attackerRoll, defenderRoll, winner: "tie" };
  });

  return {
    attackerLosses,
    defenderLosses,
    ties,
    pairResults,
  };
}

/**
 * Execute one complete combat phase.
 */
export function rollCombatRound(
  attackingSoldiers,
  defendingSoldiers,
  random = Math.random
) {
  const diceCount = getCombatDiceCount(
    attackingSoldiers,
    defendingSoldiers
  );

  if (diceCount === 0) {
    throw new RangeError(
      "The attacker needs at least two soldiers to attack."
    );
  }

  const attackerRolls = Array.from(
    { length: diceCount },
    () => rollDie(random)
  );

  const defenderRolls = Array.from(
    { length: diceCount },
    () => rollDie(random)
  );

  return {
    diceCount,
    attackerRolls,
    defenderRolls,
    ...resolveCombatRound(attackerRolls, defenderRolls),
  };
}
