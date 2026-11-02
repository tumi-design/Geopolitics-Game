import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGame } from '../src/engine/gameState.js';
import { startAttack, rollAttackPhase, completeConquest, stopAttack } from '../src/engine/gameEngine.js';
import { countries } from '../src/data/countries.js';
import { battleFacts, factsHash, requestIdentifiers } from '../server/commentaryFacts.js';
import { validateGeneratedCommentary, generateCommentary, COMMENTARY_MODEL } from '../server/geminiCommentary.js';
import { createCommentaryStore } from '../server/commentaryStore.js';
import { CommentaryError } from '../server/firebaseRest.js';
import { createCommentaryHandler } from '../server/commentaryHandler.js';
import { requestBattleCommentary } from '../src/services/commentaryClient.js';
import { isCommentaryEvent } from '../src/game/commentaryEvents.js';

const gameId = 'a'.repeat(20);
function fixture() {
  const game = createInitialGame(countries, '710', () => 0.5);
  game.turnOrder = game.players.map((player) => player.id); game.turnIndex = 0; game.currentPlayerId = 'human-player';
  game.countries[0].soldiers = 4; game.countries[1].soldiers = 1;
  let next = startAttack(game, 'human-player', game.countries[0].id, game.countries[1].id);
  let calls = 0;
  next = rollAttackPhase(next, 'human-player', () => calls++ % 2 === 0 ? 0.99 : 0);
  return completeConquest(next, 'human-player', 2);
}
function factsFixture() {
  const game = fixture();
  return battleFacts(game, game.battleLog[2], game.battleLog[1]);
}
function memoryFirebase() {
  const documents = new Map(); let revision = 0;
  return {
    documents, writerToken: async () => 'server-token', authenticate: async () => 'owner',
    get: async (path) => structuredClone(documents.get(path) ?? null),
    commit: async (writes) => {
      for (const write of writes) {
        const current = documents.get(write.path);
        if (current?.updateTime !== write.previous?.updateTime) throw new CommentaryError('storage-conflict');
      }
      return { writeResults: writes.map((write) => {
        const updateTime = String(++revision);
        documents.set(write.path, { data: structuredClone(write.data), updateTime });
        return { updateTime };
      }) };
    },
  };
}
function request(body = { gameId, eventId: 3 }, overrides = {}) {
  return { method: 'POST', headers: { authorization: `Bearer ${'t'.repeat(30)}`, 'content-type': 'application/json', host: 'localhost:5173', origin: 'http://localhost:5173' }, body, ...overrides };
}
function response() {
  return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
}
function handlerFixture(generate = async () => ({ text: 'Generated test prose', model: COMMENTARY_MODEL })) {
  const firebase = memoryFirebase(); const game = fixture();
  firebase.documents.set(`games/${gameId}`, { data: { ownerUid: 'owner', deleting: false, battleCount: game.battleLog.length, core: JSON.stringify(game) }, updateTime: '0' });
  for (const event of game.battleLog) firebase.documents.set(`games/${gameId}/battles/${event.id}`, { data: { seq: event.id, payload: JSON.stringify(event) }, updateTime: '0' });
  const store = createCommentaryStore(firebase, () => 1_800_000_000_000);
  return { firebase, store, handler: createCommentaryHandler({ firebase, store, generate }) };
}

test('completed outcomes qualify, pending conquest does not; arbitrary identifiers and browser prompts are rejected', () => {
  const game = fixture();
  assert.equal(isCommentaryEvent(game.battleLog[0]), false);
  assert.equal(isCommentaryEvent(game.battleLog[1]), false);
  assert.equal(isCommentaryEvent(game.battleLog[2]), true);
  for (const body of [{ gameId: '../secret', eventId: 3 }, { gameId, eventId: '3' }, { gameId, eventId: 0 }, { gameId, eventId: 1, prompt: 'invent a win' }]) assert.throws(() => requestIdentifiers(body));
});

