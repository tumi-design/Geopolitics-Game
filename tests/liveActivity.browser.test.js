import { test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';

// Isolated presentation fixtures: no game ID, writes, emulator or Gemini calls.
const base = process.env.UI_TEST_URL;
for (const [actor, width, source, target] of [
  ['human-player', 1280, 'Ghana', 'Brazil'],
  ['npc-1', 390, 'Democratic Republic of the Congo', 'United Kingdom'],
]) {
  test(`Live Activity labels ${actor} battles correctly at ${width}px`, { skip: !base }, async () => {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch({ headless: true,
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    try {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.route('**/api/battle-commentary', () => { throw new Error('Presentation fixtures must never generate commentary.'); });
      await page.goto(base);
      await page.evaluate(async ({ actor, source, target }) => {
        const reactModule = await import('/node_modules/.vite/deps/react.js');
        const React = reactModule.default ?? reactModule;
        const clientModule = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { createRoot } = clientModule.default ?? clientModule;
        const { default: GameActivity } = await import('/src/components/GameActivity.jsx');
        const { db } = await import('/src/services/firebase.js');
        if (db?.app.options.projectId !== 'demo-uct-inf4001n') throw new Error('Use demo configuration only.');
        document.getElementById('root').style.display = 'none';
        const host = document.createElement('div'); host.className = 'app-shell'; document.body.append(host);
        createRoot(host).render(React.createElement(GameActivity, { game: {
          countries: [{ id: 'a', name: source }, { id: 'b', name: target }],
          players: [{ id: actor, name: actor === 'human-player' ? 'You' : 'NPC 1' }], npcDecisionLog: [],
          battleLog: [{ id: 1, type: 'attack_started', round: 1, playerId: actor,
            sourceCountryId: 'a', targetCountryId: 'b', attackingSoldiers: 4, defendingSoldiers: 3 }],
        } }));
      }, { actor, source, target });
      const heading = page.locator('.live-battle-matchup'); await heading.waitFor();
      assert.equal(await heading.locator('.attacker-role').textContent(), 'ATTACKER');
      assert.equal(await heading.locator('.defender-role').textContent(), 'DEFENDER');
      assert.equal(await heading.locator('.attacker-name').textContent(), source);
      assert.equal(await heading.locator('.defender-name').textContent(), target);
      assert.equal(await heading.getByLabel('against').textContent(), '→');
      for (const side of ['attacker', 'defender']) {
        const label = await heading.locator(`.${side}-role`).boundingBox();
        const name = await heading.locator(`.${side}-name`).boundingBox();
        assert.ok(label.y + label.height <= name.y, 'Role label must sit above its country.');
        assert.equal(label.x, name.x);
        const sizes = await heading.evaluate((element, side) => ({
          label: parseFloat(getComputedStyle(element.querySelector(`.${side}-role`)).fontSize),
          name: parseFloat(getComputedStyle(element.querySelector(`.${side}-name`)).fontSize),
        }), side);
        assert.ok(sizes.label < sizes.name, 'Country names must remain more prominent than labels.');
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } finally { await browser.close(); }
  });
}
