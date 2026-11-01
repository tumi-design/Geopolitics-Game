import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCredentials, firebaseErrorMessage } from './authValidation.js';

test('registration validates email, password length and confirmation', () => {
  assert.equal(validateCredentials('  person@example.com ', 'secret1', 'secret1'), 'person@example.com');
  assert.throws(() => validateCredentials('broken', 'secret1', 'secret1'), /email/);
  assert.throws(() => validateCredentials('a@b.com', 'short', 'short'), /six/);
  assert.throws(() => validateCredentials('a@b.com', 'secret1', 'secret2'), /match/);
  assert.throws(() => validateCredentials('a@b.com', ''), /password/);
  assert.equal(validateCredentials('a@b.com', 'older'), 'a@b.com');
});
test('authentication errors are readable without revealing account existence on login', () => {
  assert.equal(firebaseErrorMessage({ code: 'auth/user-not-found' }), firebaseErrorMessage({ code: 'auth/wrong-password' }));
  assert.match(firebaseErrorMessage({ code: 'permission-denied' }), /rules/);
  assert.match(firebaseErrorMessage({ code: 'unavailable' }), /retry/);
  assert.match(firebaseErrorMessage({ code: 'conflict' }), /another tab/);
});