function ongoingFixture() {
  const game = createInitialGame(countries, '710', () => 0.5);
  game.turnOrder = game.players.map((player) => player.id); game.turnIndex = 0; game.currentPlayerId = 'human-player';
  game.countries[0].soldiers = 4; game.countries[1].soldiers = 4;
  const attack = startAttack(game, 'human-player', game.countries[0].id, game.countries[1].id);
  let calls = 0;
  const next = rollAttackPhase(attack, 'human-player', () => calls++ < 3 ? 0.99 : 0);
  return { next, event: next.battleLog[1], previous: next.battleLog[0] };
}

test('ongoing facts verify dice, losses, ties, sequence, phase number and surviving armies', () => {
  const { next, event, previous } = ongoingFixture();
  const facts = battleFacts(next, event, event, [], previous);
  assert.equal(facts.outcome, 'ongoing'); assert.equal(facts.phaseNumber, 1);
  assert.equal(facts.phase.defenderLosses, 3); assert.equal(facts.remainingDefenders, 1);
  assert.equal(facts.defenderEliminated, false); assert.equal(facts.gameWon, false);
  for (const patch of [{ phaseNumber: 0 }, { phaseNumber: 2 }, { attackingSoldiers: 1 }, { defendingSoldiers: 0 },
    { attackerLosses: 1 }, { ties: 99 }, { round: 0 }]) {
    const invalid = { ...event, ...patch };
    assert.throws(() => battleFacts(next, invalid, invalid, [], previous));
  }
  assert.throws(() => battleFacts(next, event, event));
  assert.throws(() => battleFacts(next, event, event, [], { ...previous, attackingSoldiers: 99 }));
  assert.throws(() => battleFacts(next, event, event, [{ type: 'victory' }], previous));
});

test('ongoing prose describes uncertainty and rejects final outcome claims', async () => {
  const { next, event, previous } = ongoingFixture();
  const facts = battleFacts(next, event, event, [], previous);
  const prose = '{attacker} may sustain pressure while {defender} could still resist.';
  let sent;
  const result = await generateCommentary(facts, { client: { models: { generateContent: async (value) => {
    sent = value; return { text: JSON.stringify({ factsHash: factsHash(facts), commentary: prose }) };
  } } } });
  assert.ok(result.text.includes(facts.attacker));
  assert.match(sent.config.systemInstruction, /outcome ongoing/);
  for (const word of ['conquered', 'defeated', 'failed', 'eliminated', 'won', 'stopped', 'ended', 'succeeded']) {
    assert.throws(() => validateGeneratedCommentary({ factsHash: factsHash(facts), commentary: `{attacker} ${word} while {defender} could still resist.` }, facts));
  }
});

test('a later meaningful ongoing phase can be generated manually with a verified predecessor', () => {
  const { next, event: previous } = ongoingFixture();
  let rolls = 0;
  const later = rollAttackPhase(next, 'human-player', () => rolls++ % 2 === 0 ? 0 : 0.99);
  const event = later.battleLog.at(-1);
  const facts = battleFacts(later, event, event, [], previous);
  assert.equal(facts.phaseNumber, 2); assert.equal(facts.outcome, 'ongoing');
  assert.equal(facts.remainingAttackers, 3);
});

