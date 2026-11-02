import {
  collection, doc, query, where, onSnapshot, runTransaction, serverTimestamp,
  getDoc, getDocFromServer, getDocs, limit, writeBatch, deleteDoc,
} from 'firebase/firestore';
import { db } from './firebase.js';
import { SCHEMA_VERSION, splitGame, restoreGame, encodePayload, canEditGame } from './gameStorage.js';

const codedError = (code, message) => Object.assign(new Error(message), { code });

export class GameRepository {
  #database;

  constructor(database) {
    if (!database) throw new TypeError('A Firestore database dependency is required.');
    this.#database = database;
    // Preserve the factory's callback-friendly methods and replaceable test seam.
    for (const name of ['create', 'update', 'watch', 'watchList', 'remove']) {
      this[name] = this[name].bind(this);
    }
  }

  #games() { return collection(this.#database, 'games'); }
  #gameRef(id) { return doc(this.#database, 'games', id); }

  async create(uid, game) {
    if (!uid) throw codedError('permission-denied', 'Sign in to save a game.');
    if (game.battleLog.length || game.npcDecisionLog.length) throw new Error('Create a new game before saving it.');
    const reference = doc(this.#games());
    const data = {
      schemaVersion: SCHEMA_VERSION, ownerUid: uid,
      title: `${game.countries.find((country) => country.ownerId === 'human-player').name} · New game`,
      isShared: false, deleting: false, revision: 0,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastMutationId: crypto.randomUUID(),
      ...splitGame(game),
    };
    await runTransaction(this.#database, async (transaction) => { transaction.set(reference, data); });
    return reference.id;
  }
  async update(id, uid, expectedRevision, mutationId, change) {
    try {
      return await runTransaction(this.#database, async (transaction) => {
      const reference = this.#gameRef(id);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists() || !canEditGame(snapshot.data(), uid)) throw codedError('permission-denied', 'This game cannot be edited by this account.');
      const before = snapshot.data();
      if (before.lastMutationId === mutationId) return before.revision; // retry an uncertain acknowledgement
      if (before.revision !== expectedRevision) throw codedError('conflict', 'A newer saved position exists.');
      let patch;
      if (change.game) {
        const next = splitGame(change.game);
        if (next.battleCount < before.battleCount || next.decisionCount < before.decisionCount) throw new Error('History cannot be shortened.');
        for (const [name, records, oldCount] of [
          ['battles', change.game.battleLog, before.battleCount],
          ['decisions', change.game.npcDecisionLog, before.decisionCount],
        ]) {
          records.slice(oldCount).forEach((record, index) => {
            const seq = oldCount + index + 1;
            if (record.id !== seq) throw new Error('History IDs must be sequential.');
            transaction.set(doc(reference, name, String(seq)), { seq, payload: encodePayload(record) });
          });
        }
        patch = next;
      } else if (typeof change.isShared === 'boolean') patch = { isShared: change.isShared };
      else if (change.deleting === true) patch = { deleting: true, isShared: false };
      else throw new Error('Unknown saved-game change.');
      transaction.update(reference, { ...patch, revision: before.revision + 1, updatedAt: serverTimestamp(), lastMutationId: mutationId });
      return before.revision + 1;
      });
    } catch (failure) {
      // Rules can reject the stale revision before the transaction's own
      // conflict retry. Check the server; never relax the revision rule.
      if (['permission-denied', 'aborted', 'failed-precondition'].includes(failure.code)) {
        let latest;
        try { latest = (await getDocFromServer(this.#gameRef(id))).data(); }
        catch { throw failure; }
        if (canEditGame(latest, uid)) {
          if (latest.lastMutationId === mutationId) return latest.revision;
          if (latest.revision !== expectedRevision) throw codedError('conflict', 'A newer saved position exists.');
        }
      }
      throw failure;
    }
  }
  watchList(uid, onGames, onError) {
    return onSnapshot(query(this.#games(), where('ownerUid', '==', uid)), (snapshot) => {
      onGames(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
        .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0)));
    }, onError);
  }
  watch(id, onGame, onError) {
    let metadata = null;
    let fromCache = true;
    const histories = { battles: null, decisions: null };
    let stopped = false;
    function publish() {
      if (stopped || !metadata || !histories.battles || !histories.decisions) return;
      if (metadata.deleting) { onError(new Error('This game is being deleted.')); return; }
      // Parent and history listeners may arrive in either order. Publish only a
      // complete revision; never run the engine against half a transaction.
      const read = (name, count) => histories[name].filter((record) => record.seq <= count).sort((a, b) => a.seq - b.seq);
      const battles = read('battles', metadata.battleCount);
      const decisions = read('decisions', metadata.decisionCount);
      if (battles.length !== metadata.battleCount || decisions.length !== metadata.decisionCount) return;
      if (battles.some((record, i) => record.seq !== i + 1) || decisions.some((record, i) => record.seq !== i + 1)) {
        onError(new Error('Saved history has missing records.')); return;
      }
      try {
        onGame({ id, metadata, fromCache, game: restoreGame(metadata, battles.map((record) => JSON.parse(record.payload)), decisions.map((record) => JSON.parse(record.payload))) });
      } catch (failure) { onError(failure); }
    }
    const reference = this.#gameRef(id);
    const stops = [onSnapshot(reference, { includeMetadataChanges: true }, (snapshot) => {
      if (!snapshot.exists()) {
        if (!snapshot.metadata.fromCache) onError(new Error('Game not found or no longer available.'));
        return;
      }
      if (snapshot.metadata.hasPendingWrites) return;
      metadata = snapshot.data(); fromCache = snapshot.metadata.fromCache; publish();
    }, onError)];
    for (const name of ['battles', 'decisions']) stops.push(onSnapshot(collection(reference, name), (snapshot) => {
      if (snapshot.metadata.hasPendingWrites) return;
      histories[name] = snapshot.docs.map((entry) => entry.data()); publish();
    }, onError));
    return () => { stopped = true; stops.forEach((stop) => stop()); };
  }
  async remove(id, uid, revision) {
    // Mark first to block other tabs and new moves; a failed deletion can resume.
    const saved = (await getDoc(this.#gameRef(id))).data();
    if (!saved || saved.ownerUid !== uid) throw codedError('permission-denied', 'Only your own games can be deleted.');
    if (!saved.deleting) await this.update(id, uid, revision, crypto.randomUUID(), { deleting: true });
    for (const name of ['battles', 'decisions', 'commentary']) {
      let snapshot;
      do {
        snapshot = await getDocs(query(collection(this.#gameRef(id), name), limit(200)));
        if (snapshot.empty) break;
        const batch = writeBatch(this.#database); snapshot.docs.forEach((entry) => batch.delete(entry.ref)); await batch.commit();
      } while (snapshot.size === 200);
    }
    await deleteDoc(this.#gameRef(id));
  }
}

export function createGameRepository(database) { return new GameRepository(database); }
export const gameRepository = db ? createGameRepository(db) : null;
