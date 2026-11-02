import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRepository, createGameRepository, gameRepository } from './gameRepository.js';

const methods = ['create', 'update', 'watch', 'watchList', 'remove'];

test('repository requires an injected database before exposing operations', () => {
  for (const missing of [undefined, null, false]) {
    assert.throws(() => new GameRepository(missing), { name: 'TypeError', message: /database dependency is required/ });
    assert.throws(() => createGameRepository(missing), TypeError);
  }
});

test('factory preserves the public repository interface and singleton contract', () => {
  const repository = createGameRepository({});
  assert.ok(repository instanceof GameRepository);
  for (const name of methods) assert.equal(typeof repository[name], 'function');
  assert.ok(gameRepository === null || gameRepository instanceof GameRepository);
});

test('database and reference helpers are private, not public object properties', () => {
  const database = Object.freeze({ marker: 'injected-test-dependency' });
  const repository = new GameRepository(database);
  for (const name of ['database', 'games', 'gameRef', '#database', '#games', '#gameRef']) {
    assert.equal(repository[name], undefined);
  }
  assert.equal(Object.values(repository).includes(database), false);
  assert.deepEqual(Object.keys(repository).sort(), [...methods].sort());
  // A lookalike property cannot replace the actual private helper.
  repository.gameRef = () => { throw new Error('Public lookalike was used'); };
  assert.throws(() => repository.watch('test', () => {}, () => {}), (error) =>
    error.message !== 'Public lookalike was used' && error.code === 'invalid-argument');
});

test('all detached public callbacks retain their own instance and arguments', (context) => {
  // No SDK operations: spy on the public prototypes before constructor binding.
  for (const name of methods) context.mock.method(GameRepository.prototype, name, function (...args) {
    return { instance: this, args };
  });
  const first = new GameRepository({}); const second = createGameRepository({});
  for (const name of methods) {
    const callback = first[name];
    assert.deepEqual(callback.call(second, 'one', 2), { instance: first, args: ['one', 2] });
    const otherCallback = second[name];
    assert.equal(otherCallback().instance, second);
  }
});

test('instance methods remain replaceable for browser save-failure injection and restoration', async () => {
  const repository = new GameRepository({}); const original = repository.create;
  repository.create = async () => 'injected-result';
  assert.equal(await repository.create(), 'injected-result');
  repository.create = original;
  const detached = repository.create;
  await assert.rejects(detached(null, {}), (error) => error.code === 'permission-denied');
});
