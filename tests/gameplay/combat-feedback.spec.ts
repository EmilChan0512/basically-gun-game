import { test, expect } from '@playwright/test';
import { startServer } from '../../server/server';

test('campaign damage, phased status, ammo warnings and full respawn flow', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?offline'); await page.locator('#continue-campaign').click(); await page.locator('#deploy').click();
  await expect(page.locator('#player-ammo')).toContainText('M4');
  await page.evaluate(() => {
    const b = window.__strikeCampaign!.battle;
    // Hold bots neutral without changing the player's real 30Hz update loop.
    for (const enemy of b.actors.filter(a => !a.human)) enemy.human = true;
    b.player.life.spawnProtectionFrames = 0; b.player.arsenal.gun.ammo = 7;
    b.damage(b.player, 10, b.actors.find(a => a.team !== b.player.team)!);
  });
  await expect(page.locator('.combat-status')).toContainText('受压');
  await expect(page.locator('.combat-ammo')).toContainText('LOW MAGAZINE');
  await page.evaluate(() => { const p = window.__strikeCampaign!.battle.player; p.arsenal.gun.reserveAmmo = 0; });
  await expect(page.locator('.combat-ammo')).toContainText('NO RESERVE AMMO');
  await page.screenshot({ path: 'artifacts/qa/combat-ammo.png', fullPage: true });
  await page.evaluate(() => {
    const b = window.__strikeCampaign!.battle; b.player.life.health = 20; b.player.life.regenDelay = 90;
    b.damage(b.player, 9999, b.actors.find(a => a.team !== b.player.team)!);
  });
  await expect(page.locator('.combat-count')).toHaveText('RESPAWN IN 5');
  await expect(page.locator('.combat-observe')).toBeDisabled();
  await expect(page.locator('.death-grayscale')).toBeVisible();
  const deathBox = await page.locator('.combat-death').boundingBox();
  await expect(page.locator('.combat-killer')).toContainText('击杀者');
  await page.screenshot({ path: 'artifacts/qa/combat-death.png', fullPage: true });
  await expect(page.locator('.combat-observe')).toBeEnabled({ timeout: 4000 });
  await expect(page.locator('.combat-hint')).toContainText('正在观察');
  await expect(page.locator('.death-grayscale')).toHaveCount(0);
  const observeBox = await page.locator('.combat-death').boundingBox();
  expect(observeBox!.y).toBe(deathBox!.y); expect(observeBox!.height).toBe(deathBox!.height);
  await page.screenshot({ path: 'artifacts/qa/combat-observe.png', fullPage: true });
  await expect(page.locator('.combat-death')).toBeHidden({ timeout: 5000 });
  expect(await page.evaluate(() => window.__strikeCampaign!.battle.player.life.alive)).toBe(true);
  expect(errors).toEqual([]);
});

test('online authoritative damage and death show feedback on the live canvas', async ({ page }) => {
  const server = startServer(0, '127.0.0.1', 30000, undefined, 60000, true);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address() as { port: number };
  try {
    await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`); await page.locator('#join-debug').click();
    await expect(page.locator('#online-game')).toHaveAttribute('aria-busy', 'false');
    const b = server.rooms.get('debug')!.session!.battle, p = b.player;
    p.life.spawnProtectionFrames = 0; p.arsenal.gun.ammo = 5; p.arsenal.gun.reserveAmmo = 0; b.damage(p, 5);
    await expect(page.locator('.combat-ammo')).toContainText('NO RESERVE AMMO');
    await expect(page.locator('.combat-status')).toContainText('受压');
    b.damage(p, 9999);
    await expect(page.locator('.combat-count')).toHaveText('RESPAWN IN 5');
    await expect(page.locator('.combat-killer')).toContainText('环境伤害');
    await expect(page.locator('.combat-cause')).toHaveText('战场环境');
    await page.screenshot({ path: 'artifacts/qa/combat-online-death.png', fullPage: true });
    await expect(page.locator('.combat-observe')).toBeEnabled({ timeout: 4000 });
    await expect(page.locator('.combat-hint')).toContainText('正在观察');
    await expect(page.locator('.combat-death')).toBeHidden({ timeout: 7000 });
    expect(p.life.alive).toBe(true);
  } finally { await page.goto('about:blank'); await server.close(); }
});
