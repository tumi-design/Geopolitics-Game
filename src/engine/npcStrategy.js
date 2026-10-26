import {
  allocateReinforcements, transferSoldiers, startAttack,
  rollAttackPhase, stopAttack, completeConquest, skipTurn,
} from "./gameEngine.js";
import { getConquestReward } from "./gameRules.js";

const DEFAULT_MAX_COMBAT_PHASES = 100;
const DEFAULT_MAX_STEPS = 200;

function validateLimit(value, name) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
    throw new RangeError(`${name} must be an integer between 1 and 10000.`);
  }
}

/** Reject invalid boards before planning or running any engine actions. */
function validateNpcTurn(game) {
  if (game.status !== "active" || game.winnerId !== null) {
    throw new Error("NPC actions require an active game.");
  }
  const player = game.players.find((item) => item.id === game.currentPlayerId);
  if (!player || player.isHuman !== false) {
    throw new Error("The current player must be an NPC.");
  }
  const playerIds = new Set(game.players.map((item) => item.id));
  if (
    game.countries.length !== 10 ||
    new Set(game.countries.map((item) => item.id)).size !== 10 ||
    !Number.isSafeInteger(game.round) || game.round < 1 ||
    !Number.isInteger(game.turnIndex) || game.turnIndex < 0 ||
    game.turnIndex >= game.turnOrder.length ||
    game.turnOrder[game.turnIndex] !== player.id ||
    new Set(game.turnOrder).size !== game.turnOrder.length ||
    game.turnOrder.length !== game.players.length ||
    game.turnOrder.some((id) => !playerIds.has(id)) ||
    !Number.isSafeInteger(game.pendingReinforcements) || game.pendingReinforcements < 0 ||
    (game.round === 1 && game.pendingReinforcements !== 0)
  ) {
    throw new Error("The NPC turn has an invalid board or turn state.");
  }
  if (!game.countries.some((item) => item.ownerId === player.id)) {
    throw new Error("An eliminated NPC cannot take a turn.");
  }
  const attack = game.activeAttack;
  if (game.attackInProgress) {
    const source = game.countries.find((item) => item.id === attack?.sourceCountryId);
    const target = game.countries.find((item) => item.id === attack?.targetCountryId);
    if (
      !source || !target || source.ownerId !== player.id ||
      target.ownerId === player.id || target.ownerId !== attack.defenderPlayerId ||
      !["combat", "conquest"].includes(attack.phase) ||
      !Number.isSafeInteger(attack.phaseNumber) || attack.phaseNumber < 0 ||
      !game.attackUsedThisTurn || game.pendingReinforcements !== 0 ||
      (attack.phase === "combat" && source.soldiers < 2) ||
      (attack.phase === "conquest" && target.soldiers !== 0)
    ) throw new Error("The ongoing NPC attack is inconsistent.");
  } else if (attack !== null) {
    throw new Error("An inactive attack must not retain an attack target.");
  }
  for (const country of game.countries) {
    const pendingTarget = game.attackInProgress && attack.phase === "conquest" &&
      country.id === attack.targetCountryId;
    if (
      !playerIds.has(country.ownerId) ||
      !Number.isSafeInteger(country.soldiers) || country.soldiers < (pendingTarget ? 0 : 1) ||
      !Number.isInteger(country.originalSoldierValue) ||
      country.originalSoldierValue < 1 || country.originalSoldierValue > 9
    ) throw new Error("Every country must have valid ownership and soldier values.");
  }
}

// Stable ID ordering resolves equally good choices without using randomness.
function compareIds(first, second) {
  return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
}

function rankTargets(game, enemies) {
  return [...enemies].sort((first, second) => {
    const score = (country) => getConquestReward(country.originalSoldierValue) +
      (game.countries.filter((item) => item.ownerId === country.ownerId).length === 1 ? 4 : 0) -
      country.soldiers;
    return score(second) - score(first) || first.soldiers - second.soldiers || compareIds(first, second);
  });
}

// Start only with at least a 3:2 advantage among soldiers available to fight.
function requiredFighters(target) {
  return Math.ceil(target.soldiers * 1.5);
}

/**
 * Inspect the board and return one explained decision without changing state.
 * Reinforce -> consolidate if useful -> attack/skip -> reassess each phase.
 */
