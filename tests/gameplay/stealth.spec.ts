import { test, expect } from '@playwright/test';
import { enterOffline } from '../helpers/offline-ui';
import { registerOnline, selectOnlineClass, equipOnline, onlineLobby } from '../helpers/online-account';
import { startServer } from '../../server/server';

test('offline passive is selectable and saved; self and weapon fade both ways', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/?offline'); await enterOffline(page);
  await page.locator('#edit-loadout').click(); await page.locator('[data-class="assassin"]').click();
  await page.locator('[data-skill="stealth"]').click();
  await page.reload(); await page.locator('#edit-loadout').click();
  await expect(page.locator('[data-skill="stealth"]')).toBeDisabled();
  await page.locator('#armory-back').click(); await page.locator('#custom-start').click();
  await page.waitForFunction(() => (window.__strikeCampaign?.battle.frame ?? 0) > 3);
  await page.evaluate(() => { const b = window.__strikeCampaign!.battle; b.actors.forEach(a => { a.human = true; }); b.player.stealthFrames = 0; });
  await expect(page.locator('#abilities')).toContainText('被动 隐匿');
  await page.waitForFunction(() => window.__strikeCampaign!.battle.player.stealthFrames >= 150, undefined, { timeout: 10000 });
  const alpha = () => page.evaluate(() => {
    const images = window.__strikeCampaign!.children.list.filter(c => {
      const image = c as unknown as { visible: boolean; texture?: { key: string } };
      return image.visible && (image.texture?.key.startsWith('actor-assassin-') || image.texture?.key === 'actor-scout');
    }) as unknown as { alpha: number }[];
    return images.map(i => i.alpha);
  });
  await expect.poll(async () => (await alpha()).some(a => a > .25 && a < 1), { intervals: [20] }).toBe(true);
  await expect.poll(async () => (await alpha()).every(a => a === .25)).toBe(true);
  expect((await alpha()).length).toBeGreaterThan(10);
  await page.screenshot({ path: 'artifacts/qa/stealth-self-offline.png' });
  await page.keyboard.press('e'); await expect(page.locator('#abilities')).toContainText('已生效');
  await page.keyboard.down('d');
  await expect.poll(async () => (await alpha()).some(a => a > .25 && a < 1), { intervals: [20] }).toBe(true);
  await expect.poll(async () => (await alpha()).every(a => a === 1)).toBe(true);
  await page.keyboard.up('d');
});

test('online loadout saves passive choice and renders authoritative self transparency', async ({ page }) => {
  test.setTimeout(60000);
  const server = startServer(0, '127.0.0.1', 30000, undefined, 60000, true); await new Promise<void>(r => server.wss.once('listening', r));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('Missing port');
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await registerOnline(page, 'Stealth Pilot'); await selectOnlineClass(page, 'assassin');
    await equipOnline(page, 'skill', 'stealth');
    await expect(page.locator('[data-gear="stealth"]')).toContainText('被动技能');
    const profile = (await server.accounts.login('login', 'Stealth Pilot', 'test-password-123', 'fixture')).profile;
    expect(profile.classes.assassin.equipment.skill).toBe('stealth');
    await page.screenshot({ path: 'artifacts/qa/stealth-loadout.png' });
    await page.evaluate(async () => {
      const path = '/src/game/campaign/ReferenceArt.ts'; const { ReferenceArt } = await import(path);
      const original = ReferenceArt.prototype.soldier;
      ReferenceArt.prototype.soldier = function (...args: unknown[]) {
        const start = this.cursor; original.apply(this, args);
        (window as unknown as { stealthAlpha: number }).stealthAlpha = this.pool[start].alpha;
      };
    });
    await onlineLobby(page); await page.locator('#join-debug').click();
    await expect(page.locator('#status')).toContainText('公共调试');
    await selectOnlineClass(page, 'assassin'); await equipOnline(page, 'skill', 'stealth'); await onlineLobby(page);
    await expect(page.locator('#online-game canvas')).toBeVisible();
    await page.locator('#online-game canvas').scrollIntoViewIfNeeded();
    await expect(page.locator('#online-hud')).toContainText('被动 隐匿');
    await expect(page.locator('#online-hud')).toContainText('已生效', { timeout: 10000 });
    const alpha = () => page.evaluate(() => (window as unknown as { stealthAlpha: number }).stealthAlpha);
    await expect.poll(alpha).toBe(.25);
    await page.screenshot({ path: 'artifacts/qa/stealth-self-online.png' });
    await page.keyboard.down('d');
    await expect.poll(alpha, { intervals: [20] }).toBeGreaterThan(.25);
    expect(await alpha()).toBeLessThan(1);
    await expect.poll(alpha).toBe(1); await page.keyboard.up('d');
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});
