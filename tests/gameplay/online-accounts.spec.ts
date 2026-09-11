import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../server/server';
import { OnlineAccounts } from '../../server/OnlineAccounts';
import { registerOnline, selectOnlineClass, equipOnline, openOnlineArmory, onlineLobby } from '../helpers/online-account';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';
import { freshOnlineProfile } from '../../src/shared/content/OnlineProgress';

test('explicit WS test compatibility permits login after the server version handshake', async ({ page }) => {
  const messages: any[] = [];
  await page.routeWebSocket('ws://game.example.test/', socket => {
    socket.onMessage(raw => {
      const message = JSON.parse(String(raw)); messages.push(message);
      if (message.type === 'auth') socket.send(JSON.stringify({ type: 'authenticated', token: 'a'.repeat(64), profile: freshOnlineProfile('test', 'Pilot') }));
    });
    socket.send(JSON.stringify({ type: 'welcome', protocol: 1, content: CONTENT_VERSION, playerId: 'test', allowInsecureAccounts: true }));
  });
  await page.goto('/?online'); await page.locator('#server').fill('ws://game.example.test/');
  await page.locator('#account-name').fill('Pilot'); await page.locator('#account-password').fill('test-password-123');
  await page.locator('#account-signin').click();
  await expect(page.locator('#account-status')).toContainText('Pilot · 金币 350');
  await expect(page.locator('#account-transport')).toContainText('WS 测试兼容模式');
  expect(messages.filter(m => m.type === 'auth')).toHaveLength(1);
});

test('browser blocks plaintext account credentials when the server has not opted into test compatibility', async ({ page }) => {
  const sent: string[] = [];
  await page.routeWebSocket('ws://game.example.test/', socket => {
    socket.onMessage(message => sent.push(String(message)));
    socket.send(JSON.stringify({ type: 'welcome', protocol: 1, content: CONTENT_VERSION, playerId: 'test' }));
  });
  await page.goto('/?online'); await page.locator('#server').fill('ws://game.example.test/');
  await page.locator('#account-name').fill('Pilot'); await page.locator('#account-password').fill('secret-password-123');
  await page.locator('#account-signin').click();
  await expect(page.locator('#status')).toContainText('WSS');
  expect(sent.some(message => message.includes('secret-password') || message.includes('"auth"'))).toBe(false);
});

test('pre-entry equipment, purchases, account isolation and saved progress survive server restart', async ({ browser }) => {
  const dir = mkdtempSync(join(tmpdir(), 'strike-online-ui-')), file = join(dir, 'accounts.json');
  let server = startServer(0, '127.0.0.1', 50, undefined, 60000, true, new OnlineAccounts(file));
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const port = (server.wss.address() as { port: number }).port;
  const context = await browser.newContext(), page = await context.newPage(); const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${port}`);
    await expect(page.locator('#online-armory-nav')).toBeVisible(); expect(server.rooms.size).toBe(1);
    await registerOnline(page, 'Alice');
    await selectOnlineClass(page, 'assassin');
    await expect(page.locator('#slot-skill')).toContainText('精准专注');
    await page.locator('#tab-skill').click(); await expect(page.locator('#equip-cloak')).toBeDisabled();
    await page.locator('#tab-primary').click(); await page.locator('#buy-vector').click();
    await expect(page.locator('#account-status')).toContainText('金币 150');
    await equipOnline(page, 'primary', 'vector'); await equipOnline(page, 'secondary', 'knife');
    await onlineLobby(page); await page.locator('#create').click();
    await expect(page.locator('#status')).toContainText('房间码');
    const room = [...server.rooms.values()].find(r => !r.debug)!;
    expect([...room.players.values()][0].equipment).toMatchObject({ classId: 'assassin', primary: 'vector', secondary: 'knife', skill: 'focus' });
    await page.locator('#online-leave').click(); await expect(page.locator('#online-loadout-brief')).toBeVisible();
    await onlineLobby(page); await page.locator('#account-logout').click(); await registerOnline(page, 'Bob');
    await expect(page.locator('#account-status')).toContainText('金币 350');
    await openOnlineArmory(page); await expect(page.locator('#class-medic')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#tab-primary').click(); await expect(page.locator('#buy-vector')).toBeEnabled(); await expect(page.locator('#equip-vector')).toHaveCount(0);
    await onlineLobby(page); await page.locator('#account-logout').click();
    await server.close();
    server = startServer(port, '127.0.0.1', 50, undefined, 60000, true, new OnlineAccounts(file));
    await new Promise<void>(resolve => server.wss.once('listening', resolve));
    await page.locator('#account-name').fill('Alice'); await page.locator('#account-password').fill('test-password-123');
    await page.locator('#account-signin').click();
    await expect(page.locator('#account-status')).toContainText('Alice · 金币 150');
    await openOnlineArmory(page); await expect(page.locator('#class-assassin')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#slot-primary')).toContainText('Vector'); await expect(page.locator('#slot-secondary')).toContainText('战术刀');
    await page.locator('#tab-primary').click();
    await onlineLobby(page); await page.goBack();
    await expect(page.locator('#online-preflight')).toBeVisible();
    await expect(page.locator('#tab-primary')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#slot-primary')).toContainText('Vector');
    await page.screenshot({ path: 'artifacts/qa/online-account-preflight.png', fullPage: true });
    await expect(page.locator('#online-preflight select')).toHaveCount(0);
    await expect(page.locator('.operator-art')).toBeVisible();
    await expect(page.locator('#online-gear-grid [role=img], #online-gear-grid img')).toHaveCount(6);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'artifacts/qa/online-armory-mobile.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await context.close(); await server.close(); rmSync(dir, { recursive: true, force: true }); }
});