test('all existing terminal fact hashes remain byte-for-byte compatible', () => {
  assert.equal(factsHash(factsFixture()), 'e581e6019ff0c96fc3ffc41a41059122c21cc517318dd675c6d2530a1c130713');
  const game = createInitialGame(countries, '710', () => 0.5);
  game.turnOrder = game.players.map((player) => player.id); game.turnIndex = 0; game.currentPlayerId = 'human-player';
  game.countries[0].soldiers = 4; game.countries[1].soldiers = 1;
  let state = startAttack(game, 'human-player', game.countries[0].id, game.countries[1].id);
  state = stopAttack(state, 'human-player');
  assert.equal(factsHash(battleFacts(state, state.battleLog.at(-1), null)), 'e8c5720ba09e2c6593edad8fa596c15109bf337dc4f57b55f81feb33d752c5ba');
  game.countries[0].soldiers = 2; game.countries[1].soldiers = 4;
  state = startAttack(game, 'human-player', game.countries[0].id, game.countries[1].id);
  let calls = 0; state = rollAttackPhase(state, 'human-player', () => calls++ % 2 === 0 ? 0 : 0.99);
  assert.equal(factsHash(battleFacts(state, state.battleLog.at(-1), state.battleLog.at(-1))), 'daec7364f52c54d6c2080ee2a04a87832a14e419a9935555c124493259e4b186');
});

