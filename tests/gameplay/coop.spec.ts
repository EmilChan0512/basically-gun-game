import { test, expect } from '@playwright/test';
import { startServer } from '../../server/server';
import { COOP_RECORDS_KEY } from '../../src/client/session/CoopRecords';
test('a solo room starts cooperative waves and displays server spawned enemies', async ({ page }) => {
  const server = startServer(0); await new Promise<void>(r => server.wss.once('listening', r));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    const beforeStorage = await page.evaluate(() => ({ ...localStorage }));
    await page.locator('#create').click(); await expect(page.locator('#online-mode')).toBeVisible();
    await page.locator('#online-mode').selectOption('coop');
    await page.locator('#online-ready').click(); await expect(page.locator('#lobby')).not.toContainText('未准备');
    await page.locator('#online-start').click(); await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('#online-hud')).toContainText('团队复活2');
    await expect(page.locator('#online-hud')).toContainText('第1/3波');
    const battle = [...server.rooms.values()][0].session!.battle;
    expect(battle.actors.filter(a => a.human)).toHaveLength(1);
    expect(battle.actors.some(a => a.team === 2 && !a.human)).toBe(true);
    await page.locator('canvas').click(); await page.keyboard.press('q');
    await expect(page.locator('#online-hud')).toContainText('USP');
    await page.screenshot({ path: 'artifacts/qa/coop-online.png' });
    // Controlled terminal fixture verifies persistence only, not natural victory.
    battle.endMatch(1, 'Coop history fixture');
    await page.locator('#coop-history summary').click();
    await expect(page.locator('#coop-history')).toContainText('合作胜利');
    const rows = page.locator('#coop-history p').filter({ hasText: '合作胜利' });
    await expect(rows).toHaveCount(1);
    const saved = await page.evaluate(key => localStorage.getItem(key), COOP_RECORDS_KEY);
    expect(JSON.parse(saved!).entries).toHaveLength(1);
    [...server.wss.clients][0].terminate();
    await expect(page.locator('#status')).toContainText('连接已断开');
    await page.locator('#reconnect').click();
    await expect(page.locator('#status')).toContainText('蓝队获胜');
    await expect(rows).toHaveCount(1);
    expect(await page.evaluate(key => localStorage.getItem(key), COOP_RECORDS_KEY)).toBe(saved);
    await page.reload();
    await page.locator('#coop-history summary').click();
    await expect(rows).toHaveCount(1);
    const afterStorage = await page.evaluate(key => {
      const values = { ...localStorage }; delete values[key]; return values;
    }, COOP_RECORDS_KEY);
    expect(afterStorage).toEqual(beforeStorage);
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});