export function chooseNpcDecision(game, { maxCombatPhases = DEFAULT_MAX_COMBAT_PHASES } = {}) {
  validateLimit(maxCombatPhases, "maxCombatPhases");
  validateNpcTurn(game);
  const owned = game.countries.filter((item) => item.ownerId === game.currentPlayerId)
    .sort((a, b) => b.soldiers - a.soldiers || compareIds(a, b));
  const strongest = owned[0];

  if (game.attackInProgress) {
    const attack = game.activeAttack;
    const source = game.countries.find((item) => item.id === attack.sourceCountryId);
    const target = game.countries.find((item) => item.id === attack.targetCountryId);
    if (attack.phase === "conquest") {
      const total = source.soldiers + getConquestReward(target.originalSoldierValue);
      return {
        type: "conquer", soldiers: Math.floor(total / 2),
        reason: `Split the surviving army and reward between ${source.name} and ${target.name} to defend both.`,
      };
    }
    if (attack.phaseNumber >= maxCombatPhases) {
      return { type: "stop", reason: `Stop after ${maxCombatPhases} combat phases to prevent an endless turn.` };
    }
    const fighters = source.soldiers - 1;
    if (fighters < target.soldiers) {
      return { type: "stop", reason: `Stop: ${fighters} available soldiers are outnumbered by ${target.soldiers} defenders.` };
    }
    return { type: "roll", reason: `Continue: ${fighters} available soldiers can match or outnumber ${target.soldiers} defenders.` };
  }

  if (game.pendingReinforcements > 0) {
    return {
      type: "reinforce",
      allocations: [{ countryId: strongest.id, soldiers: game.pendingReinforcements }],
      reason: `Add ${game.pendingReinforcements} soldiers to ${strongest.name}, our strongest country, to build a winning attack force.`,
    };
  }
  if (game.attackUsedThisTurn) {
    return { type: "skip", reason: "Our one attack for this turn has already been used." };
  }
  const enemies = rankTargets(game, game.countries.filter((item) => item.ownerId !== game.currentPlayerId));
  if (enemies.length === 0) throw new Error("A board with no enemies should already be finished.");
  const fighters = strongest.soldiers - 1;
  const target = enemies.find((item) => fighters >= requiredFighters(item));
  if (target) {
    const lastCountry = game.countries.filter((item) => item.ownerId === target.ownerId).length === 1;
    return {
      type: "attack", sourceCountryId: strongest.id, targetCountryId: target.id,
      reason: `Attack ${target.name} from ${strongest.name}: ${fighters} available soldiers against ${target.soldiers} defenders, with a reward of ${getConquestReward(target.originalSoldierValue)}${lastCountry ? " and a chance to eliminate its owner" : ""}.`,
    };
  }

  // Keep two soldiers in donor countries; transfer only if it enables an attack.
  const donors = owned.slice(1).filter((item) => item.soldiers > 2);
  const spareSoldiers = donors.reduce((sum, item) => sum + item.soldiers - 2, 0);
  const possibleTarget = enemies.find((item) => fighters + spareSoldiers >= requiredFighters(item));
  if (possibleTarget && donors.length > 0) {
    const donor = donors[0];
    const soldiers = Math.min(donor.soldiers - 2, requiredFighters(possibleTarget) - fighters);
    return {
      type: "transfer", sourceCountryId: donor.id, targetCountryId: strongest.id, soldiers,
      reason: `Move ${soldiers} soldiers from ${donor.name} to ${strongest.name} to prepare an attack on ${possibleTarget.name}, keeping at least two behind.`,
    };
  }
  return { type: "skip", reason: "No enemy can be attacked with a sufficient strength advantage; preserve soldiers for a later turn." };
}

/** Execute a generated decision through the engine, then log only successful actions. */
export function executeNpcStep(game, { random = Math.random, maxCombatPhases = DEFAULT_MAX_COMBAT_PHASES } = {}) {
  const decision = chooseNpcDecision(game, { maxCombatPhases });
  const playerId = game.currentPlayerId;
  let next;
  switch (decision.type) {
    case "reinforce": next = allocateReinforcements(game, playerId, decision.allocations); break;
    case "transfer": next = transferSoldiers(game, playerId, decision.sourceCountryId, decision.targetCountryId, decision.soldiers); break;
    case "attack": next = startAttack(game, playerId, decision.sourceCountryId, decision.targetCountryId); break;
    case "roll": next = rollAttackPhase(game, playerId, random); break;
    case "stop": next = stopAttack(game, playerId); break;
    case "conquer": next = completeConquest(game, playerId, decision.soldiers); break;
    case "skip": next = skipTurn(game, playerId); break;
    default: throw new Error("Unknown NPC decision.");
  }
  const history = game.npcDecisionLog ?? [];
  return {
    ...next,
    npcDecisionLog: [...history, {
      id: history.length + 1,
      playerId,
      round: game.round,
      turnIndex: game.turnIndex,
      ...decision,
      sourceCountryId: decision.sourceCountryId ?? game.activeAttack?.sourceCountryId ?? null,
      targetCountryId: decision.targetCountryId ?? game.activeAttack?.targetCountryId ?? null,
      // Zero-based slice bounds link each decision to its resulting battle events.
      battleLogStart: game.battleLog.length,
      battleLogEnd: next.battleLog.length,
    }],
  };
}

/**
 * Run only the current NPC's turn, returning when play passes or victory occurs.
 * All changes use new states, so exceptions leave the caller's input untouched.
 * A phase cap stops repeated ties; a step cap also protects preparation actions.
 */
export function simulateNpcTurn(game, {
  random = Math.random,
  maxCombatPhases = DEFAULT_MAX_COMBAT_PHASES,
  maxSteps = DEFAULT_MAX_STEPS,
} = {}) {
  validateNpcTurn(game);
  validateLimit(maxCombatPhases, "maxCombatPhases");
  validateLimit(maxSteps, "maxSteps");
  const playerId = game.currentPlayerId;
  const startingRound = game.round;
  let next = game;
  for (let step = 0; step < maxSteps; step++) {
    next = executeNpcStep(next, { random, maxCombatPhases });
    if (next.status !== "active" || next.currentPlayerId !== playerId || next.round !== startingRound) return next;
  }
  throw new Error("NPC turn exceeded maxSteps; the original game is unchanged.");
}
