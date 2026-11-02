import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommentaryScheduler } from './commentaryScheduler.js';

const start = (id) => ({ id, type: 'attack_started' });
const phase = (id) => ({ id, type: 'combat_phase', outcome: 'continue', attackerLosses: 1, defenderLosses: 0 });
const stop = (id) => ({ id, type: 'attack_stopped' });
async function flush() { await Promise.resolve(); await Promise.resolve(); }
function fixture(send = async () => ({ state: 'ready' })) {
  let now = 0; let timerId = 0;
  const timers = new Map(); const calls = []; const attempted = new Set();
  const scheduler = createCommentaryScheduler({
    send: (id, retry) => { calls.push({ id, retry, at: now }); attempted.add(id); return send(id, retry); },
    hasAttempted: (id) => attempted.has(id), clock: () => now,
    setTimer: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimer: (id) => timers.delete(id),
  });
  return { scheduler, calls, timers,
    async tick(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
      await flush();
    } };
}

test('restoration and saved entries never generate; a later battle gets a fresh sample', async () => {
  const { scheduler, calls } = fixture();
  const events = [start(1), phase(2)];
  scheduler.observe(events, {}, true);
  scheduler.observe([...events, phase(3)], {}, true);
  assert.equal(calls.length, 0);
  scheduler.observe([...events, phase(3), stop(4), start(5), phase(6)], { 4: { state: 'ready' } }, true);
  await flush();
  assert.deepEqual(calls.map((call) => call.id), [6]);
});

test('one in-flight and one coalesced pending outcome survive rapid phases and enforce 30-second pacing', async () => {
  let finish;
  const { scheduler, calls, tick } = fixture(() => new Promise((resolve) => { finish = resolve; }));
  scheduler.observe([], {}, true);
  scheduler.observe([start(1), phase(2)], {}, true);
  scheduler.observe([start(1), phase(2), phase(3), stop(4)], {}, true);
  scheduler.observe([start(1), phase(2), phase(3), stop(4), start(5), phase(6)], {}, true);
  assert.deepEqual(calls.map((call) => call.id), [2]);
  finish({ state: 'ready' }); await flush();
  await tick(29_999); assert.equal(calls.length, 1);
  await tick(1); assert.deepEqual(calls.map((call) => call.id), [2, 4]);
});

test('queued ongoing samples are replaced by their completed outcome before dispatch', async () => {
  const { scheduler, calls, tick } = fixture();
  scheduler.observe([], {}, true);
  scheduler.observe([start(1), stop(2)], {}, true); await flush();
  scheduler.observe([start(1), stop(2), start(3), phase(4)], {}, true);
  scheduler.observe([start(1), stop(2), start(3), phase(4), stop(5)], {}, true);
  await tick(30_000);
  assert.deepEqual(calls.map((call) => call.id), [2, 5]);
});

test('many completed battles retain only the newest pending outcome', async () => {
  const { scheduler, calls, tick } = fixture(); const events = [];
  scheduler.observe(events, {}, true);
  for (let id = 1; id <= 100; id += 2) {
    events.push(start(id), stop(id + 1)); scheduler.observe([...events], {}, true);
  }
  await flush(); await tick(30_000);
  assert.deepEqual(calls.map((call) => call.id), [2, 100]);
});

test('quota failures discard pending work, honour retryAfter and never retry old events', async () => {
  const { scheduler, calls, tick } = fixture(async () => ({ state: 'unavailable', code: 'daily-limit', retryAfter: 100_000 }));
  scheduler.observe([], {}, true);
  const events = [start(1), phase(2), stop(3)];
  scheduler.observe(events.slice(0, 2), {}, true);
  scheduler.observe(events, {}, true); await flush();
  scheduler.observe([...events, start(4), stop(5)], {}, true);
  await tick(100_000); assert.equal(calls.length, 1);
  scheduler.observe([...events, start(4), stop(5), start(6), stop(7)], {}, true); await flush();
  assert.deepEqual(calls.map((call) => call.id), [2, 7]);
});

test('dispose cancels pending work and late responses cannot restart a scheduler', async () => {
  let finish;
  const { scheduler, calls, tick, timers } = fixture(() => new Promise((resolve) => { finish = resolve; }));
  scheduler.observe([], {}, true); scheduler.observe([start(1), phase(2)], {}, true);
  scheduler.observe([start(1), phase(2), stop(3)], {}, true);
  scheduler.dispose(); finish({ state: 'ready' }); await flush(); await tick(60_000);
  assert.equal(calls.length, 1); assert.equal(timers.size, 0);
});

test('loading defers new candidates; explicit retries share the one-flight lock', async () => {
  let finish;
  const { scheduler, calls } = fixture(() => new Promise((resolve) => { finish = resolve; }));
  scheduler.observe([], {}, false);
  scheduler.observe([start(1), phase(2)], {}, false);
  assert.equal(calls.length, 0);
  scheduler.observe([start(1), phase(2)], {}, true);
  assert.equal(await scheduler.manual(3, true), null);
  finish({ state: 'ready' }); await flush();
  const retry = scheduler.manual(2, true); finish({ state: 'ready' }); await retry;
  assert.deepEqual(calls.map((call) => call.retry), [false, true]);
});

test('rejected requests use a bounded cooldown instead of looping', async () => {
  const { scheduler, calls, tick } = fixture(async () => { throw new Error('offline'); });
  scheduler.observe([], {}, true); scheduler.observe([start(1), phase(2)], {}, true); await flush();
  scheduler.observe([start(1), phase(2), stop(3)], {}, true); await tick(60_000);
  assert.equal(calls.length, 1);
});

test('disposing a pacing timer cancels its pending request', async () => {
  const { scheduler, calls, timers, tick } = fixture();
  scheduler.observe([], {}, true); scheduler.observe([start(1), phase(2)], {}, true); await flush();
  scheduler.observe([start(1), phase(2), stop(3)], {}, true);
  assert.equal(timers.size, 1);
  scheduler.dispose(); await tick(60_000);
  assert.equal(timers.size, 0); assert.equal(calls.length, 1);
});

test('a saved pending lease is never automatically polled or regenerated', async () => {
  const { scheduler, calls, tick } = fixture(async () => ({ state: 'pending', retryAfter: 90_000 }));
  const events = [start(1), phase(2)];
  scheduler.observe([], {}, true); scheduler.observe(events, {}, true); await flush();
  scheduler.observe([...events, stop(3)], {}, true); await tick(90_000);
  scheduler.observe([...events, stop(3)], {}, true);
  assert.equal(calls.length, 1);
});

test('a Firestore entry arriving before the pacing timer prevents a duplicate request', async () => {
  const { scheduler, calls, timers, tick } = fixture();
  const events = [start(1), phase(2), stop(3)];
  scheduler.observe([], {}, true); scheduler.observe(events.slice(0, 2), {}, true); await flush();
  scheduler.observe(events, {}, true);
  scheduler.observe(events, { 3: { state: 'ready' } }, true);
  assert.equal(timers.size, 0); await tick(30_000); assert.equal(calls.length, 1);
});