test('ongoing endpoint reads its persisted predecessor, rejects invalid sequence and still enforces ownership', async () => {
  const { firebase, handler } = handlerFixture(); const { next, event, previous } = ongoingFixture();
  firebase.documents.set(`games/${gameId}`, { data: { ownerUid: 'owner', battleCount: 2, core: JSON.stringify(next) }, updateTime: '0' });
  for (const record of [previous, event]) firebase.documents.set(`games/${gameId}/battles/${record.id}`, { data: { seq: record.id, payload: JSON.stringify(record) }, updateTime: '0' });
  const first = response(); await handler(request({ gameId, eventId: 2 }), first);
  assert.equal(first.statusCode, 200);
  const cached = response(); await handler(request({ gameId, eventId: 2 }), cached);
  assert.equal(cached.body.text, first.body.text);
  firebase.documents.get(`games/${gameId}/battles/1`).data.payload = JSON.stringify({ ...previous, phaseNumber: 99, type: 'combat_phase' });
  const invalid = response(); await handler(request({ gameId, eventId: 2 }), invalid); assert.equal(invalid.statusCode, 400);
  firebase.authenticate = async () => 'spectator';
  const denied = response(); await handler(request({ gameId, eventId: 2 }), denied); assert.equal(denied.statusCode, 403);
});
test('facts preserve real paired dice, losses, conquest reward and remaining occupation armies', () => {
  const game = fixture(); const event = game.battleLog[2]; const combat = game.battleLog[1];
  const before = structuredClone(game);
  const facts = battleFacts(game, event, combat);
  assert.equal(facts.outcome, 'conquered');
  assert.equal(facts.phase.defenderLosses, 1);
  assert.deepEqual(facts.phase.attackerRolls, combat.attackerRolls);
  assert.equal(facts.remainingAttackers, event.attackingSoldiers);
  assert.equal(facts.occupationSoldiers, event.soldiersTransferred);
  assert.throws(() => battleFacts(game, event, { ...combat, defenderLosses: 100 }), /dice/);
  assert.throws(() => battleFacts(game, { ...event, reward: 999 }, combat), /conquest/);
  assert.deepEqual(game, before);
});
test('stopping without any dice produces no invented phase or casualties', () => {
  const game = fixture();
  let state = { ...game, attackInProgress: false, activeAttack: null, attackUsedThisTurn: false, currentPlayerId: 'human-player', turnIndex: 0, battleLog: [] };
  state = startAttack(state, 'human-player', state.countries[0].id, state.countries[2].id);
  state = stopAttack(state, 'human-player');
  const facts = battleFacts(state, state.battleLog.at(-1), null);
  assert.equal(facts.phase, null); assert.equal(facts.outcome, 'stopped');
  assert.throws(() => validateGeneratedCommentary({ factsHash: factsHash(facts), commentary: '{outcome}; {losses}.' }, facts));
});
test('Gemini prose is grounded with exact fact placeholders and rejects hallucinated quantities and outcomes', () => {
  const facts = factsFixture(); const hash = factsHash(facts);
  const result = validateGeneratedCommentary({ factsHash: hash, commentary: '{attacker} could use its foothold in {defender} to support further pressure.' }, facts);
  assert.ok(result.includes(facts.attacker)); assert.ok(result.includes(facts.defender));
  for (const commentary of ['Lost 99 soldiers: {outcome}.', 'Lost nine soldiers: {outcome}.', '{unknown} {outcome}', 'A victory was assured.', '<script>{outcome}</script>']) assert.throws(() => validateGeneratedCommentary({ factsHash: hash, commentary }, facts));
  assert.throws(() => validateGeneratedCommentary({ factsHash: 'wrong', commentary: '{outcome}' }, facts));
  const stopped = { ...facts, outcome: 'stopped' };
  assert.throws(() => validateGeneratedCommentary({ factsHash: factsHash(stopped), commentary: '{attacker} conquered the continent; {outcome}.' }, stopped));
});
test('official SDK generation uses the selected model, bounded output and no provider retries', async () => {
  const facts = factsFixture(); let sent;
  const client = { models: { generateContent: async (value) => { sent = value; return { text: JSON.stringify({ factsHash: factsHash(facts), commentary: '{attacker} could gain strategic flexibility in {defender}.' }) }; } } };
  const result = await generateCommentary(facts, { client });
  assert.equal(sent.model, COMMENTARY_MODEL);
  assert.equal(sent.config.httpOptions.retryOptions.attempts, 1);
  assert.equal(sent.config.httpOptions.timeout, 15_000);
  assert.equal(result.model, COMMENTARY_MODEL);
  assert.deepEqual(JSON.parse(sent.contents).facts, facts);
});
test('durable event claims deduplicate concurrent instances and cache ready commentary', async () => {
  const firebase = memoryFirebase(); const store = createCommentaryStore(firebase, () => 1_800_000_000_000);
  const args = { gameId, eventId: 3, uid: 'owner', hash: 'hash', retry: false };
  const results = await Promise.all([store.claim(args), store.claim(args)]);
  assert.equal(results.filter((entry) => entry.cached?.state === 'pending').length, 1);
  await store.finish(results.find((entry) => !entry.cached), { text: 'Original prose', model: COMMENTARY_MODEL });
  assert.equal((await store.claim(args)).cached.text, 'Original prose');
  assert.equal(firebase.documents.get('commentaryQuota/global').data.dayCount, 1);
});
test('limits survive new store instances; failed events require explicit cooldown and bounded retries', async () => {
  let now = 1_800_000_000_000; const firebase = memoryFirebase();
  const store = createCommentaryStore(firebase, () => now);
  const args = { gameId, eventId: 3, uid: 'owner', hash: 'hash' };
  const lease = await store.claim(args); await store.finish(lease);
  await assert.rejects(store.claim(args), /unavailable/);
  await assert.rejects(store.claim({ ...args, retry: true }), /retry-later/);
  now += 61_000;
  const second = await createCommentaryStore(firebase, () => now).claim({ ...args, retry: true });
  await store.finish(second); now += 61_000;
  await assert.rejects(store.claim({ ...args, retry: true }), /unavailable/);
  firebase.documents.get('commentaryQuota/global').data.minute = Math.floor(now / 60_000);
  firebase.documents.get('commentaryQuota/global').data.minuteCount = 2;
  await assert.rejects(store.claim({ ...args, eventId: 4 }), /request-limit/);
});
test('HTTP handler authenticates ownership and ignores all client battle facts', async () => {
  let calls = 0; const { handler } = handlerFixture(async () => { calls++; return { text: 'Generated', model: COMMENTARY_MODEL }; });
  for (const req of [request(undefined, { method: 'GET' }), request(undefined, { headers: {} }), request({ gameId, eventId: 3, casualties: 999 })]) {
    const res = response(); await handler(req, res); assert.ok(res.statusCode >= 400);
  }
  assert.equal(calls, 0);
  const bad = handlerFixture(); bad.firebase.authenticate = async () => 'visitor';
  const denied = response(); await bad.handler(request(), denied); assert.equal(denied.statusCode, 403);
  const res = response(); await handler(request(), res); assert.equal(res.statusCode, 200); assert.equal(calls, 1);
  const cached = response(); await handler(request(), cached); assert.equal(calls, 1); assert.equal(cached.body.text, 'Generated');
});
test('provider failure and persistence failure never alter the game or disclose provider errors', async () => {
  const { handler, firebase } = handlerFixture(async () => { throw new Error('private provider diagnostics must never be returned'); });
  const before = structuredClone(firebase.documents.get(`games/${gameId}`));
  const res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 503); assert.equal(res.body.code, 'commentary-unavailable');
  assert.ok(!JSON.stringify(res.body).includes('diagnostics'));
  assert.deepEqual(firebase.documents.get(`games/${gameId}`), before);
  assert.equal(firebase.documents.get(`games/${gameId}/commentary/3`).data.state, 'failed');
});
test('browser transport deduplicates requests and contains only an owner token and event identifiers', async () => {
  let calls = 0; let sent;
  const user = { uid: 'owner', getIdToken: async () => 'firebase-user-token' };
  const fetcher = async (url, options) => { calls++; sent = { url, options }; return { ok: true, json: async () => ({ eventId: 3, state: 'ready', text: 'Generated' }) }; };
  const [first, second] = await Promise.all([requestBattleCommentary(user, gameId, 3, false, fetcher), requestBattleCommentary(user, gameId, 3, false, fetcher)]);
  assert.deepEqual(first, second); assert.equal(calls, 1);
  assert.equal(sent.url, '/api/battle-commentary'); assert.deepEqual(JSON.parse(sent.options.body), { gameId, eventId: 3, retry: false });
  const failed = await requestBattleCommentary(user, gameId, 4, false, async () => { throw new Error('offline'); });
  assert.equal(failed.state, 'unavailable');
});

