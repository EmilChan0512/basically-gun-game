import { test, expect } from '@playwright/test';
import { registerTestAccount } from '../helpers/account-ui';

test('curated textures load in campaign and sandbox without missing assets', async ({ page }) => {
  const failures: string[] = [];
  page.on('response', r => { if (r.url().includes('/assets/reference/') && !r.ok()) failures.push(r.url()); });
  page.on('pageerror', e => failures.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__strikeCampaign);
  await registerTestAccount(page, 'Art Pilot');
  await page.getByRole('button', { name: '开始行动', exact: true }).click();
  await page.getByRole('button', { name: '进入战斗' }).click();
  await page.mouse.move(1000, 600);
  await page.waitForFunction(() => window.__strikeCampaign!.battle.frame > 5);
  expect(await page.evaluate(() => ['head', 'torso', 'm4', 'clouds', 'supply'].every(id => window.__strikeCampaign!.textures.exists(`ref-${id}`)))).toBe(true);
  await page.screenshot({ path: 'artifacts/qa/reference-battle.png' });
  await page.goto('/?rules=original');
  await page.waitForFunction(() => !!window.__originalStrike);
  await page.mouse.move(1000, 500);
  await page.keyboard.down('s');
  await page.waitForFunction(() => window.__originalStrike!.core.movement.crouching);
  await page.screenshot({ path: 'artifacts/qa/reference-crouch.png' });
  await page.keyboard.up('s');
  expect(failures).toEqual([]);
});
