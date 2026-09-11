import { test, expect } from '@playwright/test';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { startServer } from '../../server/server';
import { OnlineAccounts } from '../../server/OnlineAccounts';

test('admin searches users, previews and saves grants, handles conflicts, revokes rights and logs out', async ({ page }) => {
  const store = new OnlineAccounts(), account = await store.login('register', '测试玩家', 'player-password', 'fixture');
  await store.login('register', '其他玩家', 'player-password', 'fixture2');
  const salt = randomBytes(16).toString('hex');
  const server = startServer(0, '127.0.0.1', 50, undefined, 60000, false, store, false, { username: 'admin', salt, verifier: scryptSync('admin-test-password', salt, 64).toString('hex') });
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.wss.address() as { port: number }).port}`, errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(origin + '/admin/');
    await page.getByLabel('管理员账号').fill('admin'); await page.getByLabel('密码', { exact: true }).fill('admin-test-password');
    await page.getByRole('button', { name: '登录后台' }).click();
    await expect(page.locator('#total')).toHaveText('2 位用户');
    await page.locator('#query').fill('测试'); await page.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(page.locator('#total')).toHaveText('1 位用户'); await page.locator('.user').click();
    await page.getByRole('button', { name: '四职业满级' }).click(); await page.getByLabel('金币余额').fill('9999');
    await page.getByRole('button', { name: '授予全部装备' }).click(); await page.getByLabel('修改原因').fill('管理员端到端测试');
    await page.getByRole('button', { name: '预览并保存修改' }).click();
    await expect(page.locator('#summary')).toContainText('金币：350 → 9999');
    expect(store.profile(account.profile.id).credits).toBe(350);
    await page.getByRole('button', { name: '确认保存', exact: true }).click();
    await expect(page.locator('#notice')).toContainText('已保存到服务器');
    expect(store.profile(account.profile.id).weapons).toHaveLength(54);
    expect(store.profile(account.profile.id).classes.tank.xp).toBe(7840);
    await expect(page.locator('#audit')).toContainText('管理员修改');
    mkdirSync('artifacts/qa', { recursive: true });
    await page.screenshot({ path: 'artifacts/qa/admin-desktop.png', fullPage: true });
    // Simulate a reward arriving after this editor loaded: never overwrite it silently.
    store.settle('concurrent-reward', [{ accountId: account.profile.id, classId: 'medic', won: true, kills: 1 }]);
    await page.getByLabel('金币余额').fill('9'); await page.getByLabel('修改原因').fill('冲突测试');
    await page.getByRole('button', { name: '预览并保存修改' }).click(); await page.getByRole('button', { name: '确认保存', exact: true }).click();
    await expect(page.locator('#notice')).toContainText('资产已发生变化');
    expect(store.profile(account.profile.id).credits).toBeGreaterThan(9999);
    await page.getByRole('button', { name: '刷新用户' }).click();
    await expect(page.getByLabel('金币余额')).toHaveValue('10191');
    await page.getByRole('button', { name: '仅保留初始装备' }).click();
    await page.getByLabel('刺客等级').fill('1'); await page.getByLabel('修改原因').fill('收回测试权益');
    await page.getByRole('button', { name: '预览并保存修改' }).click(); await page.getByRole('button', { name: '确认保存', exact: true }).click();
    await expect(page.locator('#notice')).toContainText('已保存到服务器');
    expect(store.profile(account.profile.id).weapons).toHaveLength(5); expect(store.profile(account.profile.id).classes.assassin.xp).toBe(0);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'artifacts/qa/admin-mobile.png', fullPage: true });
    await page.reload(); await expect(page.locator('#app')).toBeVisible();
    await page.getByRole('button', { name: '退出登录' }).click(); await expect(page.locator('#loginPanel')).toBeVisible();
    expect((await page.request.get(origin + '/admin/api/users')).status()).toBe(401); expect(errors).toEqual([]);
  } finally { await page.goto('about:blank'); await server.close(); }
});