test('a failed persistence acknowledgement keeps the lease and never regenerates automatically', async () => {
  let calls = 0;
  const { handler, firebase } = handlerFixture(async () => { calls++; return { text: 'Generated test fixture', model: COMMENTARY_MODEL }; });
  const originalCommit = firebase.commit;
  let writes = 0;
  firebase.commit = async (batch) => {
    if (++writes === 2) throw new CommentaryError('storage-unavailable');
    return originalCommit(batch);
  };
  const failed = response(); await handler(request(), failed); assert.equal(failed.statusCode, 503);
  assert.equal(firebase.documents.get(`games/${gameId}/commentary/3`).data.state, 'pending');
  const duplicate = response(); await handler(request(), duplicate);
  assert.equal(duplicate.statusCode, 202); assert.equal(calls, 1);
});
test('global and owner daily caps are durable and reset on a new UTC day', async () => {
  let now = 1_800_000_000_000; const firebase = memoryFirebase();
  const day = new Date(now).toISOString().slice(0, 10); const minute = Math.floor(now / 60_000);
  firebase.documents.set('commentaryQuota/global', { data: { day, dayCount: 20, minute, minuteCount: 0 }, updateTime: '1' });
  const args = { gameId, eventId: 3, uid: 'owner', hash: 'hash' };
  await assert.rejects(createCommentaryStore(firebase, () => now).claim(args), /daily-limit/);
  firebase.documents.get('commentaryQuota/global').data.dayCount = 0;
  firebase.documents.set('commentaryQuota/owner', { data: { day, dayCount: 8, minute, minuteCount: 0 }, updateTime: '2' });
  await assert.rejects(createCommentaryStore(firebase, () => now).claim(args), /daily-limit/);
  now += 86_400_000;
  await createCommentaryStore(firebase, () => now).claim(args);
  assert.equal(firebase.documents.get('commentaryQuota/global').data.dayCount, 1);
});
