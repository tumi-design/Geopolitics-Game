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
    async function publish(state, body = '', eventId = 3) {
      // Emulator-only administrative fixture; never used by application code.
      const record = { eventId, state, text: body, model: 'test-only', factsHash: 'fixture', attempts: 1,
        createdAt: Date.now(), updatedAt: Date.now(), retryAfter: Date.now() - 1 };
      const fields = Object.fromEntries(Object.entries(record).map(([key, value]) => [key, typeof value === 'string' ? { stringValue: value } : { integerValue: String(value) }]));
      const result = await fetch(`http://127.0.0.1:8080/v1/projects/demo-uct-inf4001n/databases/(default)/documents/games/${id}/commentary/${eventId}`, {
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
    const panel = page.getByRole('region', { name: 'Gemini Commentary', exact: true });
    assert.equal(await page.locator('.live-panel .battle-commentary').count(), 0);
    assert.equal(await panel.evaluate((element) => element.previousElementSibling.classList.contains('live-panel')), true);
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
    // Browse saved history without generating, even when unrelated async saved
    // results arrive. Missing battle metadata must not hide saved prose.
    await publish('ready', 'Older saved fixture.', 2);
    await panel.getByLabel('Commentary history').selectOption('3');
    await publish('ready', 'Newest saved fixture.', 6);
    await panel.getByText(`${text} Updated live.`, { exact: true }).waitFor();
    assert.equal(await panel.getByText('Newest saved fixture.', { exact: true }).count(), 0);
    await panel.getByRole('button', { name: 'Return to latest saved commentary' }).click();
    await panel.getByText('Newest saved fixture.', { exact: true }).waitFor();
    await page.reload(); await ready();
    await panel.getByText('Newest saved fixture.', { exact: true }).waitFor();
    await panel.getByLabel('Commentary history').selectOption('2');
    await panel.getByText('Older saved fixture.', { exact: true }).waitFor();
    const removed = await fetch(`http://127.0.0.1:8080/v1/projects/demo-uct-inf4001n/databases/(default)/documents/games/${id}/commentary/2`, {
      method: 'DELETE', headers: { Authorization: 'Bearer owner' },
    });
    assert.equal(removed.ok, true);
    await panel.getByText(/This saved commentary entry is no longer available/).waitFor();
    await panel.getByRole('button', { name: 'Return to latest saved commentary' }).click();
    await panel.getByText('Newest saved fixture.', { exact: true }).waitFor();
    const spectatorPanel = watching.getByRole('region', { name: 'Gemini Commentary', exact: true });
    await spectatorPanel.getByLabel('Commentary history').selectOption('3');
    await spectatorPanel.getByText(`${text} Updated live.`, { exact: true }).waitFor();
    assert.equal(await spectatorPanel.getByRole('button', { name: /Generate commentary|Retry commentary/ }).count(), 0);
    await new Promise((resolve) => setTimeout(resolve, 1800));
    assert.equal(requests, 1, 'Browsing, refreshing and saved updates must not generate commentary.');
    await watchingContext.close();
    await page.unroute('**/api/battle-commentary');
  });

  test('empty history, game switches and restoring a missing result never generate automatically', { timeout: 30_000 }, async () => {
    const previousId = new URL(page.url()).searchParams.get('game');
    const panel = page.getByRole('region', { name: 'Gemini Commentary', exact: true });
    await panel.getByLabel('Commentary history').selectOption('3');
    let requests = 0;
    await page.route('**/api/battle-commentary', (route) => {
      requests++;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'setup-required' }) });
    });
    const id = await page.evaluate(async () => {
      const { auth } = await import('/src/services/firebase.js');
      const { gameRepository } = await import('/src/services/gameRepository.js');
      const { createInitialGame } = await import('/src/engine/gameState.js');
      const { countries } = await import('/src/data/countries.js');
      const game = createInitialGame(countries, '710', () => 0.5);
      game.turnOrder = game.players.map((player) => player.id); game.turnIndex = 0; game.currentPlayerId = 'human-player';
      return gameRepository.create(auth.currentUser.uid, game);
    });
    // Opening a different saved game in the same mounted interface clears the
    // previous game's reading selection and text.
    await page.locator('.saved-open').first().click(); await ready();
    assert.equal(new URL(page.url()).searchParams.get('game'), id);
    await panel.getByText(/No saved Gemini commentary yet/).waitFor();
    assert.equal(await panel.getByLabel('Commentary history').inputValue(), '');
    assert.equal(await panel.getByRole('button', { name: /Generate commentary|Retry commentary/ }).count(), 0);
    for (const eventId of [3, 6]) {
      const removed = await fetch(`http://127.0.0.1:8080/v1/projects/demo-uct-inf4001n/databases/(default)/documents/games/${previousId}/commentary/${eventId}`, {
        method: 'DELETE', headers: { Authorization: 'Bearer owner' },
      });
      assert.equal(removed.ok, true);
    }
    await page.goto(`${base}?game=${previousId}`); await ready();
    await panel.getByRole('button', { name: 'Generate commentary', exact: true }).waitFor();
    await new Promise((resolve) => setTimeout(resolve, 1800));
    assert.equal(requests, 0, 'Restoring a completed battle without saved commentary requires an explicit owner request.');
    await page.unroute('**/api/battle-commentary');
  });
  test('pinned commentary survives successive engine battles and latest mode follows subsequent saves', { timeout: 30_000 }, async () => {
    const id = await page.evaluate(async () => {
      const { auth } = await import('/src/services/firebase.js');
      const { gameRepository } = await import('/src/services/gameRepository.js');
      const { createInitialGame } = await import('/src/engine/gameState.js');
      const { countries } = await import('/src/data/countries.js');
      const game = createInitialGame(countries, '710', () => 0.5);
      game.turnOrder = game.players.map((player) => player.id); game.turnIndex = 0; game.currentPlayerId = 'human-player';
      game.countries = game.countries.map((country) => ({ ...country, soldiers: 4 }));
      const id = await gameRepository.create(auth.currentUser.uid, game);
      const revision = await gameRepository.update(id, auth.currentUser.uid, 0, crypto.randomUUID(), { isShared: true });
      window.commentaryFixture = { id, game, revision };
      return id;
    });
    async function advance(type) {
      return page.evaluate(async (type) => {
        const { auth } = await import('/src/services/firebase.js');
        const { gameRepository } = await import('/src/services/gameRepository.js');
        const { startAttack, stopAttack } = await import('/src/engine/gameEngine.js');
        const fixture = window.commentaryFixture;
        const player = fixture.game.currentPlayerId;
        const source = fixture.game.countries.find((country) => country.ownerId === player);
        const target = fixture.game.countries.find((country) => country.ownerId !== player);
        fixture.game = type === 'start' ? startAttack(fixture.game, player, source.id, target.id) : stopAttack(fixture.game, player);
        fixture.revision = await gameRepository.update(fixture.id, auth.currentUser.uid, fixture.revision, crypto.randomUUID(), { game: fixture.game });
        return fixture.game.battleLog.at(-1).id;
      }, type);
    }
    async function publish(eventId, text) {
      const record = { eventId, state: 'ready', text, model: 'test-only', attempts: 1, retryAfter: 0 };
      const fields = Object.fromEntries(Object.entries(record).map(([key, value]) => [key, typeof value === 'string' ? { stringValue: value } : { integerValue: String(value) }]));
      const result = await fetch(`http://127.0.0.1:8080/v1/projects/demo-uct-inf4001n/databases/(default)/documents/games/${id}/commentary/${eventId}`, {
        method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
      });
      assert.equal(result.ok, true);
    }
    await advance('start'); const first = await advance('stop');
    await publish(first, 'First battle fixture.');
    // A spectator has no local NPC runner: the fixture advances real engine
    // actions individually, with each revision delivered by Firestore.
    const readingContext = await browser.newContext(); const reading = await readingContext.newPage();
    let requests = 0;
    await reading.route('**/api/battle-commentary', (route) => {
      requests++;
      return route.fulfill({ status: 503, body: '{}' });
    });
    try {
      await reading.goto(`${base}?game=${id}`);
      const panel = reading.getByRole('region', { name: 'Gemini Commentary', exact: true });
      await panel.getByText('First battle fixture.', { exact: true }).waitFor();
      await panel.getByLabel('Commentary history').selectOption(String(first));
      await advance('start');
      await reading.locator('.live-panel').getByText(/attacks .* soldiers/).waitFor();
      await panel.getByText('First battle fixture.', { exact: true }).waitFor();
      const second = await advance('stop');
      await reading.locator('.live-panel').getByText(/Attack on .* stopped/).waitFor();
      await publish(second, 'Second battle fixture.');
      await panel.getByLabel('Commentary history').locator(`option[value="${second}"]`).waitFor({ state: 'attached' });
      assert.equal(await panel.getByLabel('Commentary history').inputValue(), String(first));
      assert.equal(await panel.getByText('Second battle fixture.', { exact: true }).count(), 0);
      await panel.getByRole('button', { name: 'Return to latest saved commentary' }).click();
      await panel.getByText('Second battle fixture.', { exact: true }).waitFor();
      await advance('start'); const third = await advance('stop');
      await publish(third, 'Third battle fixture.');
      await panel.getByText('Third battle fixture.', { exact: true }).waitFor();
      assert.equal(await panel.getByLabel('Commentary history').inputValue(), '');
      await reading.reload();
      await panel.getByText('Third battle fixture.', { exact: true }).waitFor();
      await panel.getByLabel('Commentary history').selectOption(String(first));
      await panel.getByText('First battle fixture.', { exact: true }).waitFor();
      assert.equal(requests, 0);
    } finally { await readingContext.close(); }
  });
  for (const speed of [1, 2, 4]) {
    test(`automatic ongoing commentary at ${speed}x is independent of live activity and pinned selection`, { timeout: 60_000 }, async () => {
      const id = await page.evaluate(async () => {
        const { auth } = await import('/src/services/firebase.js');
        const { gameRepository } = await import('/src/services/gameRepository.js');
        const { createInitialGame } = await import('/src/engine/gameState.js');
        const { startAttack, stopAttack, skipTurn, allocateReinforcements } = await import('/src/engine/gameEngine.js');
        const { countries } = await import('/src/data/countries.js');
        let game = createInitialGame(countries, '710', () => 0.5);
        game.turnOrder = game.players.map((player) => player.id); game.turnIndex = 0; game.currentPlayerId = 'human-player';
        game.countries = game.countries.map((country, index) => ({ ...country, soldiers: index === 1 ? 20 : 4 }));
        const id = await gameRepository.create(auth.currentUser.uid, game);
        game = stopAttack(startAttack(game, 'human-player', game.countries[0].id, game.countries[1].id), 'human-player');
        while (game.currentPlayerId !== 'human-player') game = skipTurn(game, game.currentPlayerId);
        game = allocateReinforcements(game, 'human-player', [{ countryId: game.countries[0].id, soldiers: game.pendingReinforcements }]);
        await gameRepository.update(id, auth.currentUser.uid, 0, crypto.randomUUID(), { game });
        return id;
      });
      async function publish(eventId, text) {
        const record = { eventId, state: 'ready', text, model: 'test-only', factsHash: 'fixture', attempts: 1,
          createdAt: Date.now(), updatedAt: Date.now(), retryAfter: 0 };
        const fields = Object.fromEntries(Object.entries(record).map(([key, value]) => [key, typeof value === 'string' ? { stringValue: value } : { integerValue: String(value) }]));
        const result = await fetch(`http://127.0.0.1:8080/v1/projects/demo-uct-inf4001n/databases/(default)/documents/games/${id}/commentary/${eventId}`, {
          method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
        });
        assert.equal(result.ok, true);
        return record;
      }
      await publish(2, 'Earlier completed battle fixture.');
      let release; let received;
      const requestReceived = new Promise((resolve) => { received = resolve; });
      const released = new Promise((resolve) => { release = resolve; });
      const requests = [];
      await page.route('**/api/battle-commentary', async (route) => {
        const body = route.request().postDataJSON(); requests.push(body); received(body);
        await released;
        const record = await publish(body.eventId, 'Ongoing phase fixture: pressure remains uncertain.');
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(record) });
      });
      try {
        await page.goto(`${base}?game=${id}`); await ready();
        const panel = page.getByRole('region', { name: 'Gemini Commentary', exact: true });
        await panel.getByText('Earlier completed battle fixture.', { exact: true }).waitFor();
        await panel.getByLabel('Commentary history').selectOption('2');
        await page.getByLabel('NPC playback speed').selectOption(String(speed));
        await page.evaluate(() => {
          // A mixed first phase causes casualties without conquest. Subsequent
          // pairs tie, keeping the ongoing attack safe for delayed-response checks.
          let calls = 0;
          window.originalRandom = Math.random;
          Math.random = () => {
            if (!new Error().stack.includes('rollDie')) return window.originalRandom();
            return [0.99, 0, 0.99, 0, 0, 0.99, 0, 0.99][calls++] ?? 0;
          };
        });
        await page.getByRole('button', { name: 'Skip turn', exact: true }).click();
        const request = await requestReceived;
        assert.deepEqual(request, { gameId: id, eventId: 4, retry: false });
        await page.locator('.live-panel .event-context').filter({ hasText: /Phase 2/ }).waitFor();
        await page.getByRole('button', { name: 'Pause NPC playback', exact: true }).click(); await ready();
        const before = await savedPosition();
        assert.ok(before.game.battleLog.some((event) => event.id === 4 && event.outcome === 'continue'));
        // Still-in-flight commentary must not prevent independently saved rolls.
        assert.ok(before.game.npcDecisionLog.length >= 3);
        release();
        await panel.getByLabel('Commentary history').locator('option[value="4"]').waitFor({ state: 'attached' });
        assert.equal(await panel.getByLabel('Commentary history').inputValue(), '2');
        await panel.getByText('Earlier completed battle fixture.', { exact: true }).waitFor();
        await panel.getByRole('button', { name: 'Return to latest saved commentary' }).click();
        await panel.getByText('Ongoing phase fixture: pressure remains uncertain.', { exact: true }).waitFor();
        assert.equal(requests.length, 1);
        assert.deepEqual((await savedPosition()).game, before.game);
        await page.reload(); await ready();
        const pause = page.getByRole('button', { name: 'Pause NPC playback', exact: true });
        if (await pause.count() && await pause.isEnabled()) await pause.click();
        await panel.getByText('Ongoing phase fixture: pressure remains uncertain.', { exact: true }).waitFor();
        assert.equal(requests.length, 1, 'Restoration does not regenerate the ongoing phase.');
      } finally {
        release();
        await page.evaluate(() => { if (window.originalRandom) Math.random = window.originalRandom; });
        await page.unroute('**/api/battle-commentary');
      }
    });
  }
});
