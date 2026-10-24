import test from "node:test";
import assert from "node:assert/strict";

import {
  getStartingSoldiers,
  getConquestReward,
  getCombatDiceCount,
  rollDie,
  resolveCombatRound,
  rollCombatRound,
} from "./gameRules.js";

test("population thresholds follow the entrance exam table", () => {
  const cases = [
    [5_000_000, 1],
    [5_000_001, 2],
    [10_000_000, 2],
    [10_000_001, 3],
    [25_000_000, 3],
    [25_000_001, 4],
    [50_000_000, 4],
    [50_000_001, 5],
    [75_000_000, 5],
    [75_000_001, 6],
    [100_000_000, 6],
    [100_000_001, 7],
    [125_000_000, 7],
    [125_000_001, 8],
    [150_000_000, 8],
    [150_000_001, 9],
  ];

  for (const [population, expected] of cases) {
    assert.equal(getStartingSoldiers(population), expected);
  }
});

test("invalid populations are rejected", () => {
  assert.throws(() => getStartingSoldiers(0), RangeError);
  assert.throws(() => getStartingSoldiers(-1), RangeError);
});

test("conquest rewards follow the case study", () => {
  assert.equal(getConquestReward(1), 2);
  assert.equal(getConquestReward(5), 2);
  assert.equal(getConquestReward(6), 3);
  assert.equal(getConquestReward(9), 4);
});

test("combat dice respect the one-soldier reserve", () => {
  assert.equal(getCombatDiceCount(10, 2), 2);
  assert.equal(getCombatDiceCount(3, 5), 2);
  assert.equal(getCombatDiceCount(2, 5), 1);
  assert.equal(getCombatDiceCount(1, 5), 0);
});

test("dice rolls range from one to six", () => {
  assert.equal(rollDie(() => 0), 1);
  assert.equal(rollDie(() => 0.999999), 6);
});

test("combat resolves losses and ties correctly", () => {
  const result = resolveCombatRound([1, 4], [2, 3]);

  assert.equal(result.attackerLosses, 1);
  assert.equal(result.defenderLosses, 1);
  assert.equal(result.ties, 0);
});

test("a tied pair causes no losses", () => {
  const result = resolveCombatRound([4], [4]);

  assert.equal(result.attackerLosses, 0);
  assert.equal(result.defenderLosses, 0);
  assert.equal(result.ties, 1);
});

test("combat cannot start with one attacking soldier", () => {
  assert.throws(() => rollCombatRound(1, 5), RangeError);
});