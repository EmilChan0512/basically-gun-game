import { expect, test } from '@playwright/test';
import { startServer } from '../../server/server';
import { registerOnline } from '../helpers/online-account';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';
import { grantArmor } from '../../src/shared/simulation/growth-v3/DamageRules';
import { seededRandom } from '../../src/game/campaign/Battle';

test('illustrated upgrade cards retain keyboard focus during HUD updates and show compact build feedback', async ({ page }) => {
  const server = startServer(0); await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await registerOnline(page, 'HUD Pilot'); await page.locator('#create-growth').click(); await page.locator('#online-start').click();
    await expect(page.locator('#online-game')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.tactical-hud')).toBeVisible();
    const room = [...server.rooms.values()][0], battle = room.session!.battle;
    const participant = battle.growthV3!.participant(battle.player.id), growth = participant.progression;
    awardGrowthV3(growth, participant.loadout, 210, battle.frame, seededRandom(7));
    const choices = page.locator('.growth-cards [data-upgrade]'); await expect(choices).toHaveCount(3);
    const first = await choices.first().elementHandle(); await choices.first().focus();
    grantArmor(participant.armor, 15, 120, battle.frame, battle.player.id);
    awardGrowthV3(growth, participant.loadout, 10, battle.frame, seededRandom(8));
    await expect(page.locator('.growth-xp')).toContainText('220 XP');
    expect(await first!.evaluate(el => el.isConnected && document.activeElement === el)).toBe(true);
    await expect.poll(() => page.locator('.growth-card-art img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.screenshot({ path: 'artifacts/qa/battle-hud-growth-cards.png', fullPage: true });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: width === 1280 ? 720 : 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1280) await expect.poll(async () => { const box = await page.locator('.growth-choice-footer').boundingBox(); return box!.y + box!.height; }).toBeLessThanOrEqual(720);
      await page.screenshot({ path: `artifacts/qa/battle-hud-cards-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1050 });
    const surfaceBefore = await page.locator('#online-game canvas').boundingBox();
    await page.locator('[data-growth-toggle]').click(); await expect(choices).toHaveCount(0);
    expect(await page.locator('#online-game canvas').boundingBox()).toEqual(surfaceBefore);
    expect(surfaceBefore!.width).toBeGreaterThan(1400);
    expect(surfaceBefore!.height).toBeGreaterThan(1000);
    await page.screenshot({ path: 'artifacts/qa/battle-hud-deferred.png', fullPage: true });
    await page.locator('[data-growth-toggle]').click();
    const selected = await choices.first().getAttribute('data-upgrade'); await choices.first().click();
    await expect.poll(() => growth.selected).toContain(selected);
    await expect(page.locator('.growth-build-chip')).toHaveCount(1);
    await expect(page.locator('.growth-picks')).toContainText('1 / 4');
    await expect(choices).toHaveCount(0);
    await page.locator('#growth-leave').click();
    await expect(page.locator('#online-game')).toBeHidden();
    await expect(page.locator('.tactical-hud, .combat-feedback')).toHaveCount(0);
    await expect(page.locator('#growth-panel')).toBeHidden();
    await expect(page.locator('#create-growth')).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});
