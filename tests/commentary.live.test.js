import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';

// Explicit opt-in only: this test makes one real, quota-consuming Gemini call.
describe('Real Gemini in a local browser and demo Firestore', { skip: process.env.RUN_LIVE_GEMINI !== 'true' }, () => {
  test('real generated commentary persists, refreshes without another call, and is visible to spectators', { timeout: 90_000 }, async () => {
    let localApi;
    if (process.env.LIVE_API_IN_PROCESS === 'true') {
      process.env.COMMENTARY_USE_EMULATORS = 'true';
      ({ localServer: localApi } = await import('../scripts/dev-api.mjs'));
    }
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    try {
      const context = await browser.newContext(); const page = await context.newPage();
      const base = process.env.UI_TEST_URL ?? 'http://127.0.0.1:5173/';
      await page.goto(base);
      assert.equal(await page.evaluate(async () => (await import('/src/services/firebase.js')).db.app.options.projectId), 'demo-uct-inf4001n');
      await page.getByRole('button', { name: 'New here? Create an account' }).click();
      await page.getByLabel('Email', { exact: true }).fill(`live-commentary-${Date.now()}@example.com`);
      await page.getByLabel('Password', { exact: true }).fill('DemoBrowser123!');
      await page.getByLabel('Confirm password').fill('DemoBrowser123!');
      await page.getByRole('button', { name: 'Create account', exact: true }).click();
      await page.getByRole('heading', { name: /Saved games/ }).waitFor();
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
      let requests = 0;
      page.on('request', (request) => { if (request.url().endsWith('/api/battle-commentary')) requests++; });
      const apiResponse = page.waitForResponse((response) => response.url().endsWith('/api/battle-commentary'), { timeout: 45_000 });
      await page.goto(`${base}?game=${id}`);
      const response = await apiResponse; const record = await response.json();
      assert.equal(response.status(), 200, `Endpoint returned safe status: ${record.code ?? record.state}`);
      assert.equal(record.model, 'gemini-3.5-flash-lite'); assert.equal(record.state, 'ready'); assert.ok(record.text.length > 30);
      await page.getByLabel('Gemini battle commentary').first().getByText(record.text, { exact: true }).waitFor();
      await page.reload();
      await page.getByLabel('Gemini battle commentary').first().getByText(record.text, { exact: true }).waitFor();
      await new Promise((resolve) => setTimeout(resolve, 1800));
      assert.equal(requests, 1);
      const spectator = await browser.newContext(); const watching = await spectator.newPage();
      await watching.goto(page.url());
      await watching.getByLabel('Gemini battle commentary').first().getByText(record.text, { exact: true }).waitFor();
      assert.equal(await watching.getByRole('button', { name: 'Generate commentary' }).count(), 0);
      await page.screenshot({ path: 'test-results/real-gemini-commentary.png', fullPage: true });
      console.log('Verified real Gemini generation through the server, Firestore persistence, refresh deduplication and spectator display (demo game only).');
    } finally { await browser.close(); localApi?.close(); }
  });
});
