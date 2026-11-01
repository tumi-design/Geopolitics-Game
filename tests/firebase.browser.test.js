import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';

// Run only against a Vite server explicitly configured for the demo emulators.
const base = process.env.UI_TEST_URL;
describe('Authentication, saved games and spectators in the browser', { skip: !base }, () => {
  let browser, context, page, spectatorContext, spectator;
  before(async () => {
    const { chromium } = await import('@playwright/test');
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    context = await browser.newContext(); page = await context.newPage();
    // Regular UI tests never consume the real provider quota.
    await page.route('**/api/battle-commentary', (route) => route.fulfill({ status: 503,
      contentType: 'application/json', body: JSON.stringify({ code: 'setup-required' }) }));
    await page.goto(base);
    const safe = await page.evaluate(async () => {
      const { db } = await import('/src/services/firebase.js');
      return db.app.options.projectId;
    });
    assert.equal(safe, 'demo-uct-inf4001n', 'Browser tests must never use production.');
  });
  after(async () => { await browser?.close(); });

  async function savedPosition(target = page) {
    return target.evaluate(async () => {
      const { gameRepository } = await import('/src/services/gameRepository.js');
      const id = new URLSearchParams(location.search).get('game');
      return new Promise((resolve, reject) => {
        const stop = gameRepository.watch(id, (value) => { if (!value.fromCache) { stop(); resolve(value); } }, reject);
      });
    });
  }
  async function ready() {
    await page.getByText('Saved to Firestore. Each action is saved automatically.').waitFor();
  }
  test('registration, multiple sessions, refresh, errors, live spectators and sign-out', { timeout: 120_000 }, async () => {
    const email = `browser-${Date.now()}@example.com`;
    const password = 'Presentation123!';
    assert.equal(await page.getByRole('button', { name: 'Create new game', exact: false }).isDisabled(), true);
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password').fill('different');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByText('The passwords do not match.').waitFor();
    await page.getByLabel('Confirm password').fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByRole('heading', { name: /Saved games/ }).waitFor();
    await page.getByRole('button', { name: /Create new game/ }).click();
    await ready();
    const firstId = new URL(page.url()).searchParams.get('game');
    await page.getByRole('button', { name: /New game/ }).first().click();
    await page.getByRole('button', { name: /Create new game/ }).click();
    await ready();
    const secondId = new URL(page.url()).searchParams.get('game');
    assert.notEqual(firstId, secondId);
    assert.equal(await page.locator('.saved-list > li').count(), 2);

    // Prepare a deterministic human turn through the real repository and engine.
    const id = await page.evaluate(async () => {
      const { auth } = await import('/src/services/firebase.js');
      const { gameRepository } = await import('/src/services/gameRepository.js');
      const { createInitialGame } = await import('/src/engine/gameState.js');
      const { countries } = await import('/src/data/countries.js');
      const game = createInitialGame(countries, '710', () => 0.5);
      game.turnOrder = game.players.map((player) => player.id); game.turnIndex = 0; game.currentPlayerId = 'human-player';
      return gameRepository.create(auth.currentUser.uid, game);
    });
    await page.goto(`${base}?game=${id}`);
    await ready();
    await page.getByRole('button', { name: 'Start attack', exact: true }).click();
    await page.getByRole('button', { name: 'Roll combat phase', exact: true }).waitFor();
    await ready();
    const attacking = await savedPosition();
    await page.reload(); await ready();
    assert.deepEqual((await savedPosition()).game, attacking.game);
    await page.getByRole('button', { name: 'Roll combat phase', exact: true }).waitFor();

    await page.getByLabel('Allow spectators with this link').click(); await ready();
    assert.equal(await page.getByLabel('Allow spectators with this link').isChecked(), true);
    spectatorContext = await browser.newContext(); spectator = await spectatorContext.newPage();
    await spectator.goto(page.url());
    await spectator.getByText('Spectator view · live updates · moves are disabled.').waitFor();
    assert.equal(await spectator.getByRole('button', { name: 'Roll combat phase' }).count(), 0);
    assert.equal(await spectator.getByRole('button', { name: /Pause NPC/ }).count(), 0);
    assert.deepEqual((await savedPosition(spectator)).game, attacking.game);

    // Inject a transport failure in memory, without changing application files.
    // Retrying must use the original dice result, not run the action again.
    await page.evaluate(async () => {
      // Vite may version module URLs after HMR. Patch the actual loaded module
      // instances, including that query string, rather than a second instance.
      const urls = new Set(performance.getEntriesByType('resource').map((entry) => entry.name).filter((url) => url.includes('/src/services/gameRepository.js')));
      window.originalUpdates = [];
      for (const url of urls) {
        const { gameRepository } = await import(url);
        window.originalUpdates.push([gameRepository, gameRepository.update]);
        gameRepository.update = async () => { throw Object.assign(new Error('Test connection failure'), { code: 'unavailable' }); };
      }
      if (!urls.size) throw new Error('Could not find the loaded repository module.');
    });
    await page.getByRole('button', { name: 'Roll combat phase' }).click();
    await page.getByText('Save needs attention. Gameplay is paused.').waitFor();
    assert.deepEqual((await savedPosition()).game, attacking.game);
    assert.equal(await page.getByRole('button', { name: 'Roll combat phase' }).isDisabled(), true);
    await page.evaluate(async () => {
      for (const [repository, original] of window.originalUpdates) repository.update = original;
    });
    await page.getByRole('button', { name: 'Retry the same save' }).click();
    await ready();
    const rolled = await savedPosition();
    assert.ok(rolled.game.battleLog.length > attacking.game.battleLog.length);
    const live = await savedPosition(spectator);
    assert.ok(live.metadata.revision >= rolled.metadata.revision);

    // A visitor signed into another account still has no editing controls.
    await spectator.getByLabel('Email', { exact: true }).fill(`visitor-${Date.now()}@example.com`);
    await spectator.getByRole('button', { name: 'New here? Create an account' }).click();
    await spectator.getByLabel('Password', { exact: true }).fill(password);
    await spectator.getByLabel('Confirm password').fill(password);
    await spectator.getByRole('button', { name: 'Create account', exact: true }).click();
    await spectator.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
    await spectator.getByText('Spectator view · live updates · moves are disabled.').waitFor();
    assert.equal(await spectator.locator('.game-editing-lock').count(), 0);

    // Stop playback before checking restoration/sign-out and revocation.
    const pause = page.getByRole('button', { name: 'Pause NPC playback', exact: true });
    if (await pause.count() && await pause.isEnabled()) await pause.click();
    await ready();
    await page.getByLabel('Allow spectators with this link').click(); await ready();
    assert.equal(await page.getByLabel('Allow spectators with this link').isChecked(), false);
    await spectator.getByText(/Access denied/).first().waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    assert.equal(await page.locator('.game-editing-lock').count(), 0);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('incorrect');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByText('The email or password is incorrect.').waitFor();
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await ready();
    assert.equal(await page.locator('.saved-list > li').count(), 3);
    const entry = page.locator('.saved-list > li').last();
    await entry.getByRole('button', { name: 'Delete', exact: true }).click();
    await entry.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.locator('.saved-list > li').count(), 3);
    await entry.getByRole('button', { name: 'Delete', exact: true }).click();
    await entry.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.saved-list > li').length === 2);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: 'test-results/firebase-mobile.png', fullPage: true });
  });

  test('automatic NPC playback saves every visible step at 4x and restores round-two reinforcements', { timeout: 30_000 }, async () => {
    const id = await page.evaluate(async () => {
      const { auth } = await import('/src/services/firebase.js');
      const { gameRepository } = await import('/src/services/gameRepository.js');
      const { createInitialGame } = await import('/src/engine/gameState.js');
      const { countries } = await import('/src/data/countries.js');
      const game = createInitialGame(countries, '710', () => 0.5);
      game.turnOrder = game.players.map((player) => player.id); game.turnIndex = 0; game.currentPlayerId = 'human-player';
      // Weak fixtures make each NPC skip once, independently of random dice.
      game.countries = game.countries.map((country) => ({ ...country, soldiers: 1 }));
      return gameRepository.create(auth.currentUser.uid, game);
    });
    await page.goto(`${base}?game=${id}`); await ready();
    await page.getByRole('button', { name: 'Skip turn', exact: true }).click(); await ready();
    await page.getByRole('button', { name: 'Pause NPC playback', exact: true }).click();
    const paused = await savedPosition();
    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.deepEqual((await savedPosition()).game, paused.game);
    await page.getByLabel('NPC playback speed').selectOption('4');
    const observing = page.evaluate(async () => {
      const { gameRepository } = await import('/src/services/gameRepository.js');
      const id = new URLSearchParams(location.search).get('game');
      return new Promise((resolve, reject) => {
        const counts = [];
        const timer = setTimeout(() => { stop(); reject(new Error('NPC playback did not finish.')); }, 15_000);
        const stop = gameRepository.watch(id, (value) => {
          const count = value.game.npcDecisionLog.length;
          if (counts.at(-1) !== count) counts.push(count);
          if (value.game.round === 2 && value.game.currentPlayerId === 'human-player') {
            clearTimeout(timer); stop(); resolve({ counts, game: value.game });
          }
        }, reject);
      });
    });
    await page.getByRole('button', { name: 'Resume NPC playback', exact: true }).click();
    const result = await observing;
    assert.deepEqual(result.counts, Array.from({ length: 10 - paused.game.npcDecisionLog.length }, (_, index) => index + paused.game.npcDecisionLog.length));
    assert.equal(result.game.pendingReinforcements, 2);
    assert.equal(result.game.npcDecisionLog.length, 9);
    await page.reload(); await ready();
    assert.deepEqual((await savedPosition()).game, result.game);
    await page.getByRole('heading', { name: 'Place your reinforcements' }).waitFor();
  });

  test('saved commentary is secondary, survives refresh, streams to spectators and fails independently', { timeout: 30_000 }, async () => {
    const id = await page.evaluate(async () => {
      const { auth } = await import('/src/services/firebase.js');
      const { gameRepository } = await import('/src/services/gameRepository.js');
      const { createInitialGame } = await import('/src/engine/gameState.js');
      const { startAttack, rollAttackPhase, completeConquest } = await import('/src/engine/gameEngine.js');
      const { countries } = await import('/src/data/countries.js');
      let game = createInitialGame(countries, '710', () => 0.5);
      game.turnOrder = game.players.map((player) => player.id); game.turnIndex = 0; game.currentPlayerId = 'human-player';
      game.countries = game.countries.map((country, index) => ({ ...country, ownerId: index === 1 ? 'npc-1' : 'human-player', soldiers: index === 1 ? 1 : 4 }));
      const id = await gameRepository.create(auth.currentUser.uid, game);
      game = startAttack(game, 'human-player', game.countries[0].id, game.countries[1].id);
      let calls = 0; game = rollAttackPhase(game, 'human-player', () => calls++ % 2 === 0 ? 0.99 : 0);
      game = completeConquest(game, 'human-player', 2);
      await gameRepository.update(id, auth.currentUser.uid, 0, crypto.randomUUID(), { game });
      await gameRepository.update(id, auth.currentUser.uid, 1, crypto.randomUUID(), { isShared: true });
      return id;
    });
    const text = 'Test fixture only: saved commentary appears beside the actual result.';
    async function publish(state, body = '') {
      // Emulator-only administrative fixture; never used by application code.
      const record = { eventId: 3, state, text: body, model: 'test-only', factsHash: 'fixture', attempts: 1,
        createdAt: Date.now(), updatedAt: Date.now(), retryAfter: Date.now() - 1 };
      const fields = Object.fromEntries(Object.entries(record).map(([key, value]) => [key, typeof value === 'string' ? { stringValue: value } : { integerValue: String(value) }]));
      const result = await fetch(`http://127.0.0.1:8080/v1/projects/demo-uct-inf4001n/databases/(default)/documents/games/${id}/commentary/3`, {
        method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
      });
      assert.equal(result.ok, true);
    }
    await publish('ready', text);
    let requests = 0;
    await page.route('**/api/battle-commentary', async (route) => {
      requests++;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'commentary-unavailable' }) });
    });
    await page.goto(`${base}?game=${id}`); await ready();
    await page.getByLabel('Gemini battle commentary').first().getByText(text).waitFor();
    const before = await savedPosition();
    await page.reload(); await ready();
    await page.getByLabel('Gemini battle commentary').first().getByText(text).waitFor();
    assert.equal(requests, 0);
    const watchingContext = await browser.newContext(); const watching = await watchingContext.newPage();
    await watching.goto(page.url());
    await watching.getByLabel('Gemini battle commentary').first().getByText(text).waitFor();
    assert.equal(await watching.getByRole('button', { name: 'Generate commentary' }).count(), 0);
    await publish('failed');
    await page.getByRole('button', { name: 'Retry commentary', exact: true }).click();
    await page.getByText('Gemini commentary is unavailable. The battle result is unchanged.').first().waitFor();
    assert.equal(requests, 1);
    assert.deepEqual((await savedPosition()).game, before.game);
    await publish('ready', `${text} Updated live.`);
    await watching.getByLabel('Gemini battle commentary').first().getByText(`${text} Updated live.`).waitFor();
    await watchingContext.close();
    await page.unroute('**/api/battle-commentary');
  });
});
