
import { getStartingSoldiers } from "./gameRules.js";

const COUNTRY_COUNT = 10;

function getRandomValue(random) {
  const value = random();

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value >= 1
  ) {
    throw new RangeError(
      "Random source must return a value from 0 to less than 1."
    );
  }

  return value;
}

/**
 * Return a randomly shuffled copy without modifying the original.
 */
function shuffle(items, random) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(getRandomValue(random) * (i + 1));

    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/**
 * Validate the country catalogue before starting a game.
 */
function validateCountryCatalogue(countries) {
  if (!Array.isArray(countries) || countries.length < COUNTRY_COUNT) {
    throw new RangeError(
      `The country catalogue must contain at least ${COUNTRY_COUNT} countries.`
    );
  }

  const ids = new Set();

  for (const country of countries) {
    if (
      !country ||
      typeof country.id !== "string" ||
      country.id.trim() === "" ||
      typeof country.name !== "string" ||
      country.name.trim() === "" ||
      !Number.isSafeInteger(country.population) ||
      country.population < 1
    ) {
      throw new TypeError(
        "Every country needs a valid ID, name, and positive integer population."
      );
    }

    if (ids.has(country.id)) {
      throw new RangeError(
        `Duplicate country ID: ${country.id}`
      );
    }

    ids.add(country.id);
  }
}

/**
 * Creates a new game with one human player and nine NPCs.
 *
 * Human player's selected country is retained.
 * Nine other countries are randomly selected.
 * Every country initially belongs to one player.
 */
export function createInitialGame(
  countryCatalogue,
  selectedCountryId,
  random = Math.random
) {
  if (typeof random !== "function") {
    throw new TypeError("Random source must be a function.");
  }

  validateCountryCatalogue(countryCatalogue);

  const selectedCountry = countryCatalogue.find(
    (country) => country.id === selectedCountryId
  );

  if (!selectedCountry) {
    throw new RangeError(
      "The selected country does not exist in the country catalogue."
    );
  }

  const otherCountries = countryCatalogue.filter(
    (country) => country.id !== selectedCountryId
  );

  const selectedNPCcountries = shuffle(
    otherCountries,
    random
  ).slice(0, COUNTRY_COUNT - 1);

  const chosenCountries = [
    selectedCountry,
    ...selectedNPCcountries,
  ];

  const players = chosenCountries.map((country, index) => {
    const isHuman = index === 0;

    return {
      id: isHuman ? "human-player" : `npc-${index}`,
      name: isHuman ? "You" : `NPC ${index}`,
      isHuman,
    };
  });

  const gameCountries = chosenCountries.map((country, index) => {
    const originalSoldierValue = getStartingSoldiers(
      country.population
    );

    return {
      id: country.id,
      name: country.name,
      population: country.population,
      originalSoldierValue,
      soldiers: originalSoldierValue,
      ownerId: players[index].id,
    };
  });

  const turnOrder = shuffle(
    players.map((player) => player.id),
    random
  );

  return {
    round: 1,
    turnIndex: 0,
    turnsTakenThisRound: 0,
    currentPlayerId: turnOrder[0],
    turnOrder,
    players,
    countries: gameCountries,
    status: "active",
    winnerId: null,
    attackInProgress: false,
    activeAttack: null,
    attackUsedThisTurn: false,
    pendingReinforcements: 0,
    battleLog: [],
    npcDecisionLog: [],
  };
}
