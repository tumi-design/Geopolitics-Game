import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { createGameRepository } from '../src/services/gameRepository.js';
import { createInitialGame } from '../src/engine/gameState.js';
import { countries } from '../src/data/countries.js';
import { advanceNpcPlayback } from '../src/game/gameSession.js';
import { skipTurn, startAttack, rollAttackPhase } from '../src/engine/gameEngine.js';
import { createFirebaseRest } from '../server/firebaseRest.js';
import { createCommentaryStore } from '../server/commentaryStore.js';
import { createCommentaryHandler } from '../server/commentaryHandler.js';

// A demo project ID prevents these tests from contacting production services.
describe('Firestore rules and complete saved games (local emulator)', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, () => {
  let environment, ownerDb, visitorDb, publicDb, owner, visitor, publicRepository;
  let assertSucceeds, assertFails;
  function game() {
    const state = createInitialGame(countries, '710', () => 0.5);
    state.turnOrder = state.players.map((player) => player.id);
    state.turnIndex = 0; state.currentPlayerId = 'human-player';
    return state;
  }
  function loaded(repository, id, predicate = () => true) {
    return new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      const timer = setTimeout(() => { unsubscribe(); reject(new Error('Saved game listener timed out.')); }, 15_000);
      unsubscribe = repository.watch(id, (value) => {
        if (!value.fromCache && predicate(value)) { clearTimeout(timer); unsubscribe(); resolve(value); }
      }, (error) => { clearTimeout(timer); unsubscribe(); reject(error); });
    });
  }
  before(async () => {
    const testing = await import('@firebase/rules-unit-testing');
    ({ assertSucceeds, assertFails } = testing);
    environment = await testing.initializeTestEnvironment({
      projectId: 'demo-uct-inf4001n',
      firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
    });
    await environment.clearFirestore();
    ownerDb = environment.authenticatedContext('owner').firestore();
    visitorDb = environment.authenticatedContext('visitor').firestore();
    publicDb = environment.unauthenticatedContext().firestore();
    owner = createGameRepository(ownerDb); visitor = createGameRepository(visitorDb); publicRepository = createGameRepository(publicDb);
  });
  after(async () => { await environment?.cleanup(); });

  test('owners can create multiple separate private games and read their complete state', async () => {
    const initial = game();
    const first = await owner.create('owner', initial);
    const second = await owner.create('owner', initial);
    assert.notEqual(first, second);
    assert.deepEqual((await loaded(owner, first)).game, initial);
    await assertFails(getDoc(doc(visitorDb, 'games', first)));
    await assertFails(getDoc(doc(publicDb, 'games', first)));
    await assertFails(getDocs(collection(publicDb, 'games')));
  });
  test('only the owner can edit, share, or delete; ownerUid cannot be reassigned', async () => {
    const id = await owner.create('owner', game());
    const reference = doc(ownerDb, 'games', id);
    await assertFails(updateDoc(reference, { ownerUid: 'visitor', revision: 1, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(visitorDb, 'games', id), { isShared: true }));
    await assertFails(deleteDoc(doc(visitorDb, 'games', id)));
    await assertFails(publicRepository.create('visitor', game()));
    await assert.rejects(visitor.update(id, 'visitor', 0, 'intruder', { game: game() }));
  });
  test('shared games and full histories are public read-only and sharing can be revoked', async () => {
    let state = skipTurn(game(), 'human-player');
    const id = await owner.create('owner', game());
    await owner.update(id, 'owner', 0, 'skip', { game: state });
    state = advanceNpcPlayback(state, () => 0.4);
    await owner.update(id, 'owner', 1, 'npc-step', { game: state });
    await owner.update(id, 'owner', 2, 'share', { isShared: true });
    assert.deepEqual((await loaded(publicRepository, id)).game, state);
    await assertSucceeds(getDocs(collection(publicDb, 'games', id, 'decisions')));
    await assertFails(updateDoc(doc(publicDb, 'games', id), { core: '{}' }));
    await assertFails(setDoc(doc(visitorDb, 'games', id, 'decisions', '999'), { seq: 999, payload: '{}' }));
    await owner.update(id, 'owner', 3, 'unshare', { isShared: false });
    await assertFails(getDoc(doc(publicDb, 'games', id)));
    await assertFails(getDocs(collection(publicDb, 'games', id, 'decisions')));
  });
  test('live spectators receive successive complete revisions rather than a final simulation', async () => {
    const id = await owner.create('owner', game());
    await owner.update(id, 'owner', 0, 'share-live', { isShared: true });
    let state = skipTurn(game(), 'human-player');
    const update = loaded(publicRepository, id, (value) => value.metadata.revision === 2);
    await owner.update(id, 'owner', 1, 'skip-live', { game: state });
    assert.deepEqual((await update).game, state);
    state = advanceNpcPlayback(state, () => 0.4);
    const next = loaded(publicRepository, id, (value) => value.metadata.revision === 3);
    await owner.update(id, 'owner', 2, 'npc-live', { game: state });
    assert.deepEqual((await next).game, state);
  });
  test('concurrent stale saves cannot overwrite newer state; retrying an acknowledged move is idempotent', async () => {
    const initial = game();
    const id = await owner.create('owner', initial);
    const next = skipTurn(initial, 'human-player');
    const results = await Promise.allSettled([
      owner.update(id, 'owner', 0, 'first-tab', { game: next }),
      owner.update(id, 'owner', 0, 'second-tab', { game: next }),
    ]);
    assert.equal(results.filter((entry) => entry.status === 'fulfilled').length, 1);
    assert.equal(results.find((entry) => entry.status === 'rejected').reason.code, 'conflict');
    const token = results[0].status === 'fulfilled' ? 'first-tab' : 'second-tab';
    assert.equal(await owner.update(id, 'owner', 0, token, { game: next }), 1);
    assert.deepEqual((await loaded(owner, id)).game, next);
  });
  test('active attacks, dice phases and pending occupation reload exactly, including zero defenders', async () => {
    const initial = game(); initial.countries[0].soldiers = 4; initial.countries[1].soldiers = 1;
    const id = await owner.create('owner', initial);
    const [source, target] = initial.countries;
    let state = startAttack(initial, 'human-player', source.id, target.id);
    await owner.update(id, 'owner', 0, 'start', { game: state });
    state = (await loaded(owner, id)).game;
    assert.equal(state.activeAttack.phaseNumber, 0);
    let calls = 0;
    state = rollAttackPhase(state, 'human-player', () => calls++ % 2 === 0 ? 0.99 : 0);
    await owner.update(id, 'owner', 1, 'roll', { game: state });
    const restored = await loaded(owner, id);
    assert.deepEqual(restored.game, state);
    assert.equal(restored.game.activeAttack.phase, 'conquest');
    assert.equal(restored.game.battleLog.length, 2);
    await assertFails(updateDoc(doc(ownerDb, 'games', id, 'battles', '1'), { payload: '{}' }));
    await assertFails(deleteDoc(doc(ownerDb, 'games', id, 'battles', '1')));
  });
  test('failed invalid saves preserve the last saved revision and all histories', async () => {
    const initial = game(); const id = await owner.create('owner', initial);
    await assert.rejects(owner.update(id, 'owner', 0, 'invalid', { game: { ...initial, countries: [] } }));
    const saved = await loaded(owner, id);
    assert.deepEqual(saved.game, initial); assert.equal(saved.metadata.revision, 0);
    await assertFails(updateDoc(doc(ownerDb, 'games', id), { revision: 0, updatedAt: serverTimestamp() }));
  });
  test('deleting an owned game removes its history and does not affect other sessions', async () => {
    const initial = game(); const id = await owner.create('owner', initial);
    const other = await owner.create('owner', initial);
    const next = advanceNpcPlayback(skipTurn(initial, 'human-player'), () => 0.4);
    await owner.update(id, 'owner', 0, 'logs', { game: next });
    await owner.remove(id, 'owner', 1);
    await environment.withSecurityRulesDisabled(async (context) => {
      assert.equal((await getDoc(doc(context.firestore(), 'games', id))).exists(), false);
      for (const name of ['battles', 'decisions']) assert.equal((await getDocs(collection(context.firestore(), 'games', id, name))).size, 0);
    });
    assert.deepEqual((await loaded(owner, other)).game, initial);
  });

  test('only the configured commentary writer can write AI records; sharing never grants writes', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'serverConfig', 'commentary'), { writerUid: 'commentary-writer' });
    });
    const initial = game();
    const id = await owner.create('owner', initial);
    const next = startAttack(initial, 'human-player', initial.countries[0].id, initial.countries[1].id);
    await owner.update(id, 'owner', 0, 'commentary-attack', { game: next });
    const record = { eventId: 1, state: 'ready', text: 'Server-generated test fixture.', model: 'test-only', factsHash: 'hash', attempts: 1, createdAt: 1, updatedAt: 1, retryAfter: 1 };
    await assertFails(setDoc(doc(ownerDb, 'games', id, 'commentary', '1'), record));
    await assertFails(setDoc(doc(visitorDb, 'games', id, 'commentary', '1'), record));
    await assertFails(setDoc(doc(ownerDb, 'serverConfig', 'commentary'), { writerUid: 'owner' }));
    await assertFails(getDoc(doc(ownerDb, 'commentaryQuota', 'global')));
    const writer = environment.authenticatedContext('commentary-writer').firestore();
    await assertSucceeds(setDoc(doc(writer, 'games', id, 'commentary', '1'), record));
    await assertFails(updateDoc(doc(writer, 'games', id), { isShared: true }));
    await assertSucceeds(getDoc(doc(ownerDb, 'games', id, 'commentary', '1')));
    await assertFails(getDoc(doc(publicDb, 'games', id, 'commentary', '1')));
    await owner.update(id, 'owner', 1, 'share-commentary', { isShared: true });
    await assertSucceeds(getDoc(doc(publicDb, 'games', id, 'commentary', '1')));
    await assertFails(updateDoc(doc(publicDb, 'games', id, 'commentary', '1'), { text: 'Forged' }));
    await owner.remove(id, 'owner', 2);
    await environment.withSecurityRulesDisabled(async (context) => {
      assert.equal((await getDocs(collection(context.firestore(), 'games', id, 'commentary'))).size, 0);
    });
  });

  test('server REST authentication, atomic quota lease and commentary persistence work end to end', async () => {
    async function signup(label) {
      const email = `${label}-${Date.now()}@example.com`; const password = 'EmulatorOnly123!';
      const result = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
      });
      const user = await result.json(); assert.ok(user.idToken);
      return { ...user, email, password };
    }
    const player = await signup('commentary-owner'); const writer = await signup('server-writer');
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'serverConfig', 'commentary'), { writerUid: writer.localId });
    });
    const ownRepository = createGameRepository(environment.authenticatedContext(player.localId).firestore());
    const initial = game(); const id = await ownRepository.create(player.localId, initial);
    let state = startAttack(initial, 'human-player', initial.countries[0].id, initial.countries[1].id);
    const { stopAttack } = await import('../src/engine/gameEngine.js');
    state = stopAttack(state, 'human-player');
    await ownRepository.update(id, player.localId, 0, 'stop-for-commentary', { game: state });
    const firebase = createFirebaseRest({ FIREBASE_PROJECT_ID: 'demo-uct-inf4001n', FIREBASE_WEB_API_KEY: 'demo-key', COMMENTARY_USE_EMULATORS: 'true',
      COMMENTARY_WRITER_EMAIL: writer.email, COMMENTARY_WRITER_PASSWORD: writer.password, COMMENTARY_WRITER_UID: writer.localId });
    let calls = 0;
    const handler = createCommentaryHandler({ firebase, store: createCommentaryStore(firebase), generate: async () => {
      calls++; return { text: 'Clearly labelled test fixture, not a real Gemini response.', model: 'test-only' };
    } });
    const req = { method: 'POST', headers: { authorization: `Bearer ${player.idToken}`, 'content-type': 'application/json', host: 'localhost' }, body: { gameId: id, eventId: 2 } };
    function response() { return { setHeader() {}, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; } }; }
    const first = response(); await handler(req, first); assert.equal(first.statusCode, 200);
    const duplicate = response(); await handler(req, duplicate); assert.equal(duplicate.statusCode, 200); assert.equal(calls, 1);
    const saved = await getDoc(doc(environment.authenticatedContext(player.localId).firestore(), 'games', id, 'commentary', '2'));
    assert.equal(saved.data().state, 'ready');
    assert.deepEqual((await loaded(ownRepository, id)).game, state);
    const anonymous = response(); await handler({ ...req, headers: {} }, anonymous); assert.equal(anonymous.statusCode, 401);
  });
});
